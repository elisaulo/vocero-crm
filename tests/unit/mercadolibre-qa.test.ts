import { describe, expect, it } from "vitest";
import {
    ML_ANSWER_MAX_CHARS,
    ML_QA_MODE_DEFAULT,
    ML_QA_MODE_LABEL,
    ML_QA_MODES,
    ML_QUESTION_STATUS_LABEL,
    ML_QUESTION_STATUSES,
    UMBRAL_FAQ,
    esMlQaMode,
    esPendiente,
    mejorFaq,
    modoDe,
    normalizarPregunta,
    palabrasClave,
    palabrasDeDisparo,
    parecidoConFaq,
    recortarRespuesta,
} from "@/lib/mercadolibre/qa";

describe("el modo de Q&A se guarda y se lee sin sorpresas", () => {
    it("los tres modos son los que la UI ofrece, con su etiqueta", () => {
        expect(ML_QA_MODES).toEqual(["off", "copiloto", "automatico"]);
        for (const modo of ML_QA_MODES) {
            expect(ML_QA_MODE_LABEL[modo]).toBeTruthy();
        }
    });

    it("el modo por defecto es Copiloto: nadie contesta solo sin pedirlo", () => {
        expect(ML_QA_MODE_DEFAULT).toBe("copiloto");
    });

    it("esMlQaMode acepta solo los tres modos", () => {
        expect(esMlQaMode("off")).toBe(true);
        expect(esMlQaMode("copiloto")).toBe(true);
        expect(esMlQaMode("automatico")).toBe(true);
        expect(esMlQaMode("automatic")).toBe(false);
        expect(esMlQaMode("")).toBe(false);
        expect(esMlQaMode(null)).toBe(false);
        expect(esMlQaMode(3)).toBe(false);
    });

    it("modoDe cae en el de por defecto cuando la columna está vacía o trae basura", () => {
        expect(modoDe("automatico")).toBe("automatico");
        expect(modoDe("off")).toBe("off");
        expect(modoDe(null)).toBe(ML_QA_MODE_DEFAULT);
        expect(modoDe(undefined)).toBe(ML_QA_MODE_DEFAULT);
        expect(modoDe("loquesea")).toBe(ML_QA_MODE_DEFAULT);
    });
});

describe("normalizarPregunta", () => {
    it("quita acentos, baja a minúsculas y colapsa los espacios", () => {
        expect(normalizarPregunta("  ¿Tienen   ENVÍO a Córdoba?  ")).toBe("tienen envio a cordoba");
    });

    it("la puntuación se vuelve espacio, no se pega a la palabra", () => {
        expect(normalizarPregunta("precio,final.")).toBe("precio final");
    });

    it("la ñ cae a n: quien escribe «ano» y quien escribe «año» llegan al mismo lado", () => {
        expect(normalizarPregunta("AÑO")).toBe("ano");
        expect(normalizarPregunta("año")).toBe(normalizarPregunta("ano"));
    });

    it("un texto vacío o solo de signos queda vacío", () => {
        expect(normalizarPregunta("")).toBe("");
        expect(normalizarPregunta("¿?!")).toBe("");
    });
});

describe("palabrasClave", () => {
    it("descarta las palabras vacías y las de dos letras o menos", () => {
        expect(palabrasClave("¿Cuál es el precio del envío?")).toEqual(["precio", "envio"]);
    });

    it("repite una palabra si aparece dos veces: cuenta para el parecido", () => {
        expect(palabrasClave("stock stock")).toEqual(["stock", "stock"]);
    });

    it("sin palabras útiles devuelve una lista vacía", () => {
        expect(palabrasClave("de la y el")).toEqual([]);
    });
});

describe("palabrasDeDisparo", () => {
    it("separa por coma, punto y coma y salto de línea", () => {
        expect(palabrasDeDisparo("envio, stock; precio\ngarantia")).toEqual([
            "envio",
            "stock",
            "precio",
            "garantia",
        ]);
    });

    it("normaliza cada disparo y tira los huecos", () => {
        expect(palabrasDeDisparo(" Envío ,, , Garantía ")).toEqual(["envio", "garantia"]);
    });

    it("sin keywords no hay disparos", () => {
        expect(palabrasDeDisparo(null)).toEqual([]);
        expect(palabrasDeDisparo(undefined)).toEqual([]);
        expect(palabrasDeDisparo("")).toEqual([]);
    });
});

