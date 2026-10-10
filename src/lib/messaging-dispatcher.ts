import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { publish } from "@/server/events/bus";
import { SendError, sendText as sendMetaText } from "@/server/inbox/send";
import { sendEvolutionText } from "@/lib/evolution";
import { serializeMessage } from "@/server/inbox/ingest";

export type DispatchMessageInput = {
  conversationId: string;
  organizationId: string;
  text: string;
  aiGenerated?: boolean;
};

export type DispatchMessageResult = {
  messageId: string;
  provider: "meta" | "evolution";
};

/**
 * Despachador Unificado: bifurca la salida hacia Meta Cloud API o Evolution API
 * según la configuración activa de la organización (`whatsapp_provider`).
 */
export async function dispatchSendMessage(
  input: DispatchMessageInput
): Promise<DispatchMessageResult> {
  const db = getDb();

  const orgs = await db
    .select()
    .from(schema.organization)
    .where(eq(schema.organization.id, input.organizationId))
    .limit(1);

  const org = orgs[0];
  const provider = org?.whatsappProvider ?? "meta";

  if (provider === "evolution") {
    if (
      !org?.evolutionApiUrl ||
      !org?.evolutionApiKey ||
      !org?.evolutionInstance
    ) {
      throw new SendError(
        "not_connected",
        "Configuración de Evolution API incompleta. Ingresa la URL, API Key e Instancia en Ajustes → WhatsApp."
      );
    }

    const rows = await db
      .select({
        conversation: schema.conversation,
        contact: schema.contact,
      })
      .from(schema.conversation)
      .innerJoin(
        schema.contact,
        eq(schema.conversation.contactId, schema.contact.id)
      )
      .where(eq(schema.conversation.id, input.conversationId))
      .limit(1);

    const row = rows[0];
    if (!row || row.conversation.organizationId !== input.organizationId) {
      throw new SendError("meta_error", "Conversación no encontrada");
    }

    if (row.conversation.isTest) {
      throw new SendError(
        "sandbox_violation",
        "Conversación de prueba del Laboratorio: el envío real está prohibido"
      );
    }

    const recipient = row.contact.phone || row.contact.waIdentity;
    if (!recipient) {
      throw new SendError(
        "meta_error",
        "El contacto no tiene teléfono o identidad utilizable para WhatsApp"
      );
    }

    const res = await sendEvolutionText({
      config: {
        apiUrl: org.evolutionApiUrl,
        apiKey: org.evolutionApiKey,
        instance: org.evolutionInstance,
      },
      recipient,
      text: input.text,
    });

    if (!res.ok) {
      throw new SendError(
        "meta_error",
        res.error || "Error al enviar mensaje mediante Evolution API"
      );
    }

    const waMessageId = res.messageId ?? `evo_out_${Date.now()}`;

    const inserted = await db
      .insert(schema.message)
      .values({
        id: newId("message"),
        organizationId: input.organizationId,
        conversationId: input.conversationId,
        waMessageId,
        provider: "evolution",
        externalMessageId: res.messageId ?? null,
        direction: "out",
        type: "text",
        text: input.text,
        status: "sent",
        aiGenerated: input.aiGenerated ?? false,
        origin: input.aiGenerated ? "ai" : "operator",
      })
      .returning();

    const message = inserted[0]!;

    await db
      .update(schema.conversation)
      .set({ lastMessageAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.conversation.id, input.conversationId));

    publish(input.organizationId, {
      type: "message.new",
      data: {
        conversationId: input.conversationId,
        message: serializeMessage(message, null),
      },
    });

    return { messageId: message.id, provider: "evolution" };
  }

  // Meta Cloud API (default)
  const res = await sendMetaText(input);
  return { messageId: res.messageId, provider: "meta" };
}
