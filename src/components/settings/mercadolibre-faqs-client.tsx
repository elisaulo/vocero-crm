"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { MlFaqDto } from "@/server/mercadolibre/questions";

/**
 * 067 — Las respuestas aprendidas de Mercado Libre.
 *
 * Cuando la IA contesta una pregunta y el comprador queda conforme, la
 * respuesta se guarda como FAQ: la próxima pregunta parecida se contesta con
 * ella, sin gastar una llamada al modelo. Aquí se revisan, se corrigen y se
 * borran; también se pueden escribir a mano las que ya sabes de memoria.
 *
 * Las crea y edita quien configura; el resto del equipo las ve.
 */
export function MercadolibreFaqsClient() {
    const [lista, setLista] = useState<MlFaqDto[] | null>(null);
    const [puedeEditar, setPuedeEditar] = useState(false);
    // `null` = cerrado; `""` = creando una nueva; un id = editando esa.
    const [editando, setEditando] = useState<string | null>(null);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [keywords, setKeywords] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [guardando, setGuardando] = useState(false);

    const cargar = useCallback(async () => {
        const res = await fetch("/api/mercadolibre/faqs").catch(() => null);
        if (!res?.ok) return;
        const d = (await res.json()) as { faqs: MlFaqDto[]; puedeEditar: boolean };
        setLista(d.faqs);
        setPuedeEditar(d.puedeEditar);
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);

    function abrir(f: MlFaqDto | null) {
        setEditando(f?.id ?? "");
        setQuestion(f?.question ?? "");
        setAnswer(f?.answer ?? "");
        setKeywords(f?.keywords ?? "");
        setError(null);
    }

    async function guardar() {
        setGuardando(true);
        setError(null);
        const nueva = editando === "";
        const res = await fetch(
            nueva ? "/api/mercadolibre/faqs" : `/api/mercadolibre/faqs/${editando}`,
            {
                method: nueva ? "POST" : "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    question,
                    answer,
                    keywords: keywords.trim() || null,
                }),
            },
        ).catch(() => null);
        setGuardando(false);
        if (!res?.ok) {
            const d = (await res?.json().catch(() => null)) as
                | { error?: { message?: string } }
                | null;
            setError(d?.error?.message ?? "No se pudo guardar. Revisa la conexión.");
            return;
        }
        setEditando(null);
        void cargar();
    }

    async function borrar(f: MlFaqDto) {
        if (!window.confirm(`¿Borrar la respuesta a «${f.question}»?`)) return;
        const res = await fetch(`/api/mercadolibre/faqs/${f.id}`, {
            method: "DELETE",
        }).catch(() => null);
        if (res?.ok) void cargar();
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Respuestas aprendidas
                </CardTitle>
                <CardDescription>
                    Lo que la IA ya sabe contestar de tus publicaciones. Cuando una
                    pregunta se repite, se contesta con la respuesta guardada en vez
                    de pensarla otra vez. Corrige aquí lo que esté mal: la próxima
                    vez saldrá bien.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {lista === null ? (
                    <p className="text-sm text-muted-foreground">Cargando…</p>
                ) : lista.length === 0 && editando === null ? (
                    <p className="text-sm text-text-2">
                        Aún no hay respuestas aprendidas. Se guardan solas cuando la IA
                        contesta una pregunta, o puedes escribir las que ya sabes.
                    </p>
                ) : (
                    <ul className="divide-y rounded-md border">
                        {lista.map((f) => (
                            <li key={f.id} className="flex items-start gap-3 px-3 py-2.5">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium">{f.question}</p>
                                    <p className="whitespace-pre-wrap break-words text-sm text-text-2">
                                        {f.answer}
                                    </p>
                                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-3">
                                        {f.keywords && (
                                            <span className="font-mono">{f.keywords}</span>
                                        )}
                                        <span>
                                            {f.hits === 1
                                                ? "usada 1 vez"
                                                : `usada ${f.hits} veces`}
                                        </span>
                                    </p>
                                </div>
                                {puedeEditar && (
                                    <span className="flex shrink-0 items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Editar «${f.question}»`}
                                            onClick={() => abrir(f)}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={`Borrar «${f.question}»`}
                                            onClick={() => void borrar(f)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                )}

                {editando === null && puedeEditar && (
                    <Button variant="outline" size="sm" onClick={() => abrir(null)}>
                        <Plus className="h-4 w-4" /> Nueva respuesta
                    </Button>
                )}

                {editando !== null && (
                    <div
                        className="space-y-3 rounded-md border bg-subtle p-3"
                        data-testid="form-faq"
                    >
                        <div className="space-y-1.5">
                            <Label htmlFor="faq-question">Pregunta</Label>
                            <Input
                                id="faq-question"
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                placeholder="¿Hacen envíos a todo el país?"
                                maxLength={200}
                                autoFocus
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="faq-answer">Respuesta</Label>
                            <Textarea
                                id="faq-answer"
                                value={answer}
                                onChange={(e) => setAnswer(e.target.value)}
                                rows={4}
                                maxLength={2000}
                                placeholder="Sí, enviamos a todo el país por Mercado Envíos."
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="faq-keywords">Palabras clave</Label>
                            <Input
                                id="faq-keywords"
                                value={keywords}
                                onChange={(e) => setKeywords(e.target.value)}
                                placeholder="envio, envian, despacho"
                                maxLength={200}
                            />
                            <p className="text-xs text-text-3">
                                Separadas por comas. Sirven para reconocer la pregunta
                                aunque venga escrita de otra forma. Si lo dejas vacío,
                                se usan las palabras de la pregunta.
                            </p>
                        </div>
                        {error && (
                            <p role="alert" className="text-xs text-destructive">
                                {error}
                            </p>
                        )}
                        <div className="flex gap-2">
                            <Button
                                size="sm"
                                disabled={guardando || !question.trim() || !answer.trim()}
                                onClick={() => void guardar()}
                            >
                                {guardando ? "Guardando…" : "Guardar"}
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                disabled={guardando}
                                onClick={() => setEditando(null)}
                            >
                                Cancelar
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}