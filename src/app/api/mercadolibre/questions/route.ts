import { apiError, withAuth } from "@/lib/api";
import { ML_QUESTION_STATUSES, type MlQuestionStatus } from "@/lib/mercadolibre/qa";
import { listarPreguntas } from "@/server/mercadolibre/questions";

export const dynamic = "force-dynamic";

/**
 * 067 — Las preguntas de las publicaciones de Mercado Libre.
 *
 * `?status=` filtra (unanswered, drafted, answered, ignored); sin él trae las
 * últimas 100. No es bandeja: no hay conversación ni ventana detrás.
 */
export const GET = withAuth(async (session, req: Request) => {
    const statusParam = new URL(req.url).searchParams.get("status");
    let status: MlQuestionStatus | undefined;
    if (statusParam) {
        if (!(ML_QUESTION_STATUSES as readonly string[]).includes(statusParam)) {
            return apiError(422, "invalid_status", "Ese estado de pregunta no existe");
        }
        status = statusParam as MlQuestionStatus;
    }
    return Response.json({
        preguntas: await listarPreguntas(session.organizationId, { status }),
    });
});
