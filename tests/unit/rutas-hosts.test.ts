import { describe, expect, it } from "vitest";
import {
    decidirRuta,
    esHostDev,
    esRutaLanding,
    hostSinPuerto,
    HOST_APP,
    HOSTS_LANDING,
    PREFIJO_LANDING,
    RUTAS_LANDING,
} from "@/lib/rutas-hosts";

/**
 * Tarea 3 (rebranding a jombe.app) — Enrutamiento por host.
 * La lógica vive en `src/lib/rutas-hosts.ts` (pura); el middleware solo la
 * interpreta. Aquí se prueban las decisiones, no objetos de Next.
 */
describe("Tarea 3 — enrutamiento por host (jombe.app)", () => {
    describe("hostSinPuerto", () => {
        it("quita el puerto y normaliza a minúsculas", () => {
            expect(hostSinPuerto("CRM.jombe.app:3000")).toBe("crm.jombe.app");
            expect(hostSinPuerto("  jombe.app ")).toBe("jombe.app");
        });

        it("sin host devuelve cadena vacía (no lanza)", () => {
            expect(hostSinPuerto(null)).toBe("");
        });
    });

    describe("esHostDev", () => {
        it("reconoce localhost en sus formas", () => {
            expect(esHostDev("localhost")).toBe(true);
            expect(esHostDev("127.0.0.1")).toBe(true);
            expect(esHostDev("0.0.0.0")).toBe(true);
            expect(esHostDev("::1")).toBe(true);
            expect(esHostDev("[::1]")).toBe(true);
            expect(esHostDev("app.localhost")).toBe(true);
        });

        it("los hosts reales no son dev", () => {
            expect(esHostDev("jombe.app")).toBe(false);
            expect(esHostDev("crm.jombe.app")).toBe(false);
        });
    });

    describe("esRutaLanding", () => {
        it("las rutas de marketing cuentan, con y sin barra final", () => {
            for (const ruta of RUTAS_LANDING) {
                expect(esRutaLanding(ruta)).toBe(true);
                if (ruta !== "/") expect(esRutaLanding(`${ruta}/`)).toBe(true);
            }
        });

        it("acepta subrutas de marketing", () => {
            expect(esRutaLanding("/blog/mi-post")).toBe(true);
            expect(esRutaLanding("/legal/privacidad")).toBe(true);
        });

        it("las rutas de la app no son de la landing", () => {
            expect(esRutaLanding("/inbox")).toBe(false);
            expect(esRutaLanding("/login")).toBe(false);
            expect(esRutaLanding("/dashboard")).toBe(false);
            expect(esRutaLanding("/precios-otros")).toBe(false);
            expect(esRutaLanding("/api/webhooks/wa/x")).toBe(false);
        });
    });

    describe("decidirRuta en la landing (jombe.app / www.jombe.app)", () => {
        it("la raíz se reescribe al prefijo interno", () => {
            expect(decidirRuta("jombe.app", "/")).toEqual({
                tipo: "reescritura",
                destino: PREFIJO_LANDING,
            });
        });

        it("cada ruta de marketing se reescribe a su página interna", () => {
            expect(decidirRuta("www.jombe.app", "/precios")).toEqual({
                tipo: "reescritura",
                destino: `${PREFIJO_LANDING}/precios`,
            });
            expect(decidirRuta("jombe.app", "/blog/mi-post")).toEqual({
                tipo: "reescritura",
                destino: `${PREFIJO_LANDING}/blog/mi-post`,
            });
        });

        it("una ruta de la app manda a crm.jombe.app con la ruta intacta", () => {
            expect(decidirRuta("jombe.app", "/inbox")).toEqual({
                tipo: "redireccion",
                destino: `https://${HOST_APP}/inbox`,
            });
            expect(decidirRuta("www.jombe.app", "/login?next=/inbox")).toEqual({
                tipo: "redireccion",
                destino: `https://${HOST_APP}/login?next=/inbox`,
            });
        });
    });

    describe("decidirRuta en la app (crm.jombe.app)", () => {
        it("la raíz pasa: la decide src/app/page.tsx con sesión", () => {
            expect(decidirRuta("crm.jombe.app", "/")).toEqual({ tipo: "pasar" });
        });

        it("las rutas de la app pasan tal cual", () => {
            expect(decidirRuta("crm.jombe.app", "/inbox")).toEqual({ tipo: "pasar" });
            expect(decidirRuta("crm.jombe.app", "/settings/whatsapp")).toEqual({
                tipo: "pasar",
            });
        });

        it("una ruta de marketing vuelve a la landing", () => {
            expect(decidirRuta("crm.jombe.app", "/precios")).toEqual({
                tipo: "redireccion",
                destino: `https://${HOSTS_LANDING[0]}/precios`,
            });
        });

        it("cualquier otro host de producción se comporta como la app", () => {
            expect(decidirRuta("api.jombe.app", "/inbox")).toEqual({ tipo: "pasar" });
            expect(decidirRuta("api.jombe.app", "/blog")).toEqual({
                tipo: "redireccion",
                destino: "https://jombe.app/blog",
            });
        });
    });

    describe("desarrollo: sin reglas de host", () => {
        it("localhost pasa siempre, sea cual sea la ruta", () => {
            expect(decidirRuta("localhost", "/")).toEqual({ tipo: "pasar" });
            expect(decidirRuta("localhost:3000", "/inbox")).toEqual({ tipo: "pasar" });
            expect(decidirRuta("127.0.0.1", "/precios")).toEqual({ tipo: "pasar" });
        });

        it("un host vacío pasa (no hay de qué decidir)", () => {
            expect(decidirRuta("", "/inbox")).toEqual({ tipo: "pasar" });
        });
    });
});
