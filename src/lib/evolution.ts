/**
 * Servicio cliente para Evolution API (WhatsApp Baileys / Evolution API v1/v2).
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

/**
 * Envía un mensaje de texto saliente a través de Evolution API:
 * POST /message/sendText/{instance}
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

  // Normalizar número eliminando caracteres no numéricos salvo el sufijo si aplica
  const cleanedRecipient = recipient.replace(/\D/g, "");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.apiKey.trim(),
      },
      body: JSON.stringify({
        number: cleanedRecipient,
        text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        ok: false,
        error: `Evolution API HTTP ${response.status}: ${errorText}`,
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
