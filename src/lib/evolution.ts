/**
 * Servicio cliente para Evolution API (WhatsApp Baileys / Evolution API v1/v2).
 *
 * PARCHES CRITICOS (v2.7.3):
 * 1. Soporte de JIDs @lid: se preserva el JID completo; nunca se envian solo
 *    los digitos para contactos con Linked-ID (genera HTTP 400 "exists: false").
 * 2. Fallback automatico: si Evolution responde 400 con "exists: false", se
 *    reintenta la peticion con el sufijo @lid automaticamente.
 * Ver: src/lib/channels/evolution-patches.ts (modulo canonico de estas reglas)
 */

export type EvolutionConfig = {
  apiUrl: string;
  apiKey: string;
  instance: string;
};

export type SendEvolutionTextOptions = {
  config: EvolutionConfig;
  recipient: string;
  text: string;
};

export type EvolutionSendResponse = {
  ok: boolean;
  messageId?: string;
  error?: string;
};

/** Resultado interno con indicador de fallback @lid. */
type InternalSendResult = EvolutionSendResponse & { lidFallback?: boolean };

/**
 * Envia un mensaje de texto saliente a traves de Evolution API:
 * POST /message/sendText/{instance}
 *
 * PARCHE @lid: soporta JIDs con sufijo @lid (contactos de alta privacidad /
 * anuncios). Incluye reintento automatico si Evolution devuelve HTTP 400
 * con "exists": false al recibir solo los digitos.
 */
export async function sendEvolutionText(
  options: SendEvolutionTextOptions
): Promise<EvolutionSendResponse> {
  const { config, recipient, text } = options;

  if (!config.apiUrl || !config.apiKey || !config.instance) {
    return {
      ok: false,
      error: "Credenciales de Evolution API incompletas (requiere URL, API Key e Instancia)",
    };
  }

  let baseUrl = config.apiUrl.trim();
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const endpoint = `${baseUrl}/message/sendText/${encodeURIComponent(
    config.instance.trim()
  )}`;

  // PARCHE @lid: preservar JIDs especiales (@lid, @s.whatsapp.net, @g.us).
  // Antes: recipient.replace(/\D/g, "") destruia el JID y causaba HTTP 400.
  const formattedRecipient = formatEvolutionRecipient(recipient);

  const result = await doSendEvolutionText(endpoint, config.apiKey, formattedRecipient, text);

  // PARCHE @lid — Fallback automatico: si Evolution responde 400 "exists: false"
  // y el recipient NO era ya un @lid, reintenta con sufijo @lid.
  if (!result.ok && result.lidFallback && !recipient.includes("@lid")) {
    const lidRecipient = buildLidFallback(formattedRecipient);
    const retryResult = await doSendEvolutionText(endpoint, config.apiKey, lidRecipient, text);
    if (retryResult.ok) return retryResult;
  }

  return { ok: result.ok, messageId: result.messageId, error: result.error };
}

/**
 * Ejecuta la peticion HTTP a Evolution API /message/sendText.
 * Devuelve `lidFallback: true` si el error es HTTP 400 "exists: false"
 * (JID @lid enviado como digitos puros).
 */
async function doSendEvolutionText(
  endpoint: string,
  apiKey: string,
  number: string,
  text: string
): Promise<InternalSendResult> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey.trim(),
      },
      body: JSON.stringify({ number, text }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const lidFallback = response.status === 400 && isLidNotFoundError(errorText);
      return {
        ok: false,
        error: `Evolution API HTTP ${response.status}: ${errorText}`,
        lidFallback,
      };
    }

    const data = (await response.json()) as {
      key?: { id?: string };
      id?: string;
      message?: { key?: { id?: string } };
    };

    const messageId = data?.key?.id || data?.message?.key?.id || data?.id;

    return {
      ok: true,
      messageId: messageId ?? undefined,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Error de red contactando Evolution API: ${msg}`,
    };
  }
}

// ─── Utilidades inline ────────────────────────────────────────────────────────
// Duplicadas desde src/lib/channels/evolution-patches.ts para evitar
// dependencia circular lib <-> server.

/** Preserva JIDs @lid, @s.whatsapp.net y @g.us; limpia digitos en lo demas. */
function formatEvolutionRecipient(recipient: string): string {
  if (
    recipient.includes("@lid") ||
    recipient.includes("@s.whatsapp.net") ||
    recipient.includes("@g.us")
  ) {
    return recipient;
  }
  return recipient.replace(/\D/g, "");
}

/** Construye el JID @lid para el reintento automatico. */
function buildLidFallback(recipient: string): string {
  const base = recipient.split("@")[0] ?? recipient;
  return `${base}@lid`;
}

/** Detecta el error HTTP 400 "exists: false" de Evolution API v2. */
function isLidNotFoundError(errorText: string): boolean {
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
