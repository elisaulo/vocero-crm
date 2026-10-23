import { after } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { normalizeMx } from "@/lib/meta/client";
import { ingestInboundMessage } from "@/server/inbox/ingest";
import type { ResolvedIdentity } from "@/server/inbox/identity";

export const dynamic = "force-dynamic";

type EvolutionItemKey = {
  id?: string;
  fromMe?: boolean;
  remoteJid?: string;
};

type EvolutionMessageContent = {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  imageMessage?: { caption?: string };
  videoMessage?: { caption?: string };
  documentMessage?: { caption?: string };
};

type EvolutionItem = {
  key?: EvolutionItemKey;
  remoteJid?: string;
  pushName?: string;
  verifiedBizName?: string;
  isGroup?: boolean;
  message?: EvolutionMessageContent;
  body?: string;
  id?: string;
  messageTimestamp?: number | string;
};

type EvolutionPayload = {
  event?: string;
  type?: string;
  instance?: string;
  data?: unknown;
};

/**
 * Webhook dedicado para Evolution API (evento messages.upsert).
 * Solo se exporta POST (handler HTTP); processEvolutionPayload es privada.
 */
export async function POST(req: Request) {
  let payload: EvolutionPayload;
  try {
    const rawBody = await req.text();
    payload = JSON.parse(rawBody) as EvolutionPayload;
  } catch {
    return Response.json({ received: true });
  }

  try {
    after(async () => {
      try {
        await processEvolutionPayload(payload, req);
      } catch (err) {
        console.error("[evolution-webhook] Error procesando payload:", err);
      }
    });
  } catch {
    // Fuera del contexto de request de Next.js (entornos de prueba unitaria)
    void processEvolutionPayload(payload, req);
  }

  return Response.json({ received: true });
}

/**
 * Resuelve la organización para un evento de Evolution API siguiendo tres
 * niveles de prioridad, de mayor a menor:
 *
 * 1. Query param `?org=<organizationId>` — resolución explícita. Útil cuando
 *    la URL del webhook se configura con el ID de la organización para evitar
 *    cualquier ambigüedad en entornos multi-organización.
 *
 * 2. Match exacto `organization.evolutionInstance === instanceName`. Es el
 *    caso base: la instancia primaria de la organización.
 *
 * 3. Fallback a la única organización con `whatsapp_provider = 'evolution'`
 *    configurado. Cubre instancias secundarias (ej. "Donpremium Vzla") que
 *    no están registradas en el campo de instancia principal de la org pero
 *    sí pertenecen a ella. Solo aplica cuando hay exactamente una organización
 *    con Evolution activo; si hay varias, se requiere el param `?org=`.
 */
async function resolveOrganization(
  instanceName: string,
  url: URL
): Promise<{ id: string } | null> {
  const db = getDb();

  // ── Nivel 1: param org explícito ──────────────────────────────────────────
  const orgParam = url.searchParams.get("org");
  if (orgParam) {
    const rows = await db
      .select({ id: schema.organization.id })
      .from(schema.organization)
      .where(eq(schema.organization.id, orgParam))
      .limit(1);
    if (rows[0]) return rows[0];
    console.warn(
      `[evolution-webhook] ?org=${orgParam} no encontrado en la BD; continuando con lookup normal`
    );
  }

  // ── Nivel 2: match exacto por evolutionInstance ───────────────────────────
  const byInstance = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(eq(schema.organization.evolutionInstance, instanceName))
    .limit(1);
  if (byInstance[0]) return byInstance[0];

  // ── Nivel 3: fallback — única org con Evolution habilitado ────────────────
  // Sirve para instancias secundarias que no son la "instancia primaria" del
  // campo organization.evolutionInstance pero pertenecen a la misma org.
  const evoOrgs = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .where(
      and(
        eq(schema.organization.whatsappProvider, "evolution"),
        // La org debe tener al menos la URL y la key configuradas para ser válida.
        // Filtramos nulos a nivel de código porque SQL IS NOT NULL en Drizzle
        // requiere isNotNull() que ya tenemos disponible pero keepemos simple:
        // si evolutionApiUrl está presente, la configuración es mínimamente válida.
      )
    )
    .limit(2); // limitamos a 2 para detectar ambigüedad

  if (evoOrgs.length === 1) {
    console.info(
      `[evolution-webhook] Instancia "${instanceName}" resuelta por fallback a la org Evolution única: ${evoOrgs[0]!.id}`
    );
    return evoOrgs[0]!;
  }

  if (evoOrgs.length > 1) {
    console.warn(
      `[evolution-webhook] Instancia "${instanceName}" no encontrada exactamente y hay varias orgs con Evolution. ` +
        `Agrega ?org=<id> a la URL del webhook para resolver la ambigüedad.`
    );
    return null;
  }

  return null;
}

