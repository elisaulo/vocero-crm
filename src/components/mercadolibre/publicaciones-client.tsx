"use client";

import { useCallback, useEffect, useState } from "react";
import { Package, Pause, Play, RefreshCw, Save } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * 068 — Publicaciones y stock de Mercado Libre.
 *
 * Las publicaciones viven en ML, no en la base: esta pantalla las lee y deja
 * cambiar precio, stock y estado. Quien configura puede editar; el resto del
 * equipo solo mira. El stock es lo que más se toca: se ajusta aquí sin abrir
 * el panel de ML.
 */

type Item = {
    id: string;
    title: string;
    price: number;
    currencyId: string | null;
    availableQuantity: number | null;
    soldQuantity: number | null;
    status: string;
    pausada: boolean;
    thumbnail: string | null;
    permalink: string | null;
    sellerSku: string | null;
    listingTypeId: string | null;
};

type Lista = { items: Item[]; total: number; puedeEditar: boolean };

function precio(item: Item): string {
    try {
        return new Intl.NumberFormat("es", {
            style: "currency",
            currency: item.currencyId ?? "MXN",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(item.price);
    } catch {
        return `${item.price.toFixed(2)} ${item.currencyId ?? ""}`.trim();
    }
}

export function PublicacionesClient() {
    const [lista, setLista] = useState<Lista | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [editando, setEditando] = useState<string | null>(null);
    const [precioTexto, setPrecioTexto] = useState("");
    const [stockTexto, setStockTexto] = useState("");
    const [ocupada, setOcupada] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        const res = await fetch("/api/mercadolibre/items").catch(() => null);
        if (!res?.ok) {
            setError("No se pudieron cargar las publicaciones.");
            setLista({ items: [], total: 0, puedeEditar: false });
            return;
        }
        const d = (await res.json()) as Lista;
        setLista(d);
        setError(null);
    }, []);

    useEffect(() => {
        setLista(null);
        void cargar();
    }, [cargar]);

    function abrir(item: Item) {
        setEditando(item.id);
        setPrecioTexto(String(item.price));
        setStockTexto(item.availableQuantity === null ? "" : String(item.availableQuantity));
        setError(null);
    }

    async function enviar(item: Item, cambio: Record<string, unknown>) {
        setOcupada(item.id);
        setError(null);
        try {
            const res = await fetch(`/api/mercadolibre/items/${item.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(cambio),
            });
            if (!res.ok) {
                const d = (await res.json().catch(() => null)) as
                    | { error?: { message?: string } }
                    | null;
                setError(d?.error?.message ?? "No se pudo guardar el cambio.");
                return;
            }
            setEditando(null);
            await cargar();
        } finally {
            setOcupada(null);
        }
    }

    async function guardar(item: Item) {
        const cambio: Record<string, unknown> = {};
        const precioNum = Number(precioTexto.replace(",", "."));
        if (precioTexto.trim() !== "" && Number.isFinite(precioNum) && precioNum >= 0) {
            cambio.price = precioNum;
        }
        const stockNum = Number(stockTexto.trim());
        if (stockTexto.trim() !== "" && Number.isInteger(stockNum) && stockNum >= 0) {
            cambio.availableQuantity = stockNum;
        }
        if (Object.keys(cambio).length === 0) {
            setError("Escribe un precio o un stock válido.");
            return;
        }
        await enviar(item, cambio);
    }

    async function alternarEstado(item: Item) {
        await enviar(item, { status: item.pausada ? "active" : "paused" });
    }

    return (
        <div className="mx-auto max-w-3xl space-y-6 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-foreground">Publicaciones</h1>
                    <p className="text-sm text-text-3">
                        Precio, stock y estado de lo que vendes en Mercado Libre.
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => void cargar()}>
                    <RefreshCw className="h-4 w-4" aria-hidden />
                    Actualizar
                </Button>
            </div>

            {error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {error}
                </p>
            )}

            {lista === null ? (
                <p className="text-sm text-text-3">Cargando publicaciones…</p>
            ) : lista.items.length === 0 ? (
                <Card>
                    <CardContent className="p-0">
                        <EmptyState
                            icon={Package}
                            title="No hay publicaciones"
                            description="Cuando publiques en Mercado Libre, aparecerán aquí para ajustar su stock y su precio."
                        />
                    </CardContent>
                </Card>
            ) : (
                <ul className="space-y-3">
                    {lista.items.map((item) => (
                        <li key={item.id}>
                            <Card>
                                <CardHeader className="gap-1 pb-2">
                                    <div className="flex items-start justify-between gap-3">
                                        <CardTitle className="text-sm leading-snug">
                                            {item.title}
                                        </CardTitle>
                                        <Badge variant={item.pausada ? "outline" : "success"}>
                                            {item.pausada ? "Pausada" : "Activa"}
                                        </Badge>
                                    </div>
                                    <CardDescription className="text-xs">
                                        {item.id}
                                        {item.sellerSku ? ` · SKU ${item.sellerSku}` : ""}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
                                        <div>
                                            <dt className="text-xs text-text-3">Precio</dt>
                                            <dd className="font-medium text-foreground">
                                                {precio(item)}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-text-3">Stock</dt>
                                            <dd className="font-medium text-foreground">
                                                {item.availableQuantity ?? "—"}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs text-text-3">Vendidos</dt>
                                            <dd className="font-medium text-foreground">
                                                {item.soldQuantity ?? "—"}
                                            </dd>
                                        </div>
                                    </dl>

                                    {editando === item.id ? (
                                        <div className="space-y-2">
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                <div className="space-y-1.5">
                                                    <Label htmlFor={`precio-${item.id}`}>Precio</Label>
                                                    <Input
                                                        id={`precio-${item.id}`}
                                                        inputMode="decimal"
                                                        value={precioTexto}
                                                        onChange={(e) => setPrecioTexto(e.target.value)}
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label htmlFor={`stock-${item.id}`}>Stock</Label>
                                                    <Input
                                                        id={`stock-${item.id}`}
                                                        inputMode="numeric"
                                                        value={stockTexto}
                                                        onChange={(e) => setStockTexto(e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    disabled={ocupada === item.id}
                                                    onClick={() => void guardar(item)}
                                                >
                                                    <Save className="h-4 w-4" aria-hidden />
                                                    Guardar
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => setEditando(null)}
                                                >
                                                    Cancelar
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {lista.puedeEditar && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => abrir(item)}
                                                >
                                                    Editar precio y stock
                                                </Button>
                                            )}
                                            {lista.puedeEditar && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    disabled={ocupada === item.id}
                                                    onClick={() => void alternarEstado(item)}
                                                >
                                                    {item.pausada ? (
                                                        <>
                                                            <Play className="h-4 w-4" aria-hidden />
                                                            Reactivar
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Pause className="h-4 w-4" aria-hidden />
                                                            Pausar
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                            {item.permalink && (
                                                <a
                                                    href={item.permalink}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="inline-flex h-8 items-center rounded-full px-3 text-xs font-semibold text-brand hover:underline"
                                                >
                                                    Ver en Mercado Libre
                                                </a>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </li>
                    ))}
                </ul>
            )}

            {lista && lista.total > lista.items.length && (
                <CardDescription className="text-xs">
                    Se muestran {lista.items.length} de {lista.total} publicaciones.
                </CardDescription>
            )}
        </div>
    );
}
