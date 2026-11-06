/**
 * Tarea 3 (rebranding a jombe.app) — Enrutamiento por host.
 *
 * La lógica vive aquí, pura y sin dependencias de Next, para poder probarla
 * en Vitest sin base de datos; `src/middleware.ts` solo la interpreta.
 *
 * Dos hosts, una sola instalación:
 * - `jombe.app` y `www.jombe.app` son la landing pública: solo sirven las
 *   rutas de marketing (`RUTAS_LANDING`), reescritas internamente a
 *   `/landing/...`. Cualquier otra ruta manda a la app con un 302.
 * - `crm.jombe.app` (y cualquier otro host en producción, p. ej.
 *   `api.jombe.app`) es la aplicación: si pide una ruta de marketing, la
 *   devuelve a la landing con un 302; el resto pasa tal cual.
 *
 * En desarrollo (`NODE_ENV !== "production"` o un host local) no hay reglas
 * de host: todo pasa y la landing se visita directo en `/landing`.
 */

/** Hosts que sirven la landing pública. */
export const HOSTS_LANDING: readonly string[] = ["jombe.app", "www.jombe.app"];

/** Host canónico de la aplicación. */
export const HOST_APP = "crm.jombe.app";

/** Rutas que la landing sirve por sí misma (con subrutas, salvo `/`). */
export const RUTAS_LANDING: readonly string[] = [
    "/",
    "/precios",
    "/features",
    "/blog",
    "/legal",
];

/** Prefijo interno donde viven las páginas de la landing. */
export const PREFIJO_LANDING = "/landing";

export type DecisionRuta =
    | { tipo: "pasar" }
    | { tipo: "reescritura"; destino: string }
    | { tipo: "redireccion"; destino: string };

/** Quita el puerto y baja a minúsculas: `CRM.jombe.app:3000` → `crm.jombe.app`. */
export function hostSinPuerto(host: string | null): string {
    if (!host) return "";
    return host.trim().toLowerCase().split(":")[0] ?? "";
}

/** Hosts locales: en ellos no mandan las reglas de producción. */
export function esHostDev(host: string): boolean {
    return (
        host === "localhost" ||
        host === "127.0.0.1" ||
        host === "0.0.0.0" ||
        host === "::1" ||
        host === "[::1]" ||
        host.endsWith(".localhost")
    );
}

export function esHostLanding(host: string): boolean {
    return HOSTS_LANDING.includes(host);
}

/**
 * ¿Es una ruta de la landing? `/` cuenta solo exacta; las demás aceptan
 * subrutas (`/blog/mi-post`) y toleran la barra final (`/precios/`).
 */
export function esRutaLanding(ruta: string): boolean {
    const limpia =
        ruta.length > 1 && ruta.endsWith("/") ? ruta.slice(0, -1) : ruta;
    return RUTAS_LANDING.some(
        (base) =>
            base === "/" ? limpia === "/" : limpia === base || limpia.startsWith(`${base}/`),
    );
}

/**
 * La decisión para un par (host, ruta). El middleware la traduce a `next()`,
 * `rewrite()` o `redirect()`; aquí no hay objetos de Next.
 */
export function decidirRuta(host: string, ruta: string): DecisionRuta {
    if (esHostDev(host) || host === "") return { tipo: "pasar" };

    if (esHostLanding(host)) {
        if (esRutaLanding(ruta)) {
            // `/` → `/landing`; `/precios` → `/landing/precios`.
            const destino =
                ruta === "/" || ruta === "/?" ? PREFIJO_LANDING : `${PREFIJO_LANDING}${ruta}`;
            return { tipo: "reescritura", destino };
        }
        // La landing no sirve la app: la manda a su host.
        return { tipo: "redireccion", destino: `https://${HOST_APP}${ruta}` };
    }

    // Host de la app (crm, api u otro): las rutas de marketing viven en la
    // landing; la raíz `/` NO — ahí decide `src/app/page.tsx` (sesión →
    // /onboarding o /inbox).
    if (ruta !== "/" && esRutaLanding(ruta)) {
        return { tipo: "redireccion", destino: `https://${HOSTS_LANDING[0]}${ruta}` };
    }
    return { tipo: "pasar" };
}
