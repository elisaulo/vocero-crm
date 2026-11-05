import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { chatJson } from "@/lib/ai";
import { mlFetch, mlMe } from "@/lib/mercadolibre/client";
import {
    ANALISIS_VACIO,
    ML_TRENDS_LIMIT,
    buildTrendAnalysisPrompt,
    cacheVencido,
    normalizarAnalisis,
    serializeTendencias,
    vencimientoDesde,
    type MlTrendAnalysis,
    type MlTrendDto,
} from "@/lib/mercadolibre/trends";
import {
    getMlCredentialsByOrg,
    updateMlSiteId,
} from "@/server/mercadolibre/credentials";
import { listarPublicaciones } from "@/server/mercadolibre/items";

/**
 * 069 — Tendencias de Mercado Libre por sitio, con análisis de IA y caché.
 *
 * Las tendencias (`/trends/{site}`) son por SITIO, no por usuario: hay que
 * saber en qué sitio vende la cuenta (`MLM`, `MLB`, `MLA`…). Ese dato se guarda
 * al conectar; si una cuenta vieja no lo tiene, se resuelve aquí con `mlMe` y
 * se rellena, para que la pantalla funcione sin obligar a reconectar.
 *
 * El caché vive en `ml_trend_cache`, una fila por organización y sitio. La
 * pantalla lee el caché; solo cuando venció se vuelve a pedir a ML y se rehace
 * el análisis. Así abrir la pantalla diez veces no gasta diez llamadas.
 */

export type MlTrendsResult = {
    siteId: string;
    trends: MlTrendDto[];
    analysis: MlTrendAnalysis;
    /** true si el análisis lo escribió la IA; false si no hay IA o falló. */
    analysisByAi: boolean;
    fetchedAt: string;
    expiresAt: string;
    /** true si esta respuesta vino del caché y no de una llamada a ML. */
    fromCache: boolean;
};

/** El sitio de la cuenta, resolviéndolo con `mlMe` si una cuenta vieja no lo tiene. */
async function resolverSiteId(organizationId: string): Promise<string | null> {
    const creds = await getMlCredentialsByOrg(organizationId);
    if (!creds) return null;
    if (creds.siteId) return creds.siteId;

    // Cuenta conectada antes de 069: se pregunta a ML una vez y se guarda.
    const usuario = await mlMe(creds.accessToken);
    if (!usuario?.siteId) return null;
    await updateMlSiteId(organizationId, usuario.siteId);
    return usuario.siteId;
}

/** El esquema del análisis que se le pide a la IA. */
const AnalisisSchema = z.object({
    resumen: z.string(),
    oportunidades: z.array(z.string()).optional(),
    riesgos: z.array(z.string()).optional(),
    ideas: z
        .array(z.object({ titulo: z.string(), porQue: z.string().optional(), por_que: z.string().optional() }))
        .optional(),
});

/**
 * Le pide a la IA el análisis de las tendencias cruzadas con lo que el
 * vendedor ya publica. Devuelve `null` si no hay IA o si el modelo no dio
 * nada usable: la pantalla enseña las tendencias igual, sin análisis.
 */
async function analizarConIa(input: {
    organizationId: string;
    siteId: string;
    trends: MlTrendDto[];
}): Promise<MlTrendAnalysis | null> {
    if (input.trends.length === 0) return null;

    // Los títulos de lo que ya vende: el análisis vale más si cruza tendencia
    // con catálogo. Si ML falla aquí, se analiza igual sin catálogo.
    let titles: string[] = [];
    try {
        const { items } = await listarPublicaciones(input.organizationId, { limit: 50 });
        titles = items.map((i) => i.title);
    } catch {
        titles = [];
    }

    const { system, user } = buildTrendAnalysisPrompt({
        siteId: input.siteId,
        trends: input.trends,
        titles,
    });

    const result = await chatJson(
        AnalisisSchema,
        [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        { organizationId: input.organizationId }
    );
    if (!result.ok) return null;

    const normalizado = normalizarAnalisis(result.data);
    // Un análisis sin resumen no dice nada: mejor no enseñar nada.
    if (!normalizado.resumen) return null;
    return normalizado;
}

/** Pide las tendencias a ML y las guarda en el caché con su análisis. */
async function refrescar(input: {
    organizationId: string;
    siteId: string;
}): Promise<MlTrendsResult> {
    const payload = await mlFetch(
        input.organizationId,
        `/trends/${encodeURIComponent(input.siteId)}?limit=${ML_TRENDS_LIMIT}`
    );
    const trends = serializeTendencias(payload);

    const analysis = await analizarConIa({
        organizationId: input.organizationId,
        siteId: input.siteId,
        trends,
    });

    const ahora = new Date();
    const expiresAt = vencimientoDesde(ahora);
    const analysisJson = analysis ? JSON.stringify(analysis) : null;

    const values = {
        payload: JSON.stringify(trends),
        analysis: analysisJson,
        fetchedAt: ahora,
        expiresAt,
        updatedAt: ahora,
    };

    await getDb()
        .insert(schema.mlTrendCache)
        .values({
            id: newId("mlTrendCache"),
            organizationId: input.organizationId,
            siteId: input.siteId,
            ...values,
        })
        .onConflictDoUpdate({
            target: [schema.mlTrendCache.organizationId, schema.mlTrendCache.siteId],
            set: values,
        });

    return {
        siteId: input.siteId,
        trends,
        analysis: analysis ?? ANALISIS_VACIO,
        analysisByAi: analysis !== null,
        fetchedAt: ahora.toISOString(),
        expiresAt: expiresAt.toISOString(),
        fromCache: false,
    };
}

/** Lee el caché de un sitio, o `null` si no hay fila. */
async function leerCache(
    organizationId: string,
    siteId: string
): Promise<MlTrendsResult | null> {
    const rows = await getDb()
        .select()
        .from(schema.mlTrendCache)
        .where(
            and(
                scoped(schema.mlTrendCache.organizationId, organizationId),
                eq(schema.mlTrendCache.siteId, siteId)
            )
        )
        .limit(1);
    const row = rows[0];
    if (!row) return null;

    let trends: MlTrendDto[] = [];
    try {
        trends = serializeTendencias(JSON.parse(row.payload));
    } catch {
        trends = [];
    }

    let analysis: MlTrendAnalysis = ANALISIS_VACIO;
    if (row.analysis) {
        try {
            analysis = normalizarAnalisis(JSON.parse(row.analysis));
        } catch {
            analysis = ANALISIS_VACIO;
        }
    }

    return {
        siteId: row.siteId,
        trends,
        analysis,
        analysisByAi: Boolean(row.analysis),
        fetchedAt: row.fetchedAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        fromCache: true,
    };
}

/**
 * Las tendencias del sitio de la cuenta.
 *
 * - Sin cuenta conectada: `null` (la pantalla manda a conectar).
 * - Con caché vigente: lo que hay, sin tocar ML.
 * - Con caché vencido o sin caché: se pide a ML, se analiza y se guarda.
 *
 * `forzar` ignora el caché: es el botón «Actualizar» de la pantalla.
 */
export async function obtenerTendencias(
    organizationId: string,
    opts: { forzar?: boolean } = {}
): Promise<MlTrendsResult | null> {
    const siteId = await resolverSiteId(organizationId);
    if (!siteId) return null;

    if (!opts.forzar) {
        const cache = await leerCache(organizationId, siteId);
        if (cache && !cacheVencido(new Date(cache.expiresAt))) return cache;
    }

    return refrescar({ organizationId, siteId });
}