import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { mlErrorResponse } from "@/server/mercadolibre/http";
import { borrarFaq, editarFaq } from "@/server/mercadolibre/questions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const FaqPatchBody = z.object({
    question: z.string().trim().min(1).optional(),
    answer: z.string().trim().min(1).optional(),
    keywords: z.string().trim().optional().nullable(),
});

/** 067 — Editar una respuesta aprendida: solo quien configura. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
    if (!canConfigure(session.role)) {
        return apiError(403, "forbidden", "Solo quien configura administra las FAQ");
    }
    const { id } = await ctx.params;
    const body = await parseBody(req, FaqPatchBody);
    if (!body.ok) return body.response;
    try {
        const faq = await editarFaq({
            organizationId: session.organizationId,
            id,
            question: body.data.question,
            answer: body.data.answer,
            keywords: body.data.keywords,
        });
        return Response.json({ faq });
    } catch (err) {
        const mapped = mlErrorResponse(err);
        if (mapped) return mapped;
        throw err;
    }
});

/** Borrar: solo quien configura. */
export const DELETE = withAuth(async (session, _req: Request, ctx: Params) => {
    if (!canConfigure(session.role)) {
        return apiError(403, "forbidden", "Solo quien configura administra las FAQ");
    }
    const { id } = await ctx.params;
    await borrarFaq(session.organizationId, id);
    return new Response(null, { status: 204 });
});