import { describe, expect, it } from "vitest";
import {
    ANALISIS_VACIO,
    ML_TRENDS_LIMIT,
    ML_TRENDS_TTL_MS,
    buildTrendAnalysisPrompt,
    cacheVencido,
    normalizarAnalisis,
    serializeTendencias,
    vencimientoDesde,
} from "@/lib/mercadolibre/trends";

describe("069 · serializeTendencias: lo que ML devuelve se vuelve una lista limpia", () => {
    it("una respuesta normal pasa con su palabra y su enlace", () => {
        const out = serializeTendencias([
            { keyword: "taladro", url: "https://ml/taladro" },
            { keyword: "martillo" },
        ]);
        expect(out).toEqual([
            { keyword: "taladro", url: "https://ml/taladro" },
            { keyword: "martillo", url: null },
        ]);
    });

    it("lo que no es un arreglo no rompe: devuelve lista vacía", () => {
        expect(serializeTendencias(null)).toEqual([]);
        expect(serializeTendencias(undefined)).toEqual([]);
        expect(serializeTendencias({ keyword: "x" })).toEqual([]);
        expect(serializeTendencias("taladro")).toEqual([]);
    });

    it("una palabra vacía o solo espacios se descarta", () => {
        const out = serializeTendencias([
            { keyword: "   " },
            { keyword: "" },
            { keyword: "  martillo  " },
        ]);
        expect(out).toEqual([{ keyword: "martillo", url: null }]);
    });

    it("una entrada sin keyword o que no es objeto se salta sin tumbar el resto", () => {
        const out = serializeTendencias([null, 42, { url: "https://ml/x" }, { keyword: "sierra" }]);
        expect(out).toEqual([{ keyword: "sierra", url: null }]);
    });

    it("repetidas se quedan una vez, sin importar mayúsculas, y en el orden de ML", () => {
        const out = serializeTendencias([
            { keyword: "Taladro" },
            { keyword: "martillo" },
            { keyword: "taladro" },
        ]);
        expect(out.map((t) => t.keyword)).toEqual(["Taladro", "martillo"]);
    });

    it("un url vacío o que no es texto queda en null", () => {
        const out = serializeTendencias([
            { keyword: "a", url: "" },
            { keyword: "b", url: 7 },
            { keyword: "c", url: "   " },
        ]);
        expect(out.map((t) => t.url)).toEqual([null, null, null]);
    });

    it(`nunca pasa de ${ML_TRENDS_LIMIT}: la pantalla no se llena de ruido`, () => {
        const muchas = Array.from({ length: ML_TRENDS_LIMIT + 15 }, (_, i) => ({
            keyword: `tema-${i}`,
        }));
        expect(serializeTendencias(muchas)).toHaveLength(ML_TRENDS_LIMIT);
    });
});

describe("069 · cacheVencido: el caché dura lo que dice su fecha", () => {
    const ahora = new Date("2026-01-01T12:00:00.000Z");

    it("sin fecha de vencimiento se da por vencido: mejor pedir que servir algo viejo", () => {
        expect(cacheVencido(null, ahora)).toBe(true);
    });

    it("una fecha pasada está vencida", () => {
        expect(cacheVencido(new Date("2026-01-01T11:59:59.000Z"), ahora)).toBe(true);
    });

    it("una fecha futura todavía sirve", () => {
        expect(cacheVencido(new Date("2026-01-01T12:00:01.000Z"), ahora)).toBe(false);
    });

    it("justo en el instante de vencimiento ya no sirve", () => {
        expect(cacheVencido(new Date(ahora.getTime()), ahora)).toBe(true);
    });
});

describe("069 · vencimientoDesde: seis horas desde que se pidió", () => {
    it("suma la ventana del caché a la fecha de la petición", () => {
        const desde = new Date("2026-01-01T00:00:00.000Z");
        expect(vencimientoDesde(desde).getTime()).toBe(desde.getTime() + ML_TRENDS_TTL_MS);
    });

    it("sin argumento parte de ahora", () => {
        const antes = Date.now();
        const vence = vencimientoDesde().getTime();
        expect(vence).toBeGreaterThanOrEqual(antes + ML_TRENDS_TTL_MS);
    });
});

