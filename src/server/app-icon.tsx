import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { DEFAULT_BRANDING, resolveAccentSet, type Branding } from "@/lib/branding";
import { isJombeName, JOMBE_ICON_512 } from "@/lib/brand";
import { FAVICON_ASSET, faviconInitial } from "@/lib/favicon";
import type { AppIconPurpose, AppIconSize } from "@/lib/pwa";
import { getBrandingContext } from "@/server/branding";
import { readMediaFile } from "@/server/whatsapp/media";

/**
 * 048 — El icono PNG de la app instalada.
 *
 * Chrome necesita PNG de 192 y 512 px para ofrecer «Instalar», y el iPhone
 * uno de 180 para «Agregar a inicio». El favicon es SVG (028) y no sirve
 * ahí. Se dibuja con `ImageResponse` de `next/og`, que viene dentro de Next con
 * su propia fuente: sin librerías de imagen en el núcleo y sin red.
 *
 * Con logo subido (PNG, JPEG o SVG) va el logo sobre el color de marca. Un ICO
 * o un WEBP no los sabe dibujar `ImageResponse`: con esos, como sin logo, va
 * lo mismo que la pestaña (el isotipo de Jombe o la inicial sobre el acento).
 */

/** Los formatos que `ImageResponse` dibuja dentro de un `<img>`. */
const DIBUJABLES = new Set(["image/png", "image/jpeg", "image/svg+xml"]);

/**
 * El isotipo oficial de Jombe, leído de `public/` una sola vez por proceso.
 * Es una imagen estática e inmutable: no depende del acento ni del nombre que
 * el dueño escriba en Ajustes → Marca.
 */
let isotipoJombe: string | null = null;
async function isotipoJombeDataUri(): Promise<string | null> {
  if (isotipoJombe) return isotipoJombe;
  try {
    const ruta = path.join(process.cwd(), "public", JOMBE_ICON_512.replace(/^\//, ""));
    const buf = await readFile(ruta);
    isotipoJombe = `data:image/png;base64,${buf.toString("base64")}`;
    return isotipoJombe;
  } catch {
    return null;
  }
}

export async function appIconResponse(
  size: AppIconSize,
  purpose: AppIconPurpose
): Promise<ImageResponse> {
  const ctx = await getBrandingContext().catch(() => null);
  const branding = ctx?.branding ?? DEFAULT_BRANDING;
  const logo =
    (await logoSubido(ctx?.organizationId ?? null, branding)) ??
    (isJombeName(branding.name) ? await isotipoJombeDataUri() : null);
  return new ImageResponse(dibujo(branding, logo, size, purpose), {
    width: size,
    height: size,
  });
}

async function logoSubido(
  organizationId: string | null,
  branding: Branding
): Promise<string | null> {
  if (!organizationId || !branding.favicon) return null;
  if (!DIBUJABLES.has(branding.favicon.mime)) return null;
  try {
    const buf = await readMediaFile(organizationId, FAVICON_ASSET);
    return `data:${branding.favicon.mime};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    // El archivo se perdió: se dibuja el generado, como hace el favicon.
    return null;
  }
}

function dibujo(
  branding: Branding,
  logo: string | null,
  size: AppIconSize,
  purpose: AppIconPurpose
) {
  const { accent, fg } = resolveAccentSet(branding.accent);
  // El iPhone recorta él mismo las esquinas y Android recorta el maskable con
  // su forma: los dos van a sangre. El `any` de 192/512 lleva su mosaico
  // redondeado, como el favicon.
  const aSangre = purpose === "maskable" || size === 180;
  // Zona segura del maskable: 22 % de margen, lo importante dentro del 78 % central.
  const contenido = Math.round(size * (purpose === "maskable" ? 0.78 : 0.72));
  const fondo = logo ? "#ffffff" : accent;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: fondo,
        // Fuera del radio el PNG queda transparente.
        borderRadius: aSangre ? 0 : Math.round(size * 0.22),
      }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- ImageResponse dibuja <img>, no next/image
        <img src={logo} width={contenido} height={contenido} style={{ objectFit: "contain" }} alt="" />
      ) : (
        <span
          style={{
            color: fg,
            fontSize: Math.round(contenido * 0.78),
            lineHeight: 1,
            // La fuente que trae `next/og` es solo la regular: el trazo se
            // engruesa con sombras del mismo color, como la inicial del favicon.
            textShadow: grosor(fg, size),
          }}
        >
          {faviconInitial(branding.name)}
        </span>
      )}
    </div>
  );
}

/** Sombras en 8 direcciones que engruesan la letra ~4 % del lado. */
function grosor(color: string, size: number): string {
  const t = Math.max(1, Math.round(size * 0.012));
  const pasos: [number, number][] = [
    [t, 0], [-t, 0], [0, t], [0, -t], [t, t], [-t, -t], [t, -t], [-t, t],
  ];
  return pasos.map(([x, y]) => `${x}px ${y}px 0 ${color}`).join(", ");
}
