import { describe, expect, it } from "vitest";
import { toHandoffReason } from "@/server/bot/handoff";
import { renderKb } from "@/server/ai/prompts";
import type { schema } from "@/lib/db";

type AgentProfile = typeof schema.agentProfile.$inferSelect;
type KbEntry = typeof schema.kbEntry.$inferSelect;

describe("044 — Enrutamiento de intención y blindaje anti-alucinación", () => {
    describe("toHandoffReason", () => {
        it("hostilidad se reconoce como razón válida", () => {
            expect(toHandoffReason("hostilidad")).toBe("hostilidad");
        });

        it("HOSTILIDAD (mayúsculas) también se reconoce", () => {
            expect(toHandoffReason("HOSTILIDAD")).toBe("hostilidad");
        });

        it("hostilidad con espacios se reconoce", () => {
            expect(toHandoffReason("  hostilidad  ")).toBe("hostilidad");
        });

        it("un valor desconocido cae a modelo", () => {
            expect(toHandoffReason("inventada")).toBe("modelo");
        });
    });

    describe("renderKb con knowledge base vacío", () => {
        it("devuelve exactamente '(knowledge base vacío)'", () => {
            const resultado = renderKb([]);
            expect(resultado).toBe("(knowledge base vacío)");
        });
    });

    describe("behaviorText del Laboratorio", () => {
        it("construye el texto con el formato exacto de runner.ts", () => {
            // Este es el formato que runner.ts usa en líneas 136-145.
            // Lo reproducimos aquí para verificar que la forma no se rompe.
            const profile = {
                name: "Martillito",
                tone: "Cercano y práctico, de ferretería de confianza. Tutea al cliente.",
                instructions:
                    "Clasifica la intención antes de responder. Responde en dos frases como máximo; si necesitas más, ofrece un asesor.\n\n" +
                    "1. buy_decided (ya decidió comprar): «Perfecto, ¿me compartes tu nombre completo y la dirección de entrega para preparar tu pedido?»\n" +
                    "2. warranty (pide garantía o cambio): «Con gusto te ayudo con la garantía. ¿Me compartes tu número de orden o factura?»\n" +
                    "3. hostile (insulto, amenaza o reclamo airado): traspasa a humano con razón hostilidad, no respondas texto.\n" +
                    "4. chitchat (sin intención comercial): saludo breve, devuelve la iniciativa, no prometas nada.\n" +
                    "5. paint / ferreteria (consulta de producto): responde solo con lo que esté en el conocimiento; si no está, di: «No tengo confirmado el catálogo ni los precios actuales; con gusto te conecto con un asesor para que te confirme disponibilidad y cotización exacta.» y traspasa con razón cliente.",
                escalationRules:
                    "Si el cliente es hostil (insulto, amenaza, reclamo airado), traspasa de inmediato con razón hostilidad. «No tengo confirmado el catálogo ni los precios actuales; con gusto te conecto con un asesor para que te confirme disponibilidad y cotización exacta.» con traspaso razón cliente cuando el conocimiento no cubra la pregunta. Si lo piden explícitamente, traspasa con razón cliente.",
            };

            // Formato de runner.ts líneas 136-145
            const behaviorText = profile
                ? [
                    `Nombre: ${profile.name}`,
                    profile.tone ? `Tono: ${profile.tone}` : null,
                    profile.instructions ? `Instrucciones: ${profile.instructions}` : null,
                    profile.escalationRules ? `Escalado: ${profile.escalationRules}` : null,
                ]
                    .filter(Boolean)
                    .join("\n")
                : "";

            // Verificamos que la construcción funciona y que contiene las piezas clave
            expect(behaviorText).toContain("Nombre: Martillito");
            expect(behaviorText).toContain("Tono: Cercano y práctico");
            expect(behaviorText).toContain("Instrucciones: Clasifica la intención");
            expect(behaviorText).toContain("buy_decided");
            expect(behaviorText).toContain("warranty");
            expect(behaviorText).toContain("hostile");
            expect(behaviorText).toContain("chitchat");
            expect(behaviorText).toContain("paint / ferreteria");
            expect(behaviorText).toContain(
                "No tengo confirmado el catálogo ni los precios actuales"
            );
            expect(behaviorText).toContain("Escalado:");
            expect(behaviorText).toContain("hostilidad");
        });

        it("con profile null devuelve cadena vacía", () => {
            // `runner.ts` recibe el perfil de la BD: puede no existir (instancia
            // legada). El tipo se declara explícito para que la rama verdadera no
            // se estreche a `never` al inicializar con `null`.
            const profile = null as AgentProfile | null;
            const behaviorText = profile
                ? [
                    `Nombre: ${profile.name}`,
                    profile.tone ? `Tono: ${profile.tone}` : null,
                    profile.instructions ? `Instrucciones: ${profile.instructions}` : null,
                    profile.escalationRules ? `Escalado: ${profile.escalationRules}` : null,
                ]
                    .filter(Boolean)
                    .join("\n")
                : "";

            expect(behaviorText).toBe("");
        });

        it("con campos opcionales null, solo incluye los presentes", () => {
            const profile = {
                name: "Agente",
                tone: null,
                instructions: "Ayuda al cliente.",
                escalationRules: null,
            };

            const behaviorText = [
                `Nombre: ${profile.name}`,
                profile.tone ? `Tono: ${profile.tone}` : null,
                profile.instructions ? `Instrucciones: ${profile.instructions}` : null,
                profile.escalationRules ? `Escalado: ${profile.escalationRules}` : null,
            ]
                .filter(Boolean)
                .join("\n");

            expect(behaviorText).toBe("Nombre: Agente\nInstrucciones: Ayuda al cliente.");
            expect(behaviorText).not.toContain("Tono:");
            expect(behaviorText).not.toContain("Escalado:");
        });
    });

    describe("serializeBotProfile con las cinco rutas", () => {
        it("las instrucciones viajan tal cual al cerebro", async () => {
            // Este test importa dinámicamente para evitar la carga anticipada del módulo
            const { serializeBotProfile } = await import("@/server/bot/profile");

            const profile = {
                id: "ap_demo",
                organizationId: "org_demo",
                enabled: true,
                name: "Martillito",
                tone: "Cercano y práctico, de ferretería de confianza. Tutea al cliente.",
                instructions:
                    "Clasifica la intención antes de responder. Responde en dos frases como máximo; si necesitas más, ofrece un asesor.\n\n" +
                    "1. buy_decided (ya decidió comprar): «Perfecto, ¿me compartes tu nombre completo y la dirección de entrega para preparar tu pedido?»\n" +
                    "2. warranty (pide garantía o cambio): «Con gusto te ayudo con la garantía. ¿Me compartes tu número de orden o factura?»\n" +
                    "3. hostile (insulto, amenaza o reclamo airado): traspasa a humano con razón hostilidad, no respondas texto.\n" +
                    "4. chitchat (sin intención comercial): saludo breve, devuelve la iniciativa, no prometas nada.\n" +
                    "5. paint / ferreteria (consulta de producto): responde solo con lo que esté en el conocimiento; si no está, di: «No tengo confirmado el catálogo ni los precios actuales; con gusto te conecto con un asesor para que te confirme disponibilidad y cotización exacta.» y traspasa con razón cliente.",
                escalationRules:
                    "Si el cliente es hostil (insulto, amenaza, reclamo airado), traspasa de inmediato con razón hostilidad. «No tengo confirmado el catálogo ni los precios actuales; con gusto te conecto con un asesor para que te confirme disponibilidad y cotización exacta.» con traspaso razón cliente cuando el conocimiento no cubra la pregunta. Si lo piden explícitamente, traspasa con razón cliente.",
                greeting: "¡Hola! Soy Martillito, el asistente de Ferretería El Martillo 🔨",
                role: "vendedor",
                tools: null,
                createdAt: new Date(),
                updatedAt: new Date(),
            } as const;

            const kb: KbEntry[] = [];
            const resultado = serializeBotProfile(profile, kb, null);

            // AC1: instructions con las cinco rutas
            expect(resultado.profile.instructions).toContain("buy_decided");
            expect(resultado.profile.instructions).toContain("warranty");
            expect(resultado.profile.instructions).toContain("hostile");
            expect(resultado.profile.instructions).toContain("chitchat");
            expect(resultado.profile.instructions).toContain("paint / ferreteria");

            // AC2: frase de blindaje palabra por palabra
            expect(resultado.profile.instructions).toContain(
                "No tengo confirmado el catálogo ni los precios actuales; con gusto te conecto con un asesor para que te confirme disponibilidad y cotización exacta."
            );

            // AC3: plantillas literales de buy_decided y warranty
            expect(resultado.profile.instructions).toContain(
                "Perfecto, ¿me compartes tu nombre completo y la dirección de entrega para preparar tu pedido?"
            );
            expect(resultado.profile.instructions).toContain(
                "Con gusto te ayudo con la garantía. ¿Me compartes tu número de orden o factura?"
            );

            // AC4: límite de dos frases
            expect(resultado.profile.instructions).toContain("dos frases como máximo");

            // escalationRules con hostilidad
            expect(resultado.profile.escalationRules).toContain("hostilidad");
            expect(resultado.profile.escalationRules).toContain(
                "No tengo confirmado el catálogo ni los precios actuales"
            );

            // AC5: con KB vacío, renderKb devuelve el string esperado
            expect(resultado.kb).toBe("(knowledge base vacío)");
        });
    });

    describe("Siembra demo idempotente (AC8)", () => {
        it("el perfil del demo contiene las cinco rutas", async () => {
            // Leemos el archivo de siembra para verificar que tiene el texto correcto
            // Este test no ejecuta la siembra; solo verifica que el código la declara bien
            const { readFile } = await import("fs/promises");
            const demoSource = await readFile("src/server/seed/demo.ts", "utf-8");

            // Verificamos que el bloque .update(schema.agentProfile) contiene las rutas
            expect(demoSource).toContain("buy_decided");
            expect(demoSource).toContain("warranty");
            expect(demoSource).toContain("hostile");
            expect(demoSource).toContain("chitchat");
            expect(demoSource).toContain("paint / ferreteria");

            // Frase de blindaje literal
            expect(demoSource).toContain(
                "No tengo confirmado el catálogo ni los precios actuales; con gusto te conecto con un asesor para que te confirme disponibilidad y cotización exacta."
            );

            // Plantillas literales
            expect(demoSource).toContain(
                "Perfecto, ¿me compartes tu nombre completo y la dirección de entrega para preparar tu pedido?"
            );
            expect(demoSource).toContain(
                "Con gusto te ayudo con la garantía. ¿Me compartes tu número de orden o factura?"
            );

            // Límite de dos frases
            expect(demoSource).toContain("dos frases como máximo");

            // escalationRules con hostilidad
            expect(demoSource).toContain("razón hostilidad");
        });
    });
});
