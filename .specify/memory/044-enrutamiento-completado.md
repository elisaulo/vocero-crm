# Spec 044 — Enrutamiento de intención y blindaje anti-alucinación

**Fecha**: 2026-10-28  
**Estado**: T2–T5 completadas, T6 verificada, T7–T8 pendientes

## Resumen

Spec 044 implementa el enrutamiento de intención como **datos en el perfil del agente**, no como código. Post-036, el CRM no trae agente incorporado: el cerebro externo (Nea u otro) recibe el perfil por `GET /api/bot/profile` y lo interpreta.

Las cinco rutas (`buy_decided`, `warranty`, `hostile`, `chitchat`, `paint`/`ferreteria`) con sus plantillas literales, la frase de blindaje anti-alucinación (inmutable: «No tengo confirmado el catálogo ni los precios actuales; con gusto te conecto con un asesor para que te confirme disponibilidad y cotización exacta.») y el límite de dos frases viajan en `agent_profile.instructions` y `agent_profile.escalation_rules`.

## Archivos modificados

1. **`src/server/seed/demo.ts`** (líneas 255–267)  
   - Perfil de «Ferretería El Martillo» con las cinco rutas en `instructions` y dos reglas de escalado en `escalation_rules`:
     - Cliente hostil → traspaso inmediato con razón `hostilidad`
     - Conocimiento vacío → frase de blindaje + traspaso con razón `cliente`

2. **`docs/guia-agente.md`** (nuevo, 290 líneas)  
   - Siete secciones: perfil del agente (tabla de cinco campos), las cinco rutas de intención (2.1–2.5), blindaje ante conocimiento vacío, límite de dos frases, reglas de escalado, cómo editar el perfil (desde Agente → Ajustes → IA) y cómo verificar en el Laboratorio (target ≥ 95).

3. **`README.md`** (línea 119)  
   - Enlace a la guía añadido tras la sección «Tu agente, con TU conocimiento».

4. **`tests/unit/enrutamiento-044.test.ts`** (nuevo, 219 líneas, 10 tests)  
   - `toHandoffReason`: 4 casos (hostilidad normalizada, mayúsculas, espacios, desconocida → modelo)
   - `renderKb([])`: devuelve exactamente `"(knowledge base vacío)"`
   - `behaviorText del Laboratorio`: 3 casos (formato completo, profile null, campos opcionales null)
   - `serializeBotProfile con las cinco rutas`: AC1–AC5 verificadas
   - `Siembra demo idempotente (AC8)`: lee `demo.ts` y verifica las rutas

## Verificación

- ✅ `pnpm typecheck` — sin errores
- ✅ `pnpm lint` — sin errores
- ✅ `pnpm test tests/unit/enrutamiento-044.test.ts` — 10 passed
- ⏳ `pnpm build` — en progreso (typecheck y lint ya pasaron, no bloqueante)
- ❌ `pnpm test` completo — 4 fallos en `responder-citando.test.ts`, archivo no modificado; fallos preexistentes, no relacionados con spec 044

## Criterios de aceptación

| # | Estado | Cobertura |
|---|--------|-----------|
| AC1 | ✅ | Test `serializeBotProfile con las cinco rutas` línea 148: `.instructions` contiene `buy_decided`, `warranty`, `hostile`, `chitchat`, `paint / ferreteria` |
| AC2 | ✅ | Test línea 155: frase de blindaje palabra por palabra en `.instructions` |
| AC3 | ✅ | Test líneas 160–168: plantillas literales de `buy_decided` y `warranty` en `.instructions` |
| AC4 | ✅ | Test línea 171: límite «dos frases como máximo» en `.instructions` |
| AC5 | ✅ | Test línea 180: `renderKb([])` devuelve `"(knowledge base vacío)"` |
| AC6 | ✅ | Test línea 9: `toHandoffReason("hostilidad")` devuelve `"hostilidad"` |
| AC7 | ✅ | `docs/guia-agente.md` redactada y enlazada desde README |
| AC8 | ✅ | Test `Siembra demo idempotente` línea 189: lee `demo.ts` y verifica las cinco rutas |
| AC9 | ⏳ | Diferida a T8 (corrida del Laboratorio en vivo con score ≥ 95) |

## Anatomía del perfil sembrado

```typescript
// src/server/seed/demo.ts líneas 255–267
.update(schema.agentProfile).set({
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
  updatedAt: new Date(),
})
```

## Contexto arquitectónico

**036 — El CRM no contesta solo.** No hay turno dentro del proceso. `serializeBotProfile()` (línea 27 de `src/server/bot/profile.ts`) publica el perfil tal cual; el cerebro lo recibe por `/api/bot/profile` y lo interpreta.

**Carril ligero.** Sin migración (el perfil ya existía), sin cambio de contrato publicado (solo cambió el _contenido_ de `instructions` y `escalation_rules`, no su forma). El perfil es datos, no código.

**El Laboratorio lo valida.** `runner.ts` líneas 136–145 construye `behaviorText` con el template probado:
```typescript
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
```
El juez LLM recibe `behaviorText` en su prompt y califica cada conversación. AC9 exige score ≥ 95 en una corrida en vivo con las ocho personas de `DEMO_PERSONAS`.

## Pendiente

- **T7** — `pnpm build` completo (typecheck + lint ya pasaron)
- **T8** — Corrida del Laboratorio en vivo (`POST /api/lab/runs`, esperar `status: "done"`, verificar `score >= 95`)

## Notas

- `git status --short` confirma que solo se modificaron `README.md`, `specs/README.md`, `src/server/seed/demo.ts` y tres archivos nuevos (`docs/guia-agente.md`, `specs/044-enrutamiento-intencion/{spec.md,plan.md,tasks.md}`, `tests/unit/enrutamiento-044.test.ts`).
- Los 4 fallos de `responder-citando.test.ts` se reproducen en aislamiento y no están causados por spec 044 (archivo no tocado, código de la falla en `src/server/inbox/send.ts:449` también intacto).
- La frase de blindaje es **inmutable**: el cerebro debe decirla palabra por palabra cuando el KB no cubra la pregunta. Viaja en `instructions` (dentro de la ruta 5) y en `escalation_rules`.
- El límite de dos frases viaja en el primer párrafo de `instructions` y gobierna todas las rutas excepto `hostile` (que no responde texto).
