import { after } from "next/server";
import { eq } from "drizzle-orm";
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

  const db = getDb();
  const orgs = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.evolutionInstance, instanceName))
    .limit(1);

  const org = orgs[0];
  if (!org) {
    console.warn(
      `[evolution-webhook] Instancia no configurada en ninguna organización: ${instanceName}`
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
      // 0024: persiste la instancia por la que entró para el despacho de vuelta.
      evolutionInstance: instanceName,
    });

  }
}
