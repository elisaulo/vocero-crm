import { getEnv } from "@/lib/env";
import {
    getMlCredentialsByOrg,
    markMlReconnectRequired,
    updateMlAccessToken,
    type MlCredentials,
} from "@/server/mercadolibre/credentials";

/**
 * Cliente HTTP de Mercado Libre.
 *
 * Frontera única de salida hacia la API de ML: fuera de este archivo nadie
 * sabe que Mercado Libre existe. Mismo patrón que los conectores de agenda
 * (zoom.ts / google.ts).
 *
 * LO IMPORTANTE — el refresh:
 *
 * Mercado Libre emite un access token de vida corta (6 h por omisión) y uno
 * de refresh de vida larga. Si el cliente usara el access token guardado sin
 * mirar la expiración, la primera llamada de la mañana fallaría con un 401
 * que el operador leería como «se cayó la conexión». Por eso `mlFetch`:
 *
 *  1. Si el token vence en menos de `REFRESH_MARGIN_MS`, lo refresca ANTES de
 *     la llamada.
 *  2. Si la API responde 401 pese a todo, refresca y reintenta UNA vez. Un
 *     401 en ML también significa «token expirado»; reintentar sin refrescar
 *     repetiría el mismo error.
 *  3. Si el refresh falla (invalid_grant), la credencial queda marcada como
 *     `reconnect_required` y el error lo dice: hay que reconectar, no
 *     reintentar.
 */

/** Margen antes de la expiración: refresca con tiempo de sobra. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export class MlApiError extends Error {
    readonly status: number;
    readonly body: string;

    constructor(message: string, status: number, body: string) {
        super(message);
        this.name = "MlApiError";
        this.status = status;
        this.body = body;
    }

    /** true si el error es de credenciales (hay que reconectar). */
    get isAuthError(): boolean {
        return this.status === 401 || this.status === 403;
    }
}

/** Error de la conexión OAuth: no hay app configurada, o el código no sirve. */
export class MlOAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "MlOAuthError";
    }
}

/* ------------------------------------------------------------------ *
 * OAuth
 * ------------------------------------------------------------------ */

export type MlTokenResponse = {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    user_id: string;
    refresh_token: string;
};

/** La app OAuth del negocio: sin esto no hay conexión posible. */
export function mlClientId(): string {
    const id = getEnv().ML_CLIENT_ID;
    if (!id) {
        throw new MlOAuthError(
            "ML_CLIENT_ID no está configurado: la conexión con Mercado Libre está apagada"
        );
    }
    return id;
}

export function mlClientSecret(): string {
    const secret = getEnv().ML_CLIENT_SECRET;
    if (!secret) {
        throw new MlOAuthError(
            "ML_CLIENT_SECRET no está configurado: la conexión con Mercado Libre está apagada"
        );
    }
    return secret;
}

/** ¿La instancia tiene la app OAuth configurada? Lo decide la UI. */
export function isMlConfigured(): boolean {
    const env = getEnv();
    return Boolean(env.ML_CLIENT_ID && env.ML_CLIENT_SECRET);
}

/**
 * La URL a la que se manda al dueño para autorizar la app.
 *
 * El `redirect_uri` es EXACTAMENTE el que se registrará en el panel de ML:
 * si no coinciden byte a byte, ML rechaza el canje con `invalid_request`.
 */
export function mlAuthorizeUrl(state: string): string {
    const base = getEnv().APP_BASE_URL.replace(/\/+$/, "");
    const params = new URLSearchParams({
        response_type: "code",
        client_id: mlClientId(),
        redirect_uri: `${base}/api/settings/mercadolibre/callback`,
        state,
    });
    return `${getEnv().ML_OAUTH_BASE_URL}/authorization?${params.toString()}`;
}

