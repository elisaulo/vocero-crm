"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, MessageCircleQuestion, Store } from "lucide-react";
import { MercadolibreFaqsClient } from "@/components/settings/mercadolibre-faqs-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    ML_QA_MODE_DESCRIPTION,
    ML_QA_MODE_LABEL,
    ML_QA_MODES,
    type MlQaMode,
} from "@/lib/mercadolibre/qa";

/**
 * 067 — Conexión de la cuenta vendedora de Mercado Libre.
 *
 * A diferencia de los canales, ML se conecta con OAuth 2.0: el dueño autoriza
 * en mercadolibre.com y vuelve aquí. El access token dura poco y se renueva
 * solo; el refresh token queda cifrado en la base.
 */

type Connection = {
    status: "connected" | "reconnect_required";
    nickname: string | null;
    mlUserId: string;
    tokenLast4: string;
    qaMode: MlQaMode;
};

type Vista = {
    configured: boolean;
    connection: Connection | null;
};

const ERRORES: Record<string, string> = {
    autorizacion_rechazada: "Mercado Libre rechazó la autorización.",
    callback_incompleto: "La respuesta de Mercado Libre llegó incompleta.",
    sin_sesion: "Tu sesión expiró durante la conexión. Vuelve a entrar e inténtalo de nuevo.",
    estado_invalido: "El estado de la conexión no coincide con tu sesión. Inténtalo de nuevo.",
    canje_fallido: "No se pudo canjear el código de autorización. Inténtalo de nuevo.",
};

export function MercadolibreClient() {
    const searchParams = useSearchParams();
    const [vista, setVista] = useState<Vista | null>(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [guardandoModo, setGuardandoModo] = useState(false);

    const refetch = useCallback(async () => {
        const data = await fetch("/api/settings/mercadolibre")
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null);
        if (data) setVista(data as Vista);
    }, []);

    useEffect(() => {
        void refetch();
    }, [refetch]);

    useEffect(() => {
        const mlError = searchParams.get("ml_error");
        if (mlError) setError(ERRORES[mlError] ?? "No se pudo conectar con Mercado Libre.");
        if (searchParams.get("ml_conectado") === "1") setError(null);
    }, [searchParams]);

    async function conectar() {
        setCargando(true);
        setError(null);
        try {
            const res = await fetch("/api/settings/mercadolibre", { method: "POST" });
            const data = (await res.json().catch(() => null)) as
                | { url?: string; message?: string }
                | null;
            if (!res.ok || !data?.url) {
                setError(data?.message ?? "Mercado Libre no está configurado en esta instancia.");
                return;
            }
            window.location.href = data.url;
        } finally {
            setCargando(false);
        }
    }

    async function desconectar() {
        setCargando(true);
        setError(null);
        try {
            await fetch("/api/settings/mercadolibre", { method: "DELETE" });
            await refetch();
        } finally {
            setCargando(false);
        }
    }

    async function cambiarModo(qaMode: MlQaMode) {
        setGuardandoModo(true);
        setError(null);
        try {
            const res = await fetch("/api/settings/mercadolibre", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ qaMode }),
            });
            if (!res.ok) {
                const data = (await res.json().catch(() => null)) as
                    | { message?: string }
                    | null;
                setError(data?.message ?? "No se pudo cambiar el modo de respuesta.");
                return;
            }
            await refetch();
        } finally {
            setGuardandoModo(false);
        }
    }

    if (!vista) return <p className="text-sm text-muted-foreground">Cargando…</p>;

    const connection = vista.connection;

    return (
        <div className="max-w-3xl space-y-6">
            {error && (
                <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <p className="text-danger-text">{error}</p>
                </div>
            )}

            {connection?.status === "reconnect_required" && (
                <div className="flex items-start gap-2 rounded-lg border border-danger-soft bg-danger-tint p-4 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                        <p className="font-medium text-danger-text">
                            La conexión con Mercado Libre venció.
                        </p>
                        <p className="text-danger-text opacity-80">
                            El refresh token fue rechazado. Vuelve a conectar la cuenta para
                            reanudar las notificaciones y los envíos.
                        </p>
                    </div>
                </div>
            )}

            {connection?.status === "connected" && (
                <div className="flex items-center gap-3 rounded-lg border border-success-soft bg-success-tint p-4">
                    <CheckCircle2 className="h-5 w-5 text-success" />
                    <div className="flex-1 text-sm">
                        <p className="font-medium text-success-text">
                            Conectado{connection.nickname ? `: ${connection.nickname}` : ""}
                        </p>
                        <p className="text-success-text opacity-80">
                            Cuenta {connection.mlUserId} · token que termina en ····
                            {connection.tokenLast4}
                        </p>
                    </div>
                    <Badge variant="success">Mercado Libre activo</Badge>
                </div>
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Store className="h-5 w-5" />
                        {connection ? "Reconectar Mercado Libre" : "Conectar Mercado Libre"}
                    </CardTitle>
                    <CardDescription>
                        Autoriza a Jombe a leer tus ventas, preguntas y publicaciones. El
                        acceso se renueva solo; puedes desconectarlo cuando quieras.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!vista.configured ? (
                        <p className="text-sm text-muted-foreground">
                            Esta instancia no tiene configurada la aplicación de Mercado Libre
                            (<code>ML_CLIENT_ID</code> y <code>ML_CLIENT_SECRET</code>). Pídele
                            al administrador que la agregue al entorno.
                        </p>
                    ) : (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={() => void conectar()} disabled={cargando}>
                                {connection ? "Reconectar con Mercado Libre" : "Conectar con Mercado Libre"}
                            </Button>
                            {connection && (
                                <Button
                                    variant="outline"
                                    onClick={() => void desconectar()}
                                    disabled={cargando}
                                >
                                    Desconectar
                                </Button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {connection && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <MessageCircleQuestion className="h-5 w-5" />
                            Cómo contesta la IA las preguntas
                        </CardTitle>
                        <CardDescription>
                            Las preguntas de tus publicaciones llegan a la pantalla de
                            Preguntas. Elige si la IA las contesta sola, escribe un borrador
                            para que lo apruebes, o no contesta.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-2" role="group" aria-label="Modo de respuesta">
                            {ML_QA_MODES.map((modo) => (
                                <Button
                                    key={modo}
                                    variant={connection.qaMode === modo ? "default" : "outline"}
                                    size="sm"
                                    disabled={guardandoModo}
                                    aria-pressed={connection.qaMode === modo}
                                    onClick={() => void cambiarModo(modo)}
                                >
                                    {ML_QA_MODE_LABEL[modo]}
                                </Button>
                            ))}
                        </div>
                        <p className="text-sm text-text-2">
                            {ML_QA_MODE_DESCRIPTION[connection.qaMode]}
                        </p>
                    </CardContent>
                </Card>
            )}

            {connection?.status === "connected" && <MercadolibreFaqsClient />}

            <p className="flex items-start gap-2 text-xs text-text-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                    Jombe nunca ve tu contraseña: la autorización ocurre en
                    mercadolibre.com y aquí solo queda el token, cifrado.
                </span>
            </p>
        </div>
    );
}