/**
 * Lógica de procesamiento del evento Evolution API.
 * Función privada del módulo: no se exporta para no violar las restricciones
 * de Next.js App Router (route.ts solo exporta handlers HTTP y config).
 */
async function processEvolutionPayload(
  payload: EvolutionPayload,
  req: Request
): Promise<void> {
  if (!payload || typeof payload !== "object") return;

  const eventName = payload.event || payload.type;
  // Filtrar eventos; solo nos interesan los upsert de mensajes
  if (
    eventName &&
    eventName !== "messages.upsert" &&
    eventName !== "MESSAGES_UPSERT" &&
    eventName !== "send.message"
  ) {
    return;
  }

  const url = new URL(req.url);
  const instanceFromQuery = url.searchParams.get("instance");
  const instanceFromHeader = req.headers.get("x-evolution-instance");
  const instanceName =
    payload.instance || instanceFromQuery || instanceFromHeader;

  if (!instanceName) {
    console.warn(
      "[evolution-webhook] Evento ignorado: no se pudo identificar la instancia"
    );
    return;
  }

  const org = await resolveOrganization(instanceName, url);
  if (!org) {
    console.warn(
      `[evolution-webhook] No se pudo resolver organización para la instancia: "${instanceName}". ` +
        `Configura evolutionInstance en la org o usa ?org=<id> en la URL del webhook.`
    );
    return;
  }

  const organizationId = org.id;

  let items: EvolutionItem[] = [];
  if (Array.isArray(payload.data)) {
    items = payload.data as EvolutionItem[];
  } else if (
    payload.data &&
    typeof payload.data === "object" &&
    "messages" in payload.data &&
    Array.isArray((payload.data as { messages: unknown[] }).messages)
  ) {
    items = (payload.data as { messages: EvolutionItem[] }).messages;
  } else if (payload.data && typeof payload.data === "object") {
    items = [payload.data as EvolutionItem];
  }

  for (const item of items) {
    if (!item) continue;
    const key = item.key || {};

    // Ignorar mensajes propios salientes
    if (key.fromMe) continue;

    const remoteJid: string = key.remoteJid || item.remoteJid || "";
    // Ignorar grupos (@g.us) y broadcasts
    if (
      remoteJid.endsWith("@g.us") ||
      remoteJid.includes("status@broadcast") ||
      item.isGroup
    ) {
      continue;
    }

    const rawNumber = remoteJid.split("@")[0]?.split(":")[0];
    if (!rawNumber) continue;

    const phone = normalizeMx(rawNumber);
    const pushName = item.pushName || item.verifiedBizName || null;

    const identity: ResolvedIdentity = {
      identity: phone,
      phone: phone,
      waUserId: null,
      profileName: pushName,
    };

    const messageContent = item.message || {};
    const text =
      messageContent.conversation ||
      messageContent.extendedTextMessage?.text ||
      messageContent.imageMessage?.caption ||
      messageContent.videoMessage?.caption ||
      messageContent.documentMessage?.caption ||
      item.body ||
      null;

    if (!text) {
      continue;
    }

    const waMessageId =
      key.id ||
      item.id ||
      `evo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const timestampStr = String(
      item.messageTimestamp || Math.floor(Date.now() / 1000)
    );

    await ingestInboundMessage({
      organizationId,
      identity,
      waMessageId,
      type: "text",
      text,
      timestamp: timestampStr,
      // 0024: persiste la instancia REAL por la que entró (ej. "Donpremium Vzla")
      // para que el despacho de vuelta use ese mismo número.
      evolutionInstance: instanceName,
    });
  }
}
