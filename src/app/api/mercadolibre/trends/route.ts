import { withAuth } from "@/lib/api";
import { mlErrorResponse } from "@/server/mercadolibre/http";
import { obtenerTendencias } from "@/server/mercadolibre/trends";

export const dynamic = "force-dynamic";

/**
 * 069 — Las tendencias del sitio de la cuenta, con su análisis de IA.
 *
 * `?forzar=1` ignora el caché: es el botón «Actualizar» de la pantalla. Sin
 * cuenta conectada responde 409 `ml_sin_cuenta` para que la pantalla mande a
 * conectar, igual que el resto de las rutas de Mercado Libre.
 */
export const GET = withAuth(async (session, req: Request) => {
    const url = new URL(req.url);
    const forzar = url.searchParams.get("forzar") === "1";
    try {
        const resultado = await obtenerTendencias(session.organizationId, { forzar });
        if (!resultado) {
            return Response.json(
                {
                    error: {
                        code: "ml_sin_cuenta",
                        message: "Conecta tu cuenta de Mercado Libre para ver las tendencias.",
                    },
                },
                { status: 409 }
            );
        }
        return Response.json(resultado);
    } catch (err) {
        const mapped = mlErrorResponse(err);
        if (mapped) return mapped;
        throw err;
    }
});