import { apiRoot } from "@/lib/ai/presets";
import { resolveAiProvider } from "@/lib/ai/provider";
import { marcarEstadoPorRespuesta } from "@/server/ai/credentials";

/**
 * v2.7.6 — `max_tokens` que se inyecta al cuerpo del cerebro cuando no lo trae.
 *
 * Proveedores OpenAI-compatible que proxean Claude (MiraiAPI, etc.) rechazan
 * la petición sin `max_tokens` o le aplican un mínimo que trunca la respuesta,
 * y el turno del Laboratorio muere con «el agente no contestó». El SDK del
 * cerebro no siempre lo manda: aquí se completa ANTES de reenviar. Es el único
 * campo que se toca: el resto del cuerpo viaja tal como llegó.
 */
const MAX_TOKENS_DEFECTO = 4096;

/**
 * v2.7.6 — Si la ruta es `chat/completions` y el cuerpo es JSON sin
 * `max_tokens`, se lo agrega. Cualquier cuerpo que no se pueda leer (otra
 * ruta, JSON inválido, binario) sale intacto: el proxy sigue sin interpretar.
 */
export function cuerpoConMaxTokens(ruta: string, cuerpoCrudo: string): string {
  if (ruta !== "chat/completions") return cuerpoCrudo;
  try {
    const cuerpo = JSON.parse(cuerpoCrudo) as Record<string, unknown>;
    if (cuerpo === null || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return cuerpoCrudo;
    if (cuerpo.max_tokens !== undefined) return cuerpoCrudo;
    return JSON.stringify({ ...cuerpo, max_tokens: MAX_TOKENS_DEFECTO });
  } catch {
    return cuerpoCrudo;
  }
}

/**
 * 036 — El CRM piensa por el cerebro (`POST /api/bot/llm/{ruta}`).
 *
 * Puerto de `/api/brains/llm` de la edición cloud. La llave de IA se pone una
 * vez, en Ajustes → IA, y no sale del CRM: el cerebro (Nea) apunta el
 * `base_url` de su SDK de OpenAI aquí y el CRM le pone la llave al reenviar.
 * Así quien instala no la copia a dos lugares, una filtrada no viaja, y
 * cuando el proveedor la rechaza (401, o 402 sin saldo) es el CRM quien se
 * entera y la pausa en la pantalla, igual que con el agente que traía.
 *
 * No interpreta el cuerpo: se reenvía como llegó. La ÚNICA excepción (v2.7.6)
 * es `cuerpoConMaxTokens`, que completa `max_tokens` en `chat/completions`
 * cuando el cerebro no lo trae, porque los proxys de Claude lo exigen. Todo lo
 * demás viaja intacto: entenderlo convertiría al CRM en un mini-OpenRouter que
 * hay que actualizar cada vez que un proveedor agrega un campo.
 *
 * Sin lista de modelos permitidos, a diferencia de cloud (spec 036, D4): allá
 * el cerebro puede ser de un tercero; aquí lo pone quien instala y entra con
 * la misma `BOT_API_KEY` que ya escribe en la bandeja. El perfil le dice qué
 * modelo eligió el negocio (`llm.model`).
 */

/** Cuánto se espera a que el proveedor piense antes de rendirse. */
export const LLM_PROXY_TIMEOUT_MS = 120_000;

export type ResultadoProxy =
  | { ok: true; status: number; cuerpo: string; contentType: string }
  | { ok: false; status: number; code: string; message: string };

export async function pensarPorElCerebro(input: {
  organizationId: string;
  /** Lo que viene después de `/api/bot/llm/`: `chat/completions` hoy. */
  ruta: string;
  cuerpoCrudo: string;
  contentType: string | null;
}): Promise<ResultadoProxy> {
  const r = await resolveAiProvider(input.organizationId);
  if (!r.ok) {
    return {
      ok: false,
      status: 402,
      code: "sin_credencial",
      message:
        r.estado.motivo === "sin_configurar"
          ? "No hay proveedor de IA configurado. Ponlo en Ajustes → IA."
          : "La llave de IA está pausada (el proveedor la rechazó). Revísala en Ajustes → IA.",
    };
  }
  const { provider } = r;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_PROXY_TIMEOUT_MS);
  const cuerpoSalida = cuerpoConMaxTokens(input.ruta, input.cuerpoCrudo);
  try {
    const url = `${apiRoot(provider.baseUrl)}/${input.ruta}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        // La llave se pone AQUÍ y solo aquí: no se loguea ni vuelve al cerebro.
        Authorization: `Bearer ${provider.token}`,
        "Content-Type": input.contentType ?? "application/json",
      },
      body: cuerpoSalida,
      signal: controller.signal,
    });
    const cuerpo = await res.text();

    // El estado de la credencial lo dicta quien cobra. El respaldo del
    // entorno no tiene fila que pausar. `.catch`: un fallo al escribir el
    // estado no convierte la respuesta del proveedor en un error.
    if (!res.ok && provider.source === "org") {
      await marcarEstadoPorRespuesta(input.organizationId, res.status, cuerpo.slice(0, 200)).catch(
        () => { }
      );
    }

    // v2.7.6 — Log del error HTTP REAL (sin la llave, ni el token del proveedor):
    // sin esto el Laboratorio solo enseña «el agente no contestó» y no dice por qué.
    if (!res.ok) {
      console.error(`[llm-proxy] proveedor respondió ${res.status} en ${url}: ${cuerpo.slice(0, 300)}`);
    }

    return {
      ok: true,
      status: res.status,
      cuerpo,
      contentType: res.headers.get("content-type") ?? "application/json",
    };
  } catch (err) {
    // Timeout o red: no fue el proveedor quien rechazó la llave, no se pausa.
    return {
      ok: false,
      status: 504,
      code: "proveedor_sin_respuesta",
      message: err instanceof Error && err.name === "AbortError" ? "El proveedor no contestó a tiempo" : "No se pudo hablar con el proveedor",
    };
  } finally {
    clearTimeout(timer);
  }
}
