/**
 * 067 — Lo puro del módulo de preguntas de Mercado Libre.
 *
 * Aquí no hay base de datos ni red: solo las decisiones que una prueba puede
 * fijar sin levantar nada. Lo usan la pantalla de Preguntas, la API y el
 * servicio del servidor, así que no puede importar nada de `src/server/`.
 */

/**
 * Cómo contesta la IA las preguntas de las publicaciones.
 *
 * - `off`: no contesta. La pregunta llega a la bandeja y espera a una persona.
 * - `copiloto`: la IA escribe un borrador y una persona lo aprueba. Es el modo
 *   por omisión: publicar sin que nadie lea lo que dice un modelo, sobre una
 *   publicación que vende, es un riesgo que el negocio debe elegir.
 * - `automatico`: la IA publica la respuesta y deja constancia de que fue ella.
 *   Solo se permite cuando hay FAQ aprendidas: contestar de la nada lo que el
 *   negocio nunca dijo es inventar, y una respuesta inventada en ML se paga con
 *   una reclamo público.
 */
export const ML_QA_MODES = ["off", "copiloto", "automatico"] as const;

export type MlQaMode = (typeof ML_QA_MODES)[number];

export const ML_QA_MODE_LABEL: Record<MlQaMode, string> = {
    off: "Apagada",
    copiloto: "Copiloto",
    automatico: "Automático",
};

export const ML_QA_MODE_DESCRIPTION: Record<MlQaMode, string> = {
    off: "Las preguntas llegan a la bandeja y esperan a una persona.",
    copiloto: "La IA escribe un borrador y tú lo apruebas antes de publicarlo.",
    automatico: "La IA publica la respuesta sola. Requiere respuestas aprendidas.",
};

/** El modo por omisión: nadie publica sin leer hasta que el dueño lo decida. */
export const ML_QA_MODE_DEFAULT: MlQaMode = "copiloto";

/** El tope de caracteres de una respuesta en ML. */
export const ML_ANSWER_MAX_CHARS = 2000;

/** El tope del texto de una pregunta, por si llega basura del webhook. */
export const ML_QUESTION_MAX_CHARS = 2000;

export function esMlQaMode(valor: unknown): valor is MlQaMode {
    return typeof valor === "string" && (ML_QA_MODES as readonly string[]).includes(valor);
}

/** Un modo desconocido (fila vieja, valor sucio) cae al de omisión. */
export function modoDe(valor: string | null | undefined): MlQaMode {
    return esMlQaMode(valor) ? valor : ML_QA_MODE_DEFAULT;
}

/**
 * Normaliza una pregunta para compararla con las FAQ: minúsculas, sin acentos,
 * sin signos y con los espacios colapsados. «¿Hacen envíos a Caracas?» y
 * «hacen envios a caracas» tienen que caer en la misma clave.
 */
