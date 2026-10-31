import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { accentCssVariables, DEFAULT_BRANDING } from "@/lib/branding";
import { faviconHref } from "@/lib/favicon";
import { appIconHref, NAV_INK, shortAppName } from "@/lib/pwa";
import { RegistrarServiceWorker } from "@/components/pwa";
import { atributosHtml, cssDePropio, cssDeTemas } from "@/lib/temas";
import { aparienciaActual } from "@/server/apariencia";
import { getBranding } from "@/server/branding";
import { enabledChannels } from "@/server/channels/enabled";
import { productName } from "@/lib/channels";
import "./globals.css";

// Las voces de la marca, dentro del repo (`./fonts`, subconjunto latino de
// Google Fonts, licencia OFL en `fonts/licencias/`). Antes next/font las
// bajaba de Google en cada BUILD y un hipo de esa red tumbaba el build; así
// el build no sale a internet y el runtime tampoco (soberanía). 061 — La
// interfaz va en Urbanist (geométrica y ligera, como la referencia del diseño
// de tarjetas); Archivo, la de vocerocrm.com, queda cargada para elegirla
// (062). `--font-sans` se arma en globals.css a partir de estas.
const urbanist = localFont({
  src: "./fonts/urbanist-latin-variable.woff2",
  weight: "100 900",
  variable: "--font-urbanist",
  display: "swap",
});
const archivo = localFont({
  src: "./fonts/archivo-latin-variable.woff2",
  weight: "100 900",
  variable: "--font-archivo",
  display: "swap",
});
// 062 — Las otras dos letras que se eligen en Ajustes → Apariencia.
const inter = localFont({
  src: "./fonts/inter-latin-variable.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});
const plexSans = localFont({
  src: "./fonts/ibm-plex-sans-latin-variable.woff2",
  weight: "400 700",
  variable: "--font-plex-sans",
  display: "swap",
});
const instrumentSerif = localFont({
  src: [
    { path: "./fonts/instrument-serif-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/instrument-serif-latin-400-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-serif",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});
const plexMono = localFont({
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-mono-latin-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
  adjustFontFallback: false,
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const producto = productName([...enabledChannels()]);
  return {
    title: `${branding.name} — ${producto}`,
    description: `${producto} con agente de IA y Laboratorio de auto-evaluación`,
    icons: { icon: faviconHref(branding), apple: "/icons/apple-touch-icon.png" },
    manifest: "/manifest.json",
    themeColor: "#0b1327",
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: branding.name,
    },
  };
}

/** 048 — La barra de estado de la app instalada, del color de la barra lateral. */
export const viewport: Viewport = { themeColor: NAV_INK };

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  // 062 · D6 — La apariencia (tema, letra, tamaño y densidad) se resuelve en
  // el servidor: el primer pintado ya la trae, sin parpadeo.
  const { apariencia } = await aparienciaActual().catch(() => ({
    apariencia: { tema: "menta", letra: "urbanist", tamano: "normal", densidad: "normal" } as const,
  }));
  return (
    <html
      lang="es"
      className={`${archivo.variable} ${instrumentSerif.variable} ${plexMono.variable} h-dvh overflow-hidden`}
      data-theme={theme}
    >
      <head>
        {/* Acento white-label inyectado en SSR: sin flash de tema */}
        <style
          dangerouslySetInnerHTML={{ __html: accentCssVariables(branding.accent) }}
        />
        {/* PWA: link explícito al manifiesto en formato estándar W3C */}
        <link rel="manifest" href="/manifest.webmanifest" />
      </head>
      <body className="h-dvh overflow-hidden font-sans">
        {children}
        {/* Registro del Service Worker para instalabilidad PWA */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(()=>{})}`,
          }}
        />
      </body>
    </html>
  );
}
