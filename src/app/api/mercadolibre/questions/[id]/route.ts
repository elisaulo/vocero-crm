import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { ML_ANSWER_MAX_CHARS } from "@/lib/mercadolibre/qa";
import { mlErrorResponse } from "@/server/mercadolibre/http";
import {
    aprobarBorrador,
    descartarPregunta,
    generarBorrador,
    getPregunta,
    responderPregunta,
    serializeQuestion,
} from "@/server/mercadolibre/questions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 067 — Una pregunta de publicación de Mercado Libre.
 *
 * `GET` la trae; `POST` hace una de las cuatro acciones de la pantalla:
 * `responder` (texto propio), `aprobar` (el borrador de la IA tal cual),
 * `descartar` (no se responde) y `borrador` (pedirle uno nuevo a la IA).
 * Responder y aprobar publican en ML: si ML rechaza, la pregunta no cambia.
 */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const row = await getPregunta(session.organizationId, id);
    if (!row) return apiError(404, "not_found", "Esa pregunta no existe");
    return Response.json({ pregunta: serializeQuestion(row) });
});

const AccionBody = z.discriminatedUnion("accion", [
    z.object({
        accion: z.literal("responder"),
        texto: z.string().trim().min(1).max(ML_ANSWER_MAX_CHARS),
    }),
    z.object({ accion: z.literal("aprobar") }),
    z.object({ accion: z.literal("descartar") }),
    z.object({ accion: z.literal("borrador") }),
]);

export const POST = withAuth(async (session, req: Request, ctx: Params) => {
    if (!canConfigure(session.role)) {
        return apiError(403, "forbidden", "Solo quien configura puede responder preguntas");
    }
    const { id } = await ctx.params;
    const body = await parseBody(req, AccionBody);
    if (!body.ok) return body.response;

    try {
        switch (body.data.accion) {
            case "responder": {
                const pregunta = await responderPregunta({
                    organizationId: session.organizationId,
                    id,
                    texto: body.data.texto,
                });
                return Response.json({ pregunta });
            }
            case "aprobar": {
                const pregunta = await aprobarBorrador({
                    organizationId: session.organizationId,
                    id,
                });
                return Response.json({ pregunta });
            }
            case "descartar": {
                const pregunta = await descartarPregunta({
                    organizationId: session.organizationId,
                    id,
                });
                return Response.json({ pregunta });
            }
            case "borrador": {
                const pregunta = await generarBorrador({
                    organizationId: session.organizationId,
                    id,
                });
                return Response.json({ pregunta });
            }
        }
    } catch (err) {
        const mapped = mlErrorResponse(err);
        if (mapped) return mapped;
        throw err;
    }
});