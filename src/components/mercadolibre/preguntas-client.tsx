"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, MessageCircleQuestion, RefreshCw, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/textarea";
import {
    ML_ANSWER_MAX_CHARS,
    ML_QUESTION_STATUS_LABEL,
    ML_QUESTION_STATUSES,
    type MlQuestionStatus,
} from "@/lib/mercadolibre/qa";

/**
 * 067 — Preguntas de las publicaciones de Mercado Libre.
 *
 * No es la Bandeja: una pregunta no es una conversación, no tiene ventana ni
 * contacto. Aquí se responde, se aprueba el borrador de la IA o se descarta.
 * El modo (Apagada / Copiloto / Automático) se elige en Ajustes → Mercado Libre.
 */

type Pregunta = {
    id: string;
    mlQuestionId: string;
    itemId: string | null;
    itemTitle: string | null;
    buyerIdentity: string | null;
    question: string;
    answer: string | null;
    draft: string | null;
    status: MlQuestionStatus;
    source: "humano" | "ia" | "faq" | null;
    askedAt: string;
    answeredAt: string | null;
};

const FILTROS: { valor: MlQuestionStatus | "todas"; label: string }[] = [
    { valor: "todas", label: "Todas" },
    ...ML_QUESTION_STATUSES.map((s) => ({ valor: s, label: ML_QUESTION_STATUS_LABEL[s] })),
];

const BADGE: Record<MlQuestionStatus, "default" | "success" | "warning" | "outline"> = {
    unanswered: "warning",
    drafted: "default",
    answered: "success",
    ignored: "outline",
};

