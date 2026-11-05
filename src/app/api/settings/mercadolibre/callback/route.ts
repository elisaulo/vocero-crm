import { requireSession } from "@/lib/auth/session";
import { saveMlCredentials } from "@/server/mercadolibre/credentials";
import { mlExchangeCode, mlMe } from "@/lib/mercadolibre/client";

export const dynamic = "force-dynamic";

/**
 * 067 — Callback del OAuth de Mercado Libre.
 *
 * ML redirige aquí con `code` (y el `state` que le mandamos al armar la URL
 * de autorización) tras que el dueño autoriza la app en mercadolibre.com. No
 * pasa por `withAuth` porque es ML quien llega, no un fetch con sesión: la
 * sesión se exige igual, leyéndola directo, para que el `code` quede atado a
 * quien abrió el flujo y no a un tercero que adivine la URL.
 *
 * `state` es el id de la organización, dado que `requireSession()` ya lo
 * confirma contra la sesión activa: si no coinciden, no se guarda nada.
 */
export async function GET(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    const volver = (query: string) =>
        Response.redirect(new URL(`/settings/mercadolibre?${query}`, url.origin), 302);

    if (errorParam) {
        return volver("ml_error=autorizacion_rechazada");
    }
    if (!code || !state) {
        return volver("ml_error=callback_incompleto");
    }

    let session;
    try {
        session = await requireSession();
    } catch {
        return volver("ml_error=sin_sesion");
    }

    if (state !== session.organizationId) {
        return volver("ml_error=estado_invalido");
    }

    try {
        const token = await mlExchangeCode(code);
        const usuario = await mlMe(token.access_token);

        await saveMlCredentials({
            organizationId: session.organizationId,
            mlUserId: token.user_id,
            nickname: usuario?.nickname ?? null,
            // 069 — el sitio (`MLM`, `MLB`…) es lo que piden las tendencias.
            siteId: usuario?.siteId ?? null,
            accessToken: token.access_token,
            refreshToken: token.refresh_token,
            tokenExpiresAt: new Date(Date.now() + token.expires_in * 1000),
            scope: token.scope ?? null,
        });
    } catch {
        return volver("ml_error=canje_fallido");
    }

    return volver("ml_conectado=1");
}