export function normalizarPregunta(texto: string): string {
    return texto
        .normalize("NFD")
        // Quita los diacríticos que NFD separó de su letra.
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9ñ\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/** Las palabras de una pregunta normalizada, sin las vacías del español. */
const VACIAS = new Set([
    "el", "la", "los", "las", "un", "una", "unos", "unas",
    "de", "del", "al", "a", "en", "con", "por", "para", "que",
    "y", "o", "u", "es", "son", "hay", "tiene", "tienen", "se",
    "me", "te", "le", "lo", "mi", "tu", "su", "sus", "muy",
    "como", "cuando", "donde", "cuanto", "cuanta", "cual",
]);

export function palabrasClave(texto: string): string[] {
    return normalizarPregunta(texto)
        .split(" ")
        .filter((p) => p.length > 2 && !VACIAS.has(p));
}

/** Las palabras que el dueño escribió como disparadores, ya normalizadas. */
export function palabrasDeDisparo(keywords: string | null | undefined): string[] {
    if (!keywords) return [];
    return keywords
        .split(/[,\n;]/)
        .map((k) => normalizarPregunta(k))
        .filter(Boolean);
}

/**
 * Cuánto se parece una pregunta a una FAQ, de 0 a 1.
 *
 * Es a propósito simple y explicable: no hay embeddings ni modelo, porque el
 * dueño tiene que poder mirar una FAQ y entender por qué dispara. Cuenta dos
 * cosas:
 *
 *  1. Palabras clave declaradas: si la pregunta trae alguna, eso manda.
 *  2. Parecido de palabras: cuántas de la pregunta están en la FAQ.
 *
 * Un umbral alto (ver `UMBRAL_FAQ`) evita que «¿tienen stock?» se conteste con
 * la FAQ de envíos solo porque comparten una palabra.
 */
export function parecidoConFaq(
    pregunta: string,
    faq: { question: string; keywords?: string | null }
): number {
    const deLaPregunta = new Set(palabrasClave(pregunta));
    if (deLaPregunta.size === 0) return 0;

    const disparos = palabrasDeDisparo(faq.keywords);
    if (disparos.length > 0) {
        const acertados = disparos.filter((d) =>
            // Un disparo vale si aparece en la pregunta, ya sea como palabra suelta
            // ("envio") o dentro de una palabra ("envios"). Es lo que espera quien
            // escribe la palabra clave.
            [...deLaPregunta].some((p) => p === d || p.includes(d))
        );
        if (acertados.length > 0) {
            // Con disparos, el parecido es la fracción de disparos acertados, pero
            // nunca por debajo de 0.8: haber escrito la palabra clave es una señal
            // fuerte y deliberada del dueño.
            return Math.max(0.8, acertados.length / disparos.length);
        }
    }

    const deLaFaq = new Set(palabrasClave(faq.question));
    if (deLaFaq.size === 0) return 0;
    let comunes = 0;
    for (const p of deLaPregunta) if (deLaFaq.has(p)) comunes++;
    // Se mide contra la pregunta, no contra la FAQ: una FAQ larga no debe
    // diluirse por tener muchas palabras.
    return comunes / deLaPregunta.size;
}

/** A partir de aquí una FAQ se considera la respuesta a la pregunta. */
export const UMBRAL_FAQ = 0.7;

/**
 * La mejor FAQ para una pregunta, o `null` si ninguna llega al umbral.
 * Empata a favor de la más usada: lo que ya sirvió, sirve.
 */
export function mejorFaq<
    T extends { question: string; keywords?: string | null; hits?: number },
>(pregunta: string, faqs: readonly T[]): { faq: T; score: number } | null {
    let mejor: { faq: T; score: number } | null = null;
    for (const faq of faqs) {
        const score = parecidoConFaq(pregunta, faq);
        if (score < UMBRAL_FAQ) continue;
        if (
            !mejor ||
            score > mejor.score ||
            (score === mejor.score && (faq.hits ?? 0) > (mejor.faq.hits ?? 0))
        ) {
            mejor = { faq, score };
        }
    }
    return mejor;
}

/** Los estados en que puede estar una pregunta. */
export const ML_QUESTION_STATUSES = [
    "unanswered",
    "drafted",
    "answered",
    "ignored",
] as const;

export type MlQuestionStatus = (typeof ML_QUESTION_STATUSES)[number];

export const ML_QUESTION_STATUS_LABEL: Record<MlQuestionStatus, string> = {
    unanswered: "Sin responder",
    drafted: "Borrador listo",
    answered: "Respondida",
    ignored: "Descartada",
};

/** Lo que el dueño ve primero: lo que espera respuesta. */
export function esPendiente(status: string): boolean {
    return status === "unanswered" || status === "drafted";
}

/**
 * Recorta una respuesta al tope de ML sin cortar una palabra por la mitad.
 * Un texto vacío después de recortar no es una respuesta: devuelve `null`.
 */
export function recortarRespuesta(texto: string): string | null {
    const limpio = texto.trim();
    if (!limpio) return null;
    if (limpio.length <= ML_ANSWER_MAX_CHARS) return limpio;
    const corte = limpio.slice(0, ML_ANSWER_MAX_CHARS);
    const ultimoEspacio = corte.lastIndexOf(" ");
    return (ultimoEspacio > 0 ? corte.slice(0, ultimoEspacio) : corte).trim() || null;
}
