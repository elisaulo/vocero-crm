import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatJson, extractJson } from "@/lib/ai";
import type { AiCredentialSecret } from "@/server/ai/credentials";

/**
 * #85 — La fila de Ajustes → IA de la organización, simulada. Sin fila
 * (`null`) el adaptador cae a las variables del entorno de abajo. Las marcas
 * de estado se capturan en vez de escribirse.
 */
const fila: { current: AiCredentialSecret | null } = { current: null };
const marcas: { status: number; nuevo: string }[] = [];

vi.mock("@/server/ai/credentials", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/ai/credentials")>();
  return {
    ...original,
    getAiCredentialSecret: async () => fila.current,
    getAiCredentialPublic: async () => fila.current,
    marcarEstadoPorRespuesta: async (_org: string, status: number) => {
      const nuevo = original.estadoSegunRespuesta(status);
      if (!nuevo) return false;
      marcas.push({ status, nuevo });
      return true;
    },
  };
});

const FILA_ORG: AiCredentialSecret = {
  provider: "openai_compatible",
  baseUrl: "https://proveedor.test/v1",
  model: "org/modelo",
  tokenLast4: "1234",
  status: "active",
  statusReason: null,
  statusChangedAt: null,
  updatedAt: new Date(),
  token: "tok-org-1234",
};

describe("extractJson (extracción robusta)", () => {
  it("JSON limpio", () => {
    expect(extractJson('{"action":"none"}')).toEqual({ action: "none" });
  });

  it("bloque ```json con texto alrededor", () => {
    const raw = 'Claro, aquí está:\n```json\n{"action":"reply","text":"hola"}\n```\nEspero que sirva.';
    expect(extractJson(raw)).toEqual({ action: "reply", text: "hola" });
  });

  it("JSON incrustado en prosa (primer { al último })", () => {
    const raw = 'La acción que tomaré es {"action":"handoff","reason":"cliente"} por lo dicho.';
    expect(extractJson(raw)).toEqual({ action: "handoff", reason: "cliente" });
  });

  it("sin JSON → null", () => {
    expect(extractJson("no tengo nada que decir")).toBeNull();
  });
});

