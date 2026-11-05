"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Lightbulb, RefreshCw, TrendingUp, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

/**
 * 069 — Tendencias de Mercado Libre con análisis de IA.
 *
 * Lo que se busca en el sitio de la cuenta viene de ML con caché de 6 horas:
 * esta pantalla lo enseña y, si hay IA, el análisis con oportunidades, riesgos
 * e ideas concretas. «Actualizar» pide a ML otra vez ignorando el caché.
 */

type Tendencia = { keyword: string; url: string | null };

type Analisis = {
    resumen: string;
    oportunidades: string[];
    riesgos: string[];
    ideas: { titulo: string; porQue: string }[];
};

type Resultado = {
    siteId: string;
    trends: Tendencia[];
    analysis: Analisis;
    analysisByAi: boolean;
    fetchedAt: string;
    expiresAt: string;
    fromCache: boolean;
};

const ANALISIS_VACIO: Analisis = { resumen: "", oportunidades: [], riesgos: [], ideas: [] };

function cuando(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("es", { dateStyle: "medium", timeStyle: "short" });
}

export function TendenciasClient() {
    const [resultado, setResultado] = useState<Resultado | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [sinCuenta, setSinCuenta] = useState(false);
    const [actualizando, setActualizando] = useState(false);

    const cargar = useCallback(async (forzar: boolean) => {
        setActualizando(true);
        setError(null);
        try {
            const res = await fetch(
                forzar ? "/api/mercadolibre/trends?forzar=1" : "/api/mercadolibre/trends"
            ).catch(() => null);
            if (!res) {
                setError("No se pudieron cargar las tendencias.");
                return;
            }
            if (res.status === 409) {
                setSinCuenta(true);
                setResultado(null);
                return;
            }
            if (!res.ok) {
                setError("No se pudieron cargar las tendencias.");
                return;
            }
            const d = (await res.json()) as Resultado;
            setSinCuenta(false);
            setResultado({ ...d, analysis: d.analysis ?? ANALISIS_VACIO });
        } finally {
            setActualizando(false);
        }
    }, []);

    useEffect(() => {
        setResultado(null);
        void cargar(false);
    }, [cargar]);

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Tendencias</h1>
                    <p className="text-sm text-text-3">
                        Lo que se busca en Mercado Libre y qué hacer con ello.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={actualizando || sinCuenta}
                    onClick={() => void cargar(true)}
                >
                    <RefreshCw className={actualizando ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                    Actualizar
                </Button>
            </div>

            {error && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                </div>
            )}

            {sinCuenta && (
                <Card>
                    <CardContent className="p-0">
                        <EmptyState
                            icon={TrendingUp}
                            title="Sin cuenta de Mercado Libre"
                            description="Conecta tu cuenta en Ajustes → Mercado Libre para ver las tendencias de tu sitio."
                        />
                    </CardContent>
                </Card>
            )}

            {resultado === null && !sinCuenta && !error && (
                <p className="text-sm text-text-3">Cargando tendencias…</p>
            )}

            {resultado && (
                <>
                    <p className="text-xs text-text-3">
                        Sitio {resultado.siteId} · pedido {cuando(resultado.fetchedAt)}
                        {resultado.fromCache ? " (caché)" : ""} · vence {cuando(resultado.expiresAt)}
                    </p>

                    <Card>
                        <CardHeader className="gap-1 pb-2">
                            <CardTitle className="text-base">Lo más buscado</CardTitle>
                            <CardDescription className="text-xs">
                                Las búsquedas que más crecen en {resultado.siteId}.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {resultado.trends.length === 0 ? (
                                <EmptyState
                                    icon={TrendingUp}
                                    title="Sin tendencias"
                                    description="ML no devolvió búsquedas para este sitio."
                                />
                            ) : (
                                <ul className="flex flex-wrap gap-2">
                                    {resultado.trends.map((t) => (
                                        <li key={t.keyword}>
                                            {t.url ? (
                                                <a
                                                    href={t.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-3 py-1 text-sm hover:bg-accent"
                                                >
                                                    {t.keyword}
                                                    <ExternalLink className="h-3 w-3" />
                                                </a>
                                            ) : (
                                                <Badge variant="secondary">{t.keyword}</Badge>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>

                    {resultado.analysisByAi && resultado.analysis.resumen && (
                        <Card>
                            <CardHeader className="gap-1 pb-2">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Lightbulb className="h-4 w-4" />
                                    Análisis de la IA
                                </CardTitle>
                                <CardDescription className="text-xs">
                                    Sobre estas tendencias y tus publicaciones.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <p className="text-sm">{resultado.analysis.resumen}</p>
                                {resultado.analysis.oportunidades.length > 0 && (
                                    <div className="space-y-1">
                                        <p className="text-xs font-medium uppercase tracking-wide text-text-3">
                                            Oportunidades
                                        </p>
                                        <ul className="list-inside list-disc space-y-1 text-sm">
                                            {resultado.analysis.oportunidades.map((o) => (
                                                <li key={o}>{o}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {resultado.analysis.riesgos.length > 0 && (
                                    <div className="space-y-1">
                                        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-text-3">
                                            <TriangleAlert className="h-3 w-3" />
                                            Riesgos
                                        </p>
                                        <ul className="list-inside list-disc space-y-1 text-sm">
                                            {resultado.analysis.riesgos.map((r) => (
                                                <li key={r}>{r}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                {resultado.analysis.ideas.length > 0 && (
                                    <div className="space-y-2">
                                        <p className="text-xs font-medium uppercase tracking-wide text-text-3">
                                            Ideas
                                        </p>
                                        <ul className="space-y-2">
                                            {resultado.analysis.ideas.map((i) => (
                                                <li
                                                    key={i.titulo}
                                                    className="rounded-md border border-border bg-muted/40 px-3 py-2"
                                                >
                                                    <p className="text-sm font-medium">{i.titulo}</p>
                                                    <p className="text-sm text-text-3">{i.porQue}</p>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
