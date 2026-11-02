/**
 * evolution-patches.ts — Parches criticos de Evolution API (Baileys/QR).
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  REGLAS INVIOLABLES — NO ELIMINAR NI SOBRESCRIBIR EN MERGES             ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  1. Evolution API NUNCA tiene restriccion de ventana de 24 horas.       ║
 * ║     `isEvolutionUnlimitedWindow()` debe devolver `true` cuando el       ║
 * ║     proveedor activo es "evolution" o cuando la conversacion tiene una  ║
 * ║     `evolutionInstance` asignada. La restriccion es EXCLUSIVA de Meta   ║
 * ║     Cloud API oficial.                                                  ║
 * ║                                                                         ║
 * ║  2. Los JIDs `@lid` deben enviarse COMPLETOS a Evolution API.           ║
 * ║     WhatsApp genera JIDs con sufijo `@lid` (Linked-ID) para usuarios   ║
 * ║     con alta privacidad o provenientes de anuncios. Enviar solo los     ║
 * ║     digitos hace que Evolution API responda HTTP 400 `"exists": false`. ║
 * ║     `formatEvolutionRecipient()` e `isLidNotFoundError()` implementan  ║
 * ║     el fallback automatico.                                             ║
 * ║                                                                         ║
 * ║  Historial de cambios:                                                  ║
 * ║  - v2.7.3 (2026-11-02): creacion inicial de este modulo.               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

/**
 * Devuelve `true` cuando la conversacion usa Evolution API y por tanto la
 * ventana de 24 horas no aplica.
 *
 * Regla: Baileys/Evolution API es una sesion de WhatsApp real (QR / pairing
 * code) y NO esta sujeta a las restricciones de la Business Cloud API de Meta.
 * Puede enviar mensajes de texto libre, multimedia y cualquier tipo en
 * cualquier momento, sin importar cuanto tiempo haya pasado desde el ultimo
 * mensaje del cliente.
 */
export function isEvolutionUnlimitedWindow(
  whatsappProvider: "meta" | "evolution" | undefined | null,
  evolutionInstance: string | null | undefined
): boolean {
  if (whatsappProvider === "evolution") return true;
  if (evolutionInstance) return true;
  return false;
}

/**
 * Formatea el destinatario para Evolution API con soporte completo de JIDs
 * `@lid`, `@s.whatsapp.net` y `@g.us`.
 *
 * Reglas:
 * - Si `recipient` ya incluye `@lid`             -> JID completo tal cual.
 * - Si `recipient` ya incluye `@s.whatsapp.net`  -> JID completo tal cual.
 * - Si `recipient` ya incluye `@g.us`            -> JID completo (grupos).
 * - Si son solo digitos                           -> digitos limpios.
 */
export function formatEvolutionRecipient(recipient: string): string {
  if (
    recipient.includes("@lid") ||
    recipient.includes("@s.whatsapp.net") ||
    recipient.includes("@g.us")
  ) {
    return recipient;
  }
  return recipient.replace(/\D/g, "");
}

/**
 * Construye el JID con sufijo `@lid` para el reintento automatico cuando
 * Evolution API responde HTTP 400 con `"exists": false`.
 */
export function buildLidFallback(recipient: string): string {
  const base = recipient.split("@")[0] ?? recipient;
  return `${base}@lid`;
}

/**
 * Detecta si un error de Evolution API corresponde al caso `"exists": false`
 * que ocurre con contactos de JID `@lid` cuando se enviaron solo los digitos.
 */
export function isLidNotFoundError(errorText: string): boolean {
  try {
    const parsed = JSON.parse(errorText) as unknown;
    if (typeof parsed !== "object" || parsed === null) return false;
    const p = parsed as Record<string, unknown>;
    const response = p["response"] as Record<string, unknown> | undefined;
    if (!response) return false;
    const messages = response["message"];
    if (!Array.isArray(messages)) return false;
    return messages.some(
      (m) =>
        typeof m === "object" &&
        m !== null &&
        (m as Record<string, unknown>)["exists"] === false
    );
  } catch {
    return false;
  }
}