describe("chatJson (reintentos y errores tipados)", () => {
  const schema = z.object({ action: z.literal("reply"), text: z.string() });

  beforeEach(() => {
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgresql://t:t@localhost:5432/t");
    vi.stubEnv("BETTER_AUTH_SECRET", "secret-de-test-suficiente");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-test");
    vi.stubEnv("OPENROUTER_API_TOKEN", "token-test");
    vi.stubEnv("OPENROUTER_MODEL", "modelo-test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fila.current = null;
    marcas.length = 0;
  });

  function providerResponse(content: string) {
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  it("salida inválida al primer intento → reintenta con STRICT y triunfa", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerResponse("no soy json"))
      .mockResolvedValueOnce(providerResponse('{"action":"reply","text":"ok"}'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(schema, [{ role: "user", content: "hola" }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // el reintento agrega la instrucción STRICT
    const secondBody = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string);
    expect(JSON.stringify(secondBody.messages)).toContain("STRICT");
  });

  it("proveedor caído (500 persistente) → error tipado, jamás excepción", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response("boom", { status: 500 }))
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(schema, [{ role: "user", content: "hola" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("provider_error");
    expect(fetchMock).toHaveBeenCalledTimes(3); // agotó los 3 intentos
  });

  it("salida que nunca cumple el esquema → invalid_output", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(providerResponse('{"action":"otra_cosa"}'))
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(schema, [{ role: "user", content: "hola" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_output");
  });

  it("sin token → not_configured sin tocar la red", async () => {
    vi.stubEnv("OPENROUTER_API_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(schema, [{ role: "user", content: "hola" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // ---- #85: la fila de Ajustes → IA ----------------------------------------

  it("la fila de la organización manda sobre el entorno: su base URL, su modelo y su llave", async () => {
    fila.current = FILA_ORG;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerResponse('{"action":"reply","text":"ok"}'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(schema, [{ role: "user", content: "hola" }], {
      organizationId: "org_1",
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://proveedor.test/v1/chat/completions");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer tok-org-1234",
    });
    expect(JSON.parse((init as RequestInit).body as string).model).toBe("org/modelo");
  });

  it("401 sobre la fila → pausa por llave y NO reintenta", async () => {
    fila.current = FILA_ORG;
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response("unauthorized", { status: 401 })));
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(schema, [{ role: "user", content: "hola" }], {
      organizationId: "org_1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("provider_error");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(marcas).toEqual([{ status: 401, nuevo: "paused_invalid_token" }]);
  });

  it("402 sobre la fila → pausa por saldo", async () => {
    fila.current = FILA_ORG;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(new Response("", { status: 402 })))
    );
    await chatJson(schema, [{ role: "user", content: "hola" }], { organizationId: "org_1" });
    expect(marcas).toEqual([{ status: 402, nuevo: "paused_no_credit" }]);
  });

  it("429 sobre la fila → no pausa y agota los reintentos", async () => {
    fila.current = FILA_ORG;
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response("slow down", { status: 429 })));
    vi.stubGlobal("fetch", fetchMock);
    await chatJson(schema, [{ role: "user", content: "hola" }], { organizationId: "org_1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(marcas).toEqual([]);
  });

  it("fila pausada → not_configured sin tocar la red, aunque el entorno tenga token", async () => {
    fila.current = { ...FILA_ORG, status: "paused_no_credit" };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await chatJson(schema, [{ role: "user", content: "hola" }], {
      organizationId: "org_1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("not_configured");
      expect(result.detail).toContain("saldo");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("401 con la llave del entorno (sin fila) → reintenta y no marca nada", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response("", { status: 401 })));
    vi.stubGlobal("fetch", fetchMock);
    await chatJson(schema, [{ role: "user", content: "hola" }], { organizationId: "org_1" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(marcas).toEqual([]);
  });
});

describe("v2.7.6 — proveedores OpenAI-compatible (MiraiAPI/Claude)", () => {
  const schema = z.object({ action: z.literal("reply"), text: z.string() });

  beforeEach(() => {
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    vi.stubEnv("DATABASE_URL", "postgresql://t:t@localhost:5432/t");
    vi.stubEnv("BETTER_AUTH_SECRET", "secret-de-test-suficiente");
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 3).toString("base64"));
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "verify-test");
    vi.stubEnv("OPENROUTER_API_TOKEN", "token-test");
    vi.stubEnv("OPENROUTER_MODEL", "modelo-test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    fila.current = null;
  });

  function providerResponse(content: string) {
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  it("api.miraiapi.com/v1 → /chat/completions sin duplicar /v1, con max_tokens y sin response_format ni tools", async () => {
    fila.current = {
      ...FILA_ORG,
      baseUrl: "https://api.miraiapi.com/v1",
      model: "claude-opus-4.6",
      token: "sk-mirai-9999",
      tokenLast4: "9999",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerResponse('{"action":"reply","text":"ok"}'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(schema, [{ role: "user", content: "hola" }], {
      organizationId: "org_1",
    });
    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    // URL correcta: /v1/chat/completions, sin /v1/v1
    expect(url).toBe("https://api.miraiapi.com/v1/chat/completions");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("claude-opus-4.6");
    // max_tokens explícito: los proxys de Claude lo exigen o truncar a 16
    expect(body.max_tokens).toBe(4096);
    // Nada de response_format, tools, parallel_tool_calls ni strict:
    // combos que los proxys de Claude rechazan
    expect(body).not.toHaveProperty("response_format");
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("parallel_tool_calls");
  });

  it("baseUrl sin /v1 también normaliza a /chat/completions", async () => {
    fila.current = {
      ...FILA_ORG,
      baseUrl: "https://api.miraiapi.com",
      model: "claude-opus-4.6",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerResponse('{"action":"reply","text":"ok"}'));
    vi.stubGlobal("fetch", fetchMock);

    await chatJson(schema, [{ role: "user", content: "hola" }], {
      organizationId: "org_1",
    });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.miraiapi.com/v1/chat/completions");
  });

  it("los system intercalados (reintento STRICT) se consolidan al frente", async () => {
    fila.current = FILA_ORG;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(providerResponse("no soy json"))
      .mockResolvedValueOnce(providerResponse('{"action":"reply","text":"ok"}'));
    vi.stubGlobal("fetch", fetchMock);

    const result = await chatJson(
      schema,
      [
        { role: "system", content: "Eres un agente." },
        { role: "user", content: "hola" },
      ],
      { organizationId: "org_1" }
    );
    expect(result.ok).toBe(true);
    // Segundo intento: el STRICT añadido al final debe quedar consolidado
    // al frente junto al system original, nunca después del user.
    const body = JSON.parse(fetchMock.mock.calls[1]![1]!.body as string);
    const roles = body.messages.map((m: { role: string }) => m.role);
    expect(roles).toEqual(["system", "user"]);
    expect(body.messages[0].content).toContain("Eres un agente.");
    expect(body.messages[0].content).toContain("STRICT");
  });
});
