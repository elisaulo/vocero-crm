import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { mlErrorResponse } from "@/server/mercadolibre/http";
import { crearFaq, listarFaqs } from "@/server/mercadolibre/questions";

export const dynamic = "force-dynamic";

/** 067 — Las respuestas aprendidas (FAQ) de la organización. */
export const GET = withAuth(async (session) => {
    return Response.json({
        faqs: await listarFaqs(session.organizationId),
        // La lista la ve todo el equipo; editarla, solo quien configura.
        puedeEditar: canConfigure(session.role),
    });
});

const FaqBody = z.object({
    question: z.string().trim().min(1),
    answer: z.string().trim().min(1),
    keywords: z.string().trim().optional().nullable(),
});

/** Crear una FAQ a mano, sin esperar a que la IA la aprenda de una pregunta. */
export const POST = withAuth(async (session, req: Request) => {
    if (!canConfigure(session.role)) {
        return apiError(403, "forbidden", "Solo quien configura administra las FAQ");
    }
    const body = await parseBody(req, FaqBody);
    if (!body.ok) return body.response;
    try {
        const faq = await crearFaq({
            organizationId: session.organizationId,
            question: body.data.question,
            answer: body.data.answer,
            keywords: body.data.keywords,
        });
        return Response.json({ faq }, { status: 201 });
    } catch (err) {
        const mapped = mlErrorResponse(err);
        if (mapped) return mapped;
        throw err;
    }
});