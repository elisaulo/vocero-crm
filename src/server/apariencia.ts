import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { THEME_COOKIE, THEME_COOKIE_LEGACY } from "@/lib/theme";
import {
  APARIENCIA_COOKIE,
  APARIENCIA_COOKIE_LEGACY,
  aparienciaSchema,
  modoDe,
  normalizarApariencia,
  parejaDe,
  resolverApariencia,
  type Apariencia,
} from "@/lib/temas";

/**
 * 062 — La apariencia por defecto del negocio vive en `organization.metadata`
 * (junto a la marca), y la de cada persona en una cookie (D5).
 */

function leerMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const m = JSON.parse(metadata) as unknown;
    return typeof m === "object" && m !== null ? (m as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** La del negocio, o null si nunca se eligió (vale la de Jombe). */
export async function aparienciaDelNegocio(organizationId?: string | null): Promise<Apariencia | null> {
  const db = getDb();
  const rows = organizationId
    ? await db
      .select({ metadata: schema.organization.metadata })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1)
    : // Sin sesión (login, layout raíz): la única organización de la instancia.
    await db.select({ metadata: schema.organization.metadata }).from(schema.organization).limit(1);
  const r = aparienciaSchema.safeParse(
    normalizarApariencia(leerMetadata(rows[0]?.metadata ?? null).apariencia)
  );
  return r.success ? r.data : null;
}

export async function guardarAparienciaDelNegocio(organizationId: string, a: Apariencia): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ metadata: schema.organization.metadata })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const meta = leerMetadata(rows[0]?.metadata ?? null);
  meta.apariencia = aparienciaSchema.parse(a);
  await db
    .update(schema.organization)
    .set({ metadata: JSON.stringify(meta) })
    .where(eq(schema.organization.id, organizationId));
}

/**
 * La que se pinta en esta petición: la cookie de la persona, si no la del
 * negocio. Quien ya tenía elegido el oscuro con el botón de antes lo conserva:
 * ve la pareja oscura del tema del negocio. Las cookies con el nombre viejo
 * (`vocero-apariencia` y `vocero-theme`) se leen como alias hasta v2.9.
 */
export async function aparienciaActual(organizationId?: string | null): Promise<{
  apariencia: Apariencia;
  propia: boolean;
  delNegocio: Apariencia | null;
}> {
  const jar = await cookies();
  const delNegocio = await aparienciaDelNegocio(organizationId).catch(() => null);
  // TODO: remove in v2.9 — el `??` con la cookie vieja es el fallback del rebranding.
  const propiaCruda =
    jar.get(APARIENCIA_COOKIE)?.value ?? jar.get(APARIENCIA_COOKIE_LEGACY)?.value;
  const r = resolverApariencia(propiaCruda, delNegocio);
  const modoHistorico =
    jar.get(THEME_COOKIE)?.value ?? jar.get(THEME_COOKIE_LEGACY)?.value;
  if (!r.propia && modoHistorico === "dark" && modoDe(r.apariencia) === "light") {
    return { apariencia: parejaDe(r.apariencia), propia: false, delNegocio };
  }
  return { ...r, delNegocio };
}
