import { ML_PREFIX } from "@/server/inbox/identity";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import { mlFetch } from "@/lib/mercadolibre/client";
import { getMlCredentialsByUserId } from "@/server/mercadolibre/credentials";
import { onLeadActivity } from "@/server/inbox/lead-activity";
import { sincronizarPipelineDeOrden } from "@/server/mercadolibre/pipeline";
import { guardarContextoDeOrden } from "@/server/mercadolibre/orden";
import { procesarPregunta } from "@/server/mercadolibre/questions";

/**
 * 067 — Entrada del canal de Mercado Libre.
 *
 * ML no entrega el mensaje en la notificación: manda un `topic` y un
 * `resource` (una URL relativa) y hay que ir a buscarlo con el token de la
 * cuenta. El normalizador es puro para poder probarlo sin red; lo que sí
 * llama a la API hace el viaje y entrega al núcleo de ingesta.
 *
 * Topics que importan:
 * - `messages`: un mensaje nuevo en el hilo de posventa de una orden.
 * - `orders_v2`: alta o cambio de una orden (contexto + arranque del pipeline).
 * - `questions`: una pregunta en una publicación (067). No es bandeja: vive en
 *   `ml_question` y su propia pantalla, con la IA y las FAQ aprendidas.
 *
 * El resto (`items`, `payments`…) se ignora aquí a propósito: `items` queda
 * para el bloque de publicaciones y stock.
 */

export type MlNotification = {
    topic: string;
    resource: string;
    userId: string;
};

/** Pura: la forma mínima que ML garantiza en toda notificación del topic. */
export function normalizeMlNotification(payload: unknown): MlNotification | null {
    const p = payload as {
        topic?: unknown;
        resource?: unknown;
        user_id?: unknown;
    } | null;
    if (!p || typeof p !== "object") return null;
    if (typeof p.topic !== "string" || !p.topic) return null;
    if (typeof p.resource !== "string" || !p.resource) return null;
    const userId =
        typeof p.user_id === "string"
            ? p.user_id
            : typeof p.user_id === "number"
                ? String(p.user_id)
                : null;
    if (!userId) return null;
    return { topic: p.topic, resource: p.resource, userId };
}

type MlMessage = {
    id: string;
    from: { user_id: number | string };
    text: { plain?: string } | string | null;
    message_date: { received?: string; created?: string } | string | null;
};

type MlMessagesPage = { messages?: MlMessage[] };

/** El id de orden que ML codifica en el `resource` de `messages`. */
function packIdDeResource(resource: string): string | null {
    const m = resource.match(/\/messages\/packs\/([^/]+)\//);
    return m?.[1] ?? null;
}

function textoDe(text: MlMessage["text"]): string | null {
    if (typeof text === "string") return text.trim() || null;
    if (text && typeof text === "object" && typeof text.plain === "string") {
        return text.plain.trim() || null;
    }
    return null;
}

function fechaDe(fecha: MlMessage["message_date"]): string {
    if (typeof fecha === "string") return fecha;
    const iso = fecha?.received ?? fecha?.created;
    return iso ?? new Date().toISOString();
}

/**
 * `topic = messages`: trae el pack completo cada vez (ML no entrega mensajes
 * sueltos). Se ingiere cada mensaje del comprador — la idempotencia por
 * `wa_message_id` hace que repetir la notificación no duplique nada.
 */
async function procesarMensajes(n: MlNotification): Promise<void> {
    const creds = await getMlCredentialsByUserId(n.userId);
    if (!creds) {
        console.warn(
            `[mercadolibre] notificación de mensajes para un vendedor sin conectar (${n.userId})`
        );
        return;
    }

    const packId = packIdDeResource(n.resource);
    if (!packId) return;

    const pagina = (await mlFetch(
        creds.organizationId,
        `${n.resource}?mark_as_read=false`
    )) as MlMessagesPage | null;
    const mensajes = pagina?.messages ?? [];

    for (const msg of mensajes) {
        // Lo que mandó el vendedor conectado sale por `inbox/send.ts`, no por aquí.
        if (String(msg.from.user_id) === creds.mlUserId) continue;

        const texto = textoDe(msg.text);
        if (!texto) continue; // ML también manda adjuntos: sin texto no hay nada que mostrar.

        await ingestInboundMessage({
            organizationId: creds.organizationId,
            identity: {
                identity: `${ML_PREFIX}${msg.from.user_id}`,
                channel: "mercadolibre",
                phone: null,
                waUserId: null,
                profileName: null,
            },
            // Prefijado para que no choque con el id de otro canal.
            waMessageId: `ml_${msg.id}`,
            type: "text",
            text: texto,
            timestamp: fechaDe(msg.message_date),
            threadRef: packId,
        });
    }
}

type MlOrder = {
    id: number | string;
    status: string;
    buyer: { id: number | string; nickname?: string };
    total_amount: number;
    currency_id: string;
    date_created: string;
    order_items?: { item: { title?: string }; quantity: number }[];
};

/**
 * `topic = orders_v2`: la orden nueva o su cambio de estado. Guarda el
 * contexto del pedido y empuja el pipeline — el mensaje del comprador, si lo
 * hay, llega por su propio topic (`messages`).
 */
async function procesarOrden(n: MlNotification): Promise<void> {
    const creds = await getMlCredentialsByUserId(n.userId);
    if (!creds) return;

    const orden = (await mlFetch(creds.organizationId, n.resource)) as MlOrder | null;
    if (!orden) return;

    const buyerId = String(orden.buyer.id);
    const identity = `${ML_PREFIX}${buyerId}`;

    const resultado = await guardarContextoDeOrden({
        organizationId: creds.organizationId,
        identity,
        buyerNickname: orden.buyer.nickname ?? null,
        orderId: String(orden.id),
        status: orden.status,
        totalAmount: orden.total_amount,
        currency: orden.currency_id,
        items: (orden.order_items ?? []).map((it) => ({
            title: it.item.title ?? "",
            quantity: it.quantity,
        })),
        createdAt: orden.date_created,
    });
    if (!resultado) return;

    await onLeadActivity(
        creds.organizationId,
        resultado.contactId,
        new Date(orden.date_created)
    );
    await sincronizarPipelineDeOrden({
        organizationId: creds.organizationId,
        contactId: resultado.contactId,
        orderStatus: orden.status,
    });
}

export async function processMlNotification(payload: unknown): Promise<void> {
    const n = normalizeMlNotification(payload);
    if (!n) return;

    switch (n.topic) {
        case "messages":
            return procesarMensajes(n);
        case "orders_v2":
            return procesarOrden(n);
        case "questions": {
            // 067 — la pregunta vive fuera de la bandeja: se resuelve la
            // organización por el vendedor y se delega al módulo de Q&A.
            const creds = await getMlCredentialsByUserId(n.userId);
            if (!creds) return;
            return procesarPregunta({
                organizationId: creds.organizationId,
                resource: n.resource,
            });
        }
        default:
            // `items`, `payments`… fuera de alcance de este bloque.
            return;
    }
}

/** Enrutado del webhook (047): a qué organización le toca esta notificación. */
export async function organizacionDeNotificacionMl(
    payload: unknown
): Promise<{ organizationId: string } | null> {
    const n = normalizeMlNotification(payload);
    if (!n) return null;
    const creds = await getMlCredentialsByUserId(n.userId);
    return creds ? { organizationId: creds.organizationId } : null;
}
