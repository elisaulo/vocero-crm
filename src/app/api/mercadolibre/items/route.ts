import { withAuth } from "@/lib/api";
import { canConfigure } from "@/lib/auth/roles";
import { mlErrorResponse } from "@/server/mercadolibre/http";
import { listarPublicaciones } from "@/server/mercadolibre/items";

export const dynamic = "force-dynamic";

/**
 * 068 — Las publicaciones del vendedor, con su stock y su precio.
 * La lista la ve todo el equipo; cambiarla, solo quien configura.
 */
export const GET = withAuth(async (session, req: Request) => {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    try {
        const { items, total } = await listarPublicaciones(session.organizationId, {
            limit: Number.isFinite(limit) ? limit : 50,
            offset: Number.isFinite(offset) ? offset : 0,
        });
        return Response.json({ items, total, puedeEditar: canConfigure(session.role) });
    } catch (err) {
        const mapped = mlErrorResponse(err);
        if (mapped) return mapped;
        throw err;
    }
});