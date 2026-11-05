import { apiError } from "@/lib/api";
import { MlApiError, MlOAuthError } from "@/lib/mercadolibre/client";
import { MlFaqError } from "@/server/mercadolibre/questions";

/**
 * 067 — Traduce lo que lanzan las preguntas y las FAQ a una respuesta HTTP.
 *
 * Las rutas de Mercado Libre no repiten el `switch`: un error de dominio
 * (`MlFaqError`) es 404 o 422, un rechazo de ML es 502 con el código de ML, y
 * un problema de OAuth es 409 `ml_reconnect` para que la pantalla mande a
 * reconectar. Devuelve `null` si el error no es de este módulo, para que
 * `withAuth` lo trate como un 500 normal.
 */
export function mlErrorResponse(err: unknown): Response | null {
    if (err instanceof MlFaqError) {
        return err.code === "not_found"
            ? apiError(404, "not_found", err.message)
            : apiError(422, "invalid", err.message);
    }
    if (err instanceof MlOAuthError) {
        return apiError(
            409,
            "ml_reconnect",
            "Mercado Libre rechazó la conexión: vuelve a conectar la cuenta"
        );
    }
    if (err instanceof MlApiError) {
        if (err.isAuthError) {
            return apiError(
                409,
                "ml_reconnect",
                "Mercado Libre rechazó la conexión: vuelve a conectar la cuenta"
            );
        }
        return apiError(
            502,
            "ml_api_error",
            `Mercado Libre respondió ${err.status}: ${err.message}`
        );
    }
    return null;
}