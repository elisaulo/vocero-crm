import { NextResponse, type NextRequest } from "next/server";
import { decidirRuta, esHostDev, hostSinPuerto } from "@/lib/rutas-hosts";

/**
 * Tarea 3 (rebranding a jombe.app) — Enrutamiento por host.
 *
 * Una sola instalación Next sirve dos superficies:
 * - `jombe.app` / `www.jombe.app`: la landing pública. Las rutas de marketing
 *   se reescriben internamente a `/landing/...` (no hay dos páginas para la
 *   misma ruta); cualquier otra ruta sale con un 302 hacia `crm.jombe.app`.
 * - `crm.jombe.app` (y cualquier otro host en producción): la aplicación. Si
 *   pide una ruta de marketing, vuelve a la landing con un 302.
 *
 * La raíz `/` en el host de la app NO se toca aquí: `src/app/page.tsx` ya
 * decide con sesión (guía de inicio → `/onboarding`, si no `/inbox`, y sin
 * sesión el middleware de auth manda a `/login`). El middleware corre en
 * Edge: no toca la base de datos ni la sesión, solo el header `host`.
 *
 * En desarrollo (`NODE_ENV !== "production"` o un host local) no hay reglas:
 * todo pasa y la landing se visita directo en `/landing`.
 */
export function middleware(request: NextRequest) {
    const host = hostSinPuerto(request.headers.get("host"));
    if (esHostDev(host)) return NextResponse.next();

    const decision = decidirRuta(host, request.nextUrl.pathname);
    const search = request.nextUrl.search;
    switch (decision.tipo) {
        case "pasar":
            return NextResponse.next();
        case "reescritura":
            return NextResponse.rewrite(new URL(`${decision.destino}${search}`, request.url));
        case "redireccion":
            return NextResponse.redirect(new URL(`${decision.destino}${search}`, request.url));
    }
}

/*
 * Se excluyen del middleware lo que ningún host debe reescribir: la API
 * (webhooks de Meta, Evolution y Zernio llegan por host de app y un 302 los
 * rompería), los estáticos de Next y los archivos públicos de la PWA.
 */
export const config = {
    matcher: [
        "/((?!api/|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|robots.txt|sitemap.xml|icons/).*)",
    ],
};
