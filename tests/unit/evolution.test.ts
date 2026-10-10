import { describe, expect, it, vi } from "vitest";
import { sendEvolutionText } from "@/lib/evolution";

describe("Evolution API Client", () => {
  it("envía mensaje de texto a la URL e instancia configurada", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        key: { id: "evo_msg_12345" },
        status: "PENDING",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendEvolutionText({
      config: {
        apiUrl: "https://api.evolution.com/",
        apiKey: "secret_api_key_123",
        instance: "mi-instancia",
      },
      recipient: "5215551234567",
      text: "Hola desde Vocero CRM",
    });

    expect(res.ok).toBe(true);
    expect(res.messageId).toBe("evo_msg_12345");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.evolution.com/message/sendText/mi-instancia",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: "secret_api_key_123",
        },
        body: JSON.stringify({
          number: "5215551234567",
          text: "Hola desde Vocero CRM",
        }),
      }
    );

    vi.unstubAllGlobals();
  });

  it("retorna error cuando la API devuelve un código de estado HTTP 400/500", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendEvolutionText({
      config: {
        apiUrl: "https://api.evolution.com",
        apiKey: "bad_key",
        instance: "instancia",
      },
      recipient: "5215551234567",
      text: "Prueba",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("HTTP 401: Unauthorized");

    vi.unstubAllGlobals();
  });
});
