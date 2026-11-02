import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getSessionOrNull } from "@/lib/auth/session";
import { DEFAULT_BRANDING, isValidHex, resolveAccentSet } from "@/lib/branding";
import { CURRENCIES } from "@/lib/money";
import { getBranding, saveBranding } from "@/server/branding";

export const dynamic = "force-dynamic";

/** GET público: el login necesita la marca antes de autenticarse. */
export async function GET() {
  const session = await getSessionOrNull();
  const branding = await getBranding(session?.organizationId);
  return Response.json({ branding, accentSet: resolveAccentSet(branding.accent) });
}

// El nombre NO es editable: el logo del CRM es la imagen oficial estática de
// Jombe (`src/components/brand-mark.tsx`), no texto HTML. Aceptar un `name`
// distinto rompería esa regla, así que el schema público ya no lo pide.
const putSchema = z.object({
  accent: z.string().refine(isValidHex, "Color hex inválido (#rrggbb)"),
  /** La moneda del negocio: la única que el tablero suma. */
  currency: z.enum(CURRENCIES),
});

export const PUT = withAuth(async (session, req: Request) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Solo el propietario puede cambiar la marca");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;
  // El icono se conserva: este formulario es de color y moneda, y el icono se
  // sube y se quita por su propia ruta (bloqueada para Jombe).
  const actual = await getBranding(session.organizationId);
  await saveBranding(session.organizationId, {
    ...body.data,
    name: DEFAULT_BRANDING.name,
    favicon: actual.favicon,
  });
  return Response.json({ ok: true });
});
