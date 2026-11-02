"use client";

import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import {
  ACCENT_PRESETS,
  DEFAULT_BRANDING,
  isValidHex,
  resolveAccentSet,
  resolveNavAccentSet,
  type AccentSet,
  type Branding,
} from "@/lib/branding";
import {
  CURRENCY_GROUPS,
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY,
  type Currency,
} from "@/lib/money";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-mark";
import { navItemClass } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

/** Los tokens del acento, para sobreescribirlos SOLO dentro de una caja. */
function accentVars(s: AccentSet): React.CSSProperties {
  return {
    "--accent": s.accent,
    "--accent-hover": s.hover,
    "--accent-soft": s.soft,
    "--accent-tint": s.tint,
    "--accent-text": s.text,
    "--accent-fg": s.fg,
  } as React.CSSProperties;
}

export function BrandingClient({
  kicker = "CRM · WhatsApp",
}: {
  /** 028 — La etiqueta bajo el logo, la misma que enseña el menú. */
  kicker?: string;
  favicon?: Branding["favicon"];
}) {
  const [name, setName] = useState(DEFAULT_BRANDING.name);
  const [accent, setAccent] = useState<string>(DEFAULT_BRANDING.accent);
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/settings/branding")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { branding: Branding } | null) => {
        if (d) {
          setName(d.branding.name);
          setAccent(d.branding.accent);
          if (d.branding.currency) setCurrency(d.branding.currency);
        }
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const isPreset = accent.toLowerCase() in ACCENT_PRESETS;
  const previewSet = resolveAccentSet(accent);
  const navSet = resolveNavAccentSet(accent);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    // El nombre NO se manda: el logo del CRM es la imagen oficial estática y
    // su texto no es editable. Solo viajan el acento y la moneda.
    const res = await fetch("/api/settings/branding", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accent, currency }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      setError(data?.error?.message ?? "No se pudo guardar");
      return;
    }
    setSaved(true);
    window.location.reload();
  }

  if (!loaded) return <p className="text-sm text-text-3">Cargando…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Marca del CRM</CardTitle>
          <CardDescription>
            El logo es la imagen oficial de Jombe: se muestra tal cual, sin
            texto editable ni colores que lo deformen. Aquí cambias el acento
            de la interfaz y la moneda del negocio.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="brand-currency">Moneda del negocio</Label>
            <select
              id="brand-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="h-9 max-w-xs rounded-md border border-input bg-card px-2 text-sm"
            >
              {CURRENCY_GROUPS.map((g) => (
                <optgroup key={g.id} label={g.label}>
                  {CURRENCY_OPTIONS.filter((c) => c.group === g.id).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} · {c.name} ({c.where})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-text-3">
              Es la única que el Pipeline suma. Los montos capturados en otra
              moneda se muestran, pero quedan fuera del total de su columna.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Color de acento</Label>
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(ACCENT_PRESETS).map(([hex, preset]) => (
                <button
                  key={hex}
                  onClick={() => setAccent(hex)}
                  title={preset.label}
                  aria-label={preset.label}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                    accent.toLowerCase() === hex
                      ? "border-text-2 bg-secondary"
                      : "border-border-strong hover:bg-accent"
                  )}
                >
                  <span
                    className="h-4 w-4 rounded-full"
                    style={{ background: resolveAccentSet(hex).accent }}
                  />
                  {preset.label}
                </button>
              ))}
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  !isPreset ? "border-text-2 bg-secondary" : "border-border-strong hover:bg-accent"
                )}
              >
                <input
                  type="color"
                  value={isValidHex(accent) ? accent : DEFAULT_BRANDING.accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-4 w-4 cursor-pointer appearance-none border-0 bg-transparent p-0"
                />
                Personalizado
              </label>
            </div>
            <p className="text-xs text-text-3">
              Cambia el color de la interfaz (botones, enlaces, Barra lateral).
              El logo de Jombe es una imagen fija y no cambia con este color.
            </p>
          </div>

          {/* Vista previa: a la izquierda la barra lateral con el mismo renglón
              activo que la de verdad; a la derecha la página en el tema activo. */}
          <div
            aria-label="Vista previa de la marca"
            className="flex flex-col overflow-hidden rounded-md border border-border-strong sm:flex-row"
          >
            <div
              className="nav-dark shrink-0 bg-subtle p-3 text-foreground sm:w-60"
              style={accentVars(navSet)}
            >
              <div className="px-2 pt-0.5">
                <BrandLogo
                  branding={{ name, accent, favicon: null }}
                />
                <span className="kicker mt-2 block">{kicker}</span>
              </div>
              <span className={cn(navItemClass(true), "mt-3")}>
                <Inbox className="h-[17px] w-[17px] text-brand" strokeWidth={1.8} />
                <span className="flex-1">Bandeja</span>
              </span>
            </div>
            <div
              className="flex flex-1 items-center justify-center border-t border-border-strong bg-background p-4 sm:border-l sm:border-t-0"
              style={accentVars(previewSet)}
            >
              <span className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-brand-fg shadow-sm">
                Botón de ejemplo
              </span>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && <p className="text-sm" style={{ color: previewSet.text }}>Marca guardada ✓</p>}
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? "Guardando…" : "Guardar marca"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
