import { getOrCreateContactByIdentity } from "@/server/inbox/identity";
import { upsertFicha } from "@/server/bot/ficha";

/**
 * 067 — Contexto de pedido de Mercado Libre en la ficha del contacto.
 *
 * La orden llega por el topic `orders_v2` y lo que el operador necesita en la
 * bandeja es verla junto al hilo: qué compró, cuánto, en qué estado. La ficha
 * es exactamente para eso — datos que un sistema externo descubre del lead —
 * y por eso se escribe por `upsertFicha` y no a mano: es la ÚNICA puerta de
 * `contact.ficha` (guardarraíl en `tests/unit/ficha-guard.test.ts`), hereda el
 * merge campo a campo y no pisa lo que el cerebro o el dueño ya anotaron.
 *
 * Las claves van prefijadas `ml_` para convivir con lo que el bot aprenda por
 * conversación sin chocar.
 */

export type OrdenInput = {
    organizationId: string;
    /** Identidad del comprador: `ml:<buyerId>`. */
    identity: string;
    buyerNickname: string | null;
    orderId: string;
    status: string;
    /** Monto total en unidades mayores (ML lo manda como float). */
    totalAmount: number;
    currency: string;
    items: { title: string; quantity: number }[];
    createdAt: string;
};

/**
 * Guarda (o actualiza) el contexto de la orden y devuelve el contacto al que
 * pertenece. `null` si el contacto no se pudo resolver en esa organización.
 */
export async function guardarContextoDeOrden(
    input: OrdenInput
): Promise<{ contactId: string } | null> {
    const { contact } = await getOrCreateContactByIdentity(input.organizationId, {
        identity: input.identity,
        channel: "mercadolibre",
        phone: null,
        waUserId: null,
        // El nickname de ML es la mejor señal de nombre que hay; si no hay,
        // `getOrCreateContactByIdentity` pone su respaldo de canal.
        profileName: input.buyerNickname,
    });

    const items = input.items
        .filter((it) => it.title.trim())
        .map((it) =>
            it.quantity > 1 ? `${it.quantity}× ${it.title.trim()}` : it.title.trim()
        )
        .slice(0, 10)
        .join(", ");

    const resultado = await upsertFicha({
        organizationId: input.organizationId,
        contactId: contact.id,
        ficha: {
            ml_order_id: input.orderId,
            ml_order_status: input.status,
            ml_order_total: input.totalAmount,
            ml_order_currency: input.currency,
            ml_order_items: items || null,
            ml_order_created_at: input.createdAt,
        },
    });
    if (!resultado) return null;

    return { contactId: contact.id };
}
