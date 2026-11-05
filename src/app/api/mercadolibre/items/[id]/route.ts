import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { mlErrorResponse } from "@/server/mercadolibre/http";
import { actualizarPublicacion, getPublicacion } from "@/server/mercadolibre/items";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 068 — Una publicación por id. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    try {
        const item = await getPublicacion(session.organizationId, id);
        if (!item) return apiError(404, "not_found", "Esa publicación no existe en tu cuenta");
        return Response.json({ item, puedeEditar: canConfigure(session.role) });
    } catch (err) {
        const mapped = mlErrorResponse(err);
        if (mapped) return mapped;
        throw err;
    }
});

const CambioBody = z
    .object({
        price: z.number().finite().min(0).optional(),
        availableQuantity: z.number().int().min(0).optional(),
        status: z.enum(["active", "paused"]).optional(),
    })
    .refine(
        (v) =>
            v.price !== undefined ||
            v.availableQuantity !== undefined ||
            v.status !== undefined,
        { message: "No hay nada que cambiar" }
    );

/** 068 — Cambiar precio, stock o estado de una publicación. */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
    if (!canConfigure(session.role)) {
        return apiError(403, "forbidden", "Solo quien configura cambia las publicaciones");
    }
    const { id } = await ctx.params;
    const body = await parseBody(req, CambioBody);
    if (!body.ok) return body.response;
    try {
        const item = await actualizarPublicacion(session.organizationId, id, body.data);
        if (!item) return apiError(404, "not_found", "Esa publicación no existe en tu cuenta");
        return Response.json({ item });
    } catch (err) {
        const mapped = mlErrorResponse(err);
        if (mapped) return mapped;
        throw err;
    }
});