/** Canje del código de autorización por los tokens. */
export async function mlExchangeCode(code: string): Promise<MlTokenResponse> {
    const base = getEnv().APP_BASE_URL.replace(/\/+$/, "");
    const res = await fetch(`${getEnv().ML_OAUTH_BASE_URL}/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            client_id: mlClientId(),
            client_secret: mlClientSecret(),
            redirect_uri: `${base}/api/settings/mercadolibre/callback`,
        }).toString(),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new MlOAuthError(
            `Mercado Libre rechazó el código de autorización: ${detail}`
        );
    }

    const data = (await res.json().catch(() => null)) as Partial<MlTokenResponse> | null;
    if (
        !data?.access_token ||
        !data.refresh_token ||
        !data.user_id ||
        typeof data.expires_in !== "number"
    ) {
        throw new MlOAuthError("Mercado Libre no devolvió una respuesta de token completa");
    }
    return data as MlTokenResponse;
}

/** Renueva el access token con el refresh token. */
export async function mlRefreshToken(
    refreshToken: string
): Promise<MlTokenResponse> {
    const res = await fetch(`${getEnv().ML_OAUTH_BASE_URL}/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: mlClientId(),
            client_secret: mlClientSecret(),
        }).toString(),
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new MlOAuthError(
            `Mercado Libre rechazó el refresh token: ${detail}. Vuelve a conectar la cuenta.`
        );
    }

    const data = (await res.json().catch(() => null)) as Partial<MlTokenResponse> | null;
    if (!data?.access_token || typeof data.expires_in !== "number") {
        throw new MlOAuthError("Mercado Libre no devolvió un token renovado");
    }
    return {
        access_token: data.access_token,
        token_type: data.token_type ?? "Bearer",
        expires_in: data.expires_in,
        scope: data.scope ?? "",
        user_id: data.user_id ?? "",
        // ML puede no devolver un refresh token nuevo: el viejo sigue válido.
        refresh_token: data.refresh_token ?? refreshToken,
    };
}

/* ------------------------------------------------------------------ *
 * El cliente
 * ------------------------------------------------------------------ */

/** Datos del usuario vendedor, para el nombre de la cuenta. */
export type MlUser = {
    id: number;
    nickname: string | null;
    /**
     * 069 — El sitio del vendedor (`MLM`, `MLB`, `MLA`…). Las tendencias y las
     * visitas de ML se piden por sitio, no por usuario: sin él no hay con qué
     * armar la ruta. Puede faltar en cuentas viejas o respuestas raras.
     */
    siteId: string | null;
};

export async function mlMe(accessToken: string): Promise<MlUser | null> {
    const res = await fetch(`${getEnv().ML_API_BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
        | { id?: number; nickname?: string | null; site_id?: string | null }
        | null;
    if (!data?.id) return null;
    return {
        id: data.id,
        nickname: typeof data.nickname === "string" ? data.nickname : null,
        siteId: typeof data.site_id === "string" && data.site_id ? data.site_id : null,
    };
}

async function refrescar(creds: MlCredentials): Promise<string> {
    try {
        const nuevo = await mlRefreshToken(creds.refreshToken);
        await updateMlAccessToken(
            creds.id,
            nuevo.access_token,
            new Date(Date.now() + nuevo.expires_in * 1000)
        );
        return nuevo.access_token;
    } catch (err) {
        // El refresh token ya no sirve: hay que reconectar a mano. Se marca la
        // credencial para que la UI lo diga, en vez de fallar en silencio.
        await markMlReconnectRequired(creds.organizationId);
        throw err;
    }
}

function porVencer(creds: MlCredentials): boolean {
    return creds.tokenExpiresAt.getTime() - Date.now() <= REFRESH_MARGIN_MS;
}

/**
 * La llamada a la API de ML de la organización.
 *
 * `path` es relativo a la base de la API: `"/items/MLB123"`.
 */
export async function mlFetch(
    organizationId: string,
    path: string,
    init: RequestInit & { allow404?: boolean } = {}
): Promise<unknown> {
    const creds = await getMlCredentialsByOrg(organizationId);
    if (!creds) {
        throw new MlOAuthError(
            "Esta organización no tiene ninguna cuenta de Mercado Libre conectada"
        );
    }
    if (creds.status === "reconnect_required") {
        throw new MlOAuthError(
            "La conexión con Mercado Libre está vencida: vuelve a conectar la cuenta"
        );
    }

    let token = creds.accessToken;
    if (porVencer(creds)) {
        token = await refrescar(creds);
    }

    const url = `${getEnv().ML_API_BASE_URL}${path}`;
    const attempt = async (bearer: string): Promise<Response> => {
        try {
            return await fetch(url, {
                ...init,
                headers: {
                    Authorization: `Bearer ${bearer}`,
                    "content-type": "application/json",
                    ...(init.headers ?? {}),
                },
            });
        } catch (err) {
            throw new MlApiError(
                `No se pudo contactar a Mercado Libre: ${err}`,
                0,
                ""
            );
        }
    };

    let res = await attempt(token);

    // Un 401 con un token aparentemente vigente significa «el token expiró»:
    // se refresca y se reintenta UNA vez. Dos, y es un bucle.
    if (res.status === 401) {
        token = await refrescar(creds);
        res = await attempt(token);
    }

    if (res.status === 404 && init.allow404) return null;
    if (res.status === 204) return null;

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new MlApiError(
            `Mercado Libre respondió ${res.status}: ${body}`,
            res.status,
            body
        );
    }
    return await res.json().catch(() => null);
}