describe("069 · normalizarAnalisis: la salida del modelo se acota antes de guardarse", () => {
    it("un análisis completo pasa tal cual", () => {
        const out = normalizarAnalisis({
            resumen: "Hay demanda de herramientas.",
            oportunidades: ["Taladros", "Sierras"],
            riesgos: ["Precios bajos"],
            ideas: [{ titulo: "Publicar taladros", porQue: "Se buscan mucho" }],
        });
        expect(out.resumen).toBe("Hay demanda de herramientas.");
        expect(out.oportunidades).toEqual(["Taladros", "Sierras"]);
        expect(out.riesgos).toEqual(["Precios bajos"]);
        expect(out.ideas).toEqual([{ titulo: "Publicar taladros", porQue: "Se buscan mucho" }]);
    });

    it("sin nada devuelve el análisis vacío, nunca undefined", () => {
        expect(normalizarAnalisis({})).toEqual(ANALISIS_VACIO);
    });

    it("el resumen se recorta a 500 caracteres", () => {
        const out = normalizarAnalisis({ resumen: "x".repeat(900) });
        expect(out.resumen).toHaveLength(500);
    });

    it("las listas se recortan a cinco entradas", () => {
        const out = normalizarAnalisis({
            oportunidades: ["a", "b", "c", "d", "e", "f", "g"],
            riesgos: ["1", "2", "3", "4", "5", "6"],
        });
        expect(out.oportunidades).toHaveLength(5);
        expect(out.riesgos).toHaveLength(5);
    });

    it("las entradas vacías de una lista se descartan", () => {
        const out = normalizarAnalisis({ oportunidades: ["  ", "taladros", ""] });
        expect(out.oportunidades).toEqual(["taladros"]);
    });

    it("una idea sin título o sin el porqué se descarta: media idea no sirve", () => {
        const out = normalizarAnalisis({
            ideas: [
                { titulo: "sin porqué" },
                { porQue: "sin título" },
                { titulo: "buena", porQue: "porque sí" },
            ],
        });
        expect(out.ideas).toEqual([{ titulo: "buena", porQue: "porque sí" }]);
    });

    it("acepta por_que en snake_case, que es como a veces lo devuelve el modelo", () => {
        const out = normalizarAnalisis({ ideas: [{ titulo: "x", por_que: "por esto" }] });
        expect(out.ideas).toEqual([{ titulo: "x", porQue: "por esto" }]);
    });

    it("las ideas también se recortan a cinco", () => {
        const ideas = Array.from({ length: 9 }, (_, i) => ({
            titulo: `idea-${i}`,
            porQue: "porque sí",
        }));
        expect(normalizarAnalisis({ ideas }).ideas).toHaveLength(5);
    });
});

describe("069 · buildTrendAnalysisPrompt: el prompt lleva el sitio, las tendencias y el contrato", () => {
    const prompt = buildTrendAnalysisPrompt({
        siteId: "MLM",
        trends: [
            { keyword: "taladro", url: null },
            { keyword: "martillo", url: "https://ml/martillo" },
        ],
        titles: ["Taladro 1/2 pulgada", "Martillo de uña"],
    });

    it("nombra el sitio de la cuenta", () => {
        expect(prompt.user).toContain("MLM");
    });

    it("incluye cada tendencia", () => {
        expect(prompt.user).toContain("taladro");
        expect(prompt.user).toContain("martillo");
    });

    it("incluye los títulos de las publicaciones para que la IA compare", () => {
        expect(prompt.user).toContain("Taladro 1/2 pulgada");
        expect(prompt.user).toContain("Martillo de uña");
    });

    it("pide el JSON con las cuatro llaves del contrato", () => {
        expect(prompt.system).toContain("resumen");
        expect(prompt.system).toContain("oportunidades");
        expect(prompt.system).toContain("riesgos");
        expect(prompt.system).toContain("ideas");
    });

    it("prohíbe inventar datos: el análisis se apoya solo en lo que se le da", () => {
        expect(prompt.system.toLowerCase()).toContain("no inventes");
    });

    it("sin publicaciones el prompt sigue armándose", () => {
        const solo = buildTrendAnalysisPrompt({
            siteId: "MLB",
            trends: [{ keyword: "bicicleta", url: null }],
            titles: [],
        });
        expect(solo.user).toContain("bicicleta");
        expect(solo.system.length).toBeGreaterThan(0);
    });
});