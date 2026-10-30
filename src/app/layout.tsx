import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Archivo, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import { accentCssVariables, DEFAULT_BRANDING } from "@/lib/branding";
import { faviconHref } from "@/lib/favicon";
import { normalizeThemePreference, THEME_COOKIE } from "@/lib/theme";
import { getBranding } from "@/server/branding";
import { enabledChannels } from "@/server/channels/enabled";
import { productName } from "@/lib/channels";
import "./globals.css";

// Las tres voces de la marca, las mismas de vocerocrm.com. next/font las
// descarga en BUILD y las sirve self-hosted (sin CDN en runtime: soberanía).
const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
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

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  const theme = normalizeThemePreference(
    (await cookies()).get(THEME_COOKIE)?.value
  );
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
