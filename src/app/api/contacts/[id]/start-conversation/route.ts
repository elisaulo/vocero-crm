import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getContactById } from "@/server/contacts";
import { getOrCreateConversation } from "@/server/inbox/ingest";
import { sendText, SendError } from "@/server/inbox/send";
import { isWindowOpen } from "@/server/inbox/window";
import {
  sendTemplate,
  TemplateError,
  templateErrorStatus,
} from "@/server/whatsapp/templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

// 2.7.7 — Evolution API (QR) no tiene la restricción de plantilla de Meta:
// a quien nunca ha escrito se le puede mandar texto libre directo.
const bodySchema = z.union([
  z.object({
    templateId: z.string().min(1),
    variables: z.array(z.string().trim().max(500)).max(10).optional(),
  }),
  z.object({
    message: z.string().trim().min(1).max(4096),
  }),
]);

/**
 * Abre la conversación con un contacto que NUNCA ha escrito (capturado
 * a mano). WhatsApp solo permite iniciar con plantilla aprobada; esa es una
 * regla de Meta, no del CRM.
 *
 * La conversación se crea AQUÍ y no al capturar el contacto: un hilo vacío
 * ensuciaría la Bandeja y rompería su orden por último mensaje.
 */
export const POST = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const contact = await getContactById(session.organizationId, id);
  if (!contact) return apiError(404, "not_found", "Contacto no encontrado");
  if (!contact.phone && !contact.waIdentity) {
    return apiError(422, "no_identity", "Este contacto no tiene a dónde escribir");
  }

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const existing = await db
    .select({ id: schema.conversation.id, lastInboundAt: schema.conversation.lastInboundAt })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        session.organizationId,
        eq(schema.conversation.contactId, id),
        eq(schema.conversation.isTest, false)
      )
    )
    .limit(1);

  // 2.7.7 — Evolution API: texto libre, sin plantilla y sin ventana.
  if ("message" in body.data) {
    const conversation =
      existing[0] ?? (await getOrCreateConversation(session.organizationId, id));
    try {
      const result = await sendText({
        organizationId: session.organizationId,
        conversationId: conversation.id,
        text: body.data.message,
      });
      return Response.json({
        messageId: result.messageId,
        conversationId: conversation.id,
      });
    } catch (err) {
      if (err instanceof SendError) {
        return apiError(409, err.code, err.message);
      }
      throw err;
    }
  }

  // Gastar una plantilla teniendo la ventana abierta es tirar dinero y
  // reputación de plantilla: se avisa en vez de enviarla.
  if (existing[0] && isWindowOpen(existing[0].lastInboundAt)) {
    return apiError(
      409,
      "window_open",
      "Esta persona te escribió hace menos de 24 h: puedes responderle directo desde la Bandeja, sin plantilla"
    );
  }

  const conversation =
    existing[0] ?? (await getOrCreateConversation(session.organizationId, id));

  try {
    const result = await sendTemplate({
      organizationId: session.organizationId,
      conversationId: conversation.id,
      templateId: body.data.templateId,
      variables: body.data.variables,
    });
    return Response.json({
      messageId: result.messageId,
      conversationId: conversation.id,
    });
  } catch (err) {
    if (err instanceof TemplateError) {
      return apiError(templateErrorStatus(err), err.code, err.message);
    }
    if (err instanceof SendError) {
      return apiError(409, err.code, err.message);
    }
    throw err;
  }
});