function fecha(iso: string): string {
    return new Date(iso).toLocaleString("es", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export function PreguntasClient() {
    const [filtro, setFiltro] = useState<MlQuestionStatus | "todas">("todas");
    const [lista, setLista] = useState<Pregunta[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [ocupada, setOcupada] = useState<string | null>(null);
    const [redactando, setRedactando] = useState<string | null>(null);
    const [texto, setTexto] = useState("");

    const cargar = useCallback(async () => {
        const qs = filtro === "todas" ? "" : `?status=${filtro}`;
        const res = await fetch(`/api/mercadolibre/questions${qs}`).catch(() => null);
        if (!res?.ok) {
            setError("No se pudieron cargar las preguntas.");
            setLista([]);
            return;
        }
        const d = (await res.json()) as { preguntas: Pregunta[] };
        setLista(d.preguntas);
        setError(null);
    }, [filtro]);

    useEffect(() => {
        setLista(null);
        void cargar();
    }, [cargar]);

    async function accion(p: Pregunta, body: Record<string, unknown>) {
        setOcupada(p.id);
        setError(null);
        try {
            const res = await fetch(`/api/mercadolibre/questions/${p.id}`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const d = (await res.json().catch(() => null)) as
                    | { error?: { message?: string } }
                    | null;
                setError(d?.error?.message ?? "No se pudo completar la acción.");
                return;
            }
            setRedactando(null);
            setTexto("");
            await cargar();
        } finally {
            setOcupada(null);
        }
    }

    function abrirRespuesta(p: Pregunta) {
        setRedactando(p.id);
        setTexto(p.draft ?? "");
        setError(null);
    }

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold">Preguntas de Mercado Libre</h1>
                    <p className="text-sm text-text-2">
                        Lo que los compradores preguntan en tus publicaciones.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void cargar()}>
                    <RefreshCw className="h-4 w-4" /> Actualizar
                </Button>
            </div>

            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
                {FILTROS.map((f) => (
                    <Button
                        key={f.valor}
                        size="sm"
                        variant={filtro === f.valor ? "default" : "outline"}
                        aria-pressed={filtro === f.valor}
                        onClick={() => setFiltro(f.valor)}
                    >
                        {f.label}
                    </Button>
                ))}
            </div>

            {error && (
                <p role="alert" className="rounded-md border border-danger-soft bg-danger-tint p-3 text-sm text-danger-text">
                    {error}
                </p>
            )}

            {lista === null ? (
                <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : lista.length === 0 ? (
                <Card>
                    <CardContent className="p-0">
                        <EmptyState
                            icon={MessageCircleQuestion}
                            title="No hay preguntas aquí"
                            description="Cuando un comprador pregunte en una publicación, aparecerá en esta lista."
                        />
                    </CardContent>
                </Card>
            ) : (
                <ul className="space-y-3">
                    {lista.map((p) => (
                        <li key={p.id}>
                            <Card>
                                <CardHeader className="gap-1 pb-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant={BADGE[p.status]}>
                                            {ML_QUESTION_STATUS_LABEL[p.status]}
                                        </Badge>
                                        {p.itemTitle && (
                                            <span className="truncate text-xs text-text-3">
                                                {p.itemTitle}
                                            </span>
                                        )}
                                        <span className="ml-auto text-xs text-text-3">
                                            {fecha(p.askedAt)}
                                        </span>
                                    </div>
                                    <CardTitle className="text-base font-medium">
                                        {p.question}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    {p.answer && (
                                        <div className="rounded-md border bg-subtle p-3 text-sm">
                                            <p className="mb-1 text-xs font-medium text-text-3">
                                                Respuesta
                                                {p.source === "ia" ? " (IA)" : p.source === "faq" ? " (aprendida)" : ""}
                                            </p>
                                            <p className="whitespace-pre-wrap break-words">{p.answer}</p>
                                        </div>
                                    )}

                                    {p.draft && p.status !== "answered" && (
                                        <div className="rounded-md border border-brand-soft bg-brand-tint p-3 text-sm">
                                            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-brand">
                                                <Sparkles className="h-3.5 w-3.5" /> Borrador de la IA
                                            </p>
                                            <p className="whitespace-pre-wrap break-words">{p.draft}</p>
                                        </div>
                                    )}

                                    {redactando === p.id ? (
                                        <div className="space-y-2">
                                            <Textarea
                                                value={texto}
                                                onChange={(e) => setTexto(e.target.value)}
                                                rows={4}
                                                maxLength={ML_ANSWER_MAX_CHARS}
                                                placeholder="Escribe la respuesta…"
                                                autoFocus
                                            />
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    disabled={ocupada === p.id || !texto.trim()}
                                                    onClick={() =>
                                                        void accion(p, { accion: "responder", texto })
                                                    }
                                                >
                                                    Publicar respuesta
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={ocupada === p.id}
                                                    onClick={() => setRedactando(null)}
                                                >
                                                    Cancelar
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        p.status !== "answered" &&
                                        p.status !== "ignored" && (
                                            <div className="flex flex-wrap gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={ocupada === p.id}
                                                    onClick={() => abrirRespuesta(p)}
                                                >
                                                    Responder
                                                </Button>
                                                {p.draft && (
                                                    <Button
                                                        size="sm"
                                                        disabled={ocupada === p.id}
                                                        onClick={() => void accion(p, { accion: "aprobar" })}
                                                    >
                                                        <Check className="h-4 w-4" /> Aprobar borrador
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={ocupada === p.id}
                                                    onClick={() => void accion(p, { accion: "borrador" })}
                                                >
                                                    <Sparkles className="h-4 w-4" />
                                                    {p.draft ? "Otro borrador" : "Pedir borrador"}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={ocupada === p.id}
                                                    onClick={() => void accion(p, { accion: "descartar" })}
                                                >
                                                    <X className="h-4 w-4" /> Descartar
                                                </Button>
                                            </div>
                                        )
                                    )}
                                </CardContent>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            <CardDescription className="text-xs">
                Responder y aprobar publican en Mercado Libre. Si ML rechaza la respuesta, la
                pregunta se queda como estaba.
            </CardDescription>
        </div>
    );
}