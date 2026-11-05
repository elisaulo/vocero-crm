/**
 * 069 — Lo puro de las tendencias de Mercado Libre.
 *
 * Aquí no hay base de datos ni red: solo las decisiones que una prueba puede
 * fijar sin levantar nada. Lo usan la pantalla de Tendencias, la API y el
 * servicio del servidor, así que no puede importar nada de `src/server/`.
 */

/** Una tendencia tal como la enseña la pantalla. */
export type MlTrendDto = {
    /** La palabra o frase que está buscando la gente en el sitio. */
    keyword: string;
    /** A dónde lleva la tendencia en ML, si vino con URL. */
    url: string | null;
};

/** Lo que devuelve `/trends/{site}`: una lista de `{ keyword, url }`. */
type MlTrendPayload = { keyword?: string | null; url?: string | null };

/**
 * Cuánto vive el caché. Las tendencias de ML cambian despacio —días, no
 * minutos— y su API es de las que se limitan rápido: pedirlas cada vez que
 * alguien abre la pantalla es gastar cuota para enseñar lo mismo.
 */
export const ML_TRENDS_TTL_MS = 6 * 60 * 60 * 1000;

/** El máximo de tendencias que se piden y se enseñan. */
export const ML_TRENDS_LIMIT = 30;

/**
 * El JSON crudo de ML → DTOs planos.
 *
 * Tolera basura: entradas sin `keyword`, `keyword` vacío, tipos raros. La
 * pantalla nunca debe recibir una fila en blanco ni un `undefined` disfrazado.
 * Deduplica por palabra, respetando el orden que dio ML (que ya viene por
 * popularidad).
 */
export function serializeTendencias(payload: unknown): MlTrendDto[] {
    if (!Array.isArray(payload)) return [];
    const vistos = new Set<string>();
    const salida: MlTrendDto[] = [];
    for (const entry of payload as MlTrendPayload[]) {
        if (!entry || typeof entry !== "object") continue;
        const keyword =
            typeof entry.keyword === "string" ? entry.keyword.trim() : "";
        if (!keyword) continue;
        const clave = keyword.toLowerCase();
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        // Un enlace en blanco no es un enlace: la pantalla no pinta un `a` vacío.
        const url =
            typeof entry.url === "string" && entry.url.trim()
                ? entry.url.trim()
                : null;
        salida.push({ keyword, url });
        if (salida.length >= ML_TRENDS_LIMIT) break;
    }
    return salida;
}

/**
 * ¿El caché ya venció? Puro para poder probarlo con fechas fijas.
 * Sin `expiresAt` (fila corrupta) se considera vencido: mejor pedir de nuevo
 * que enseñar datos de hace un mes.
 */
export function cacheVencido(expiresAt: Date | null, ahora: Date = new Date()): boolean {
    if (!expiresAt) return true;
    return expiresAt.getTime() <= ahora.getTime();
}

/** Cuándo vence un caché pedido en `desde`. */
export function vencimientoDesde(desde: Date = new Date()): Date {
    return new Date(desde.getTime() + ML_TRENDS_TTL_MS);
}

/* ------------------------------------------------------------------ *
 * El análisis de la IA
 * ------------------------------------------------------------------ */

/**
 * Lo que la IA devuelve sobre las tendencias. Deliberadamente corto y
 * accionable: un vendedor tiene que poder leerlo en un minuto y decidir qué
 * publicar o qué mover de stock.
 */
export type MlTrendAnalysis = {
    /** Dos o tres frases sobre qué se está buscando y por qué importa. */
    resumen: string;
    /** Cosas concretas que el vendedor puede aprovechar. */
    oportunidades: string[];
    /** Riesgos o cosas que conviene no hacer. */
    riesgos: string[];
    /** Ideas de publicación o de stock, con su porqué. */
    ideas: { titulo: string; porQue: string }[];
};

/** El análisis vacío: lo que se enseña si no hay IA configurada. */
export const ANALISIS_VACIO: MlTrendAnalysis = {
    resumen: "",
    oportunidades: [],
    riesgos: [],
    ideas: [],
};

/**
 * Recorta y limpia el análisis que devolvió el modelo.
 *
 * El modelo puede devolver textos larguísimos, listas vacías o elementos que
 * no son texto. Aquí se normaliza todo para que la pantalla no tenga que
 * defenderse, y se descartan las ideas sin título o sin porqué: una idea a
 * medias no ayuda a decidir nada.
 */
export function normalizarAnalisis(raw: {
    resumen?: unknown;
    oportunidades?: unknown;
    riesgos?: unknown;
    ideas?: unknown;
}): MlTrendAnalysis {
    const texto = (v: unknown): string =>
        typeof v === "string" ? v.trim().slice(0, 500) : "";

    const lista = (v: unknown, max: number): string[] => {
        if (!Array.isArray(v)) return [];
        const salida: string[] = [];
        for (const item of v) {
            const t = texto(item);
            if (t) salida.push(t);
            if (salida.length >= max) break;
        }
        return salida;
    };

    const ideas: { titulo: string; porQue: string }[] = [];
    if (Array.isArray(raw.ideas)) {
        for (const item of raw.ideas) {
            if (!item || typeof item !== "object") continue;
            const obj = item as { titulo?: unknown; porQue?: unknown; por_que?: unknown };
            const titulo = texto(obj.titulo);
            const porQue = texto(obj.porQue) || texto(obj.por_que);
            if (!titulo || !porQue) continue;
            ideas.push({ titulo, porQue });
            if (ideas.length >= 5) break;
        }
    }

    return {
        resumen: texto(raw.resumen),
        oportunidades: lista(raw.oportunidades, 5),
        riesgos: lista(raw.riesgos, 5),
        ideas,
    };
}

/**
 * El prompt del análisis. Puro y exportado para que una prueba fije lo que se
 * le pide al modelo: el prompt es el contrato del análisis.
 */
export function buildTrendAnalysisPrompt(input: {
    siteId: string;
    trends: MlTrendDto[];
    /** Títulos de las publicaciones del vendedor, para cruzar. */
    titles: string[];
}): { system: string; user: string } {
    const system = [
        "Eres un analista de mercado que ayuda a un vendedor de Mercado Libre a decidir qué publicar y qué stock mover.",
        "Reglas:",
        "- Responde en español, breve y concreto. Nada de relleno.",
        "- Basate SOLO en las tendencias y las publicaciones que te doy. No inventes datos, cifras ni marcas.",
        "- Si una tendencia no tiene relación con lo que el vendedor ya vende, dilo como oportunidad de ampliar catálogo, no como certeza.",
        "- No prometas ventas ni resultados.",
        'Responde ÚNICAMENTE un objeto JSON con esta forma: {"resumen":"...","oportunidades":["..."],"riesgos":["..."],"ideas":[{"titulo":"...","porQue":"..."}]}',
    ].join("\n");

    const tendencias = input.trends.length
        ? input.trends.map((t, i) => `${i + 1}. ${t.keyword}`).join("\n")
        : "(sin tendencias)";

    const publicaciones = input.titles.length
        ? input.titles.slice(0, 40).map((t) => `- ${t}`).join("\n")
        : "(sin publicaciones)";

    const user = [
        `SITIO DE MERCADO LIBRE: ${input.siteId}`,
        `TENDENCIAS DE BÚSQUEDA:\n${tendencias}`,
        `PUBLICACIONES ACTUALES DEL VENDEDOR:\n${publicaciones}`,
        "Analiza qué puede aprovechar el vendedor y qué conviene cuidar.",
    ].join("\n\n");

    return { system, user };
}
