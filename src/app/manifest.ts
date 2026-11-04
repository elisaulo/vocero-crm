import type { MetadataRoute } from "next";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { appDisplayName, buildManifest } from "@/lib/pwa";
import { getBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

/**
 * 048 — El manifest de la app instalable, con la marca de la organización
 * (`/manifest.webmanifest`). Público: el navegador lo pide sin sesión.
 * v2.7.6 — el nombre y el corto salen de `appDisplayName` («Jombe - CRM»),
 * igual que el título de la ventana.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return buildManifest(branding, appDisplayName(branding.name));
}