describe("parecidoConFaq", () => {
    it("un disparo acertado vale al menos 0.8, aunque haya muchos", () => {
        const score = parecidoConFaq("¿hacen envio?", {
            question: "Envíos",
            keywords: "envio, envios, despacho, flete, correo",
        });
        expect(score).toBeGreaterThanOrEqual(0.8);
    });

    it("sin disparos, mide las palabras en común contra la PREGUNTA, no contra la FAQ", () => {
        // La pregunta tiene 2 palabras útiles y ambas están en la FAQ → 1.
        expect(parecidoConFaq("precio envio", { question: "precio envio garantia stock" })).toBe(1);
        // La pregunta tiene 4 palabras útiles y solo 2 están en la FAQ → 0.5.
        expect(
            parecidoConFaq("precio envio garantia stock", { question: "precio envio" }),
        ).toBe(0.5);
    });

    it("una pregunta sin palabras útiles no se parece a nada", () => {
        expect(parecidoConFaq("de la y el", { question: "precio envio" })).toBe(0);
    });

    it("el umbral está en 0.7: por debajo no se ofrece la FAQ", () => {
        expect(UMBRAL_FAQ).toBe(0.7);
        const score = parecidoConFaq("precio envio garantia stock", { question: "precio envio" });
        expect(score).toBeLessThan(UMBRAL_FAQ);
    });
});

describe("mejorFaq", () => {
    const faqs = [
        { id: "a", question: "precio envio", keywords: null, hits: 1 },
        { id: "b", question: "precio envio", keywords: null, hits: 9 },
        { id: "c", question: "garantia devolucion", keywords: null, hits: 0 },
    ];

    it("devuelve la FAQ que pasa el umbral", () => {
        const mejor = mejorFaq("precio envio", faqs);
        expect(mejor?.faq.id).toBe("b");
        expect(mejor?.score).toBeGreaterThanOrEqual(UMBRAL_FAQ);
    });

    it("a igual puntaje gana la que más veces acertó", () => {
        const mejor = mejorFaq("precio envio", faqs);
        expect(mejor?.faq.hits).toBe(9);
    });

    it("si ninguna pasa el umbral, no hay sugerencia", () => {
        expect(mejorFaq("horario atencion", faqs)).toBeNull();
    });

    it("sin FAQs no hay sugerencia", () => {
        expect(mejorFaq("precio envio", [])).toBeNull();
    });
});

describe("el estado de una pregunta", () => {
    it("los cuatro estados tienen etiqueta", () => {
        expect(ML_QUESTION_STATUSES).toEqual(["unanswered", "drafted", "answered", "ignored"]);
        for (const estado of ML_QUESTION_STATUSES) {
            expect(ML_QUESTION_STATUS_LABEL[estado]).toBeTruthy();
        }
    });

    it("pendiente es lo que espera a alguien: sin responder o con borrador", () => {
        expect(esPendiente("unanswered")).toBe(true);
        expect(esPendiente("drafted")).toBe(true);
        expect(esPendiente("answered")).toBe(false);
        expect(esPendiente("ignored")).toBe(false);
    });
});

describe("recortarRespuesta", () => {
    it("un texto vacío o de espacios no es respuesta", () => {
        expect(recortarRespuesta("")).toBeNull();
        expect(recortarRespuesta("   \n  ")).toBeNull();
    });

    it("lo que cabe pasa tal cual, sin tocar", () => {
        expect(recortarRespuesta("  Hola, sí tenemos stock.  ")).toBe("Hola, sí tenemos stock.");
    });

    it("lo que no cabe se corta en el último espacio antes del tope, nunca a mitad de palabra", () => {
        const largo = `${"palabra ".repeat(400)}final`;
        const recortada = recortarRespuesta(largo);
        expect(recortada).not.toBeNull();
        expect(recortada!.length).toBeLessThanOrEqual(ML_ANSWER_MAX_CHARS);
        expect(recortada!.endsWith("palabra")).toBe(true);
        expect(recortada!.endsWith("palabr")).toBe(false);
    });
});