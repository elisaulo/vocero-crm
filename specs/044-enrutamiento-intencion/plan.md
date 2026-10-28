# 044 — Plan

Spec: [spec.md](spec.md).

## Constitution Check (antes de la Fase 0)

**Sin violaciones.**

- **Carril ligero** justificado: no toca el modelo de datos (las columnas `instructions`, `escalation_rules`, `tone` del [`agentProfile`](../../src/lib/db/schema.ts:710) existen desde la versión que introdujo el Laboratorio) ni cambia un contrato publicado ([`serializeBotProfile`](../../src/server/bot/profile.ts:27) ya publica ambos campos desde la 034).
- **Sin migración**: el seed del demo es el único cambio en datos.
- **Principio II (Soberanía)**: el enrutamiento es contenido del perfil, no dependencia del núcleo; la conducta de enrutar hacia un humano en hostilidad respeta que el CRM no trae agente (036).
- **Principio V (Calidad verificable)**: el Laboratorio mide exactamente el texto del perfil ([`behaviorText`](../../src/server/lab/runner.ts:120-199) arma el prompt del juez a partir de `profile.name`, `tone`, `instructions`, `escalation_rules`).

## Fase 0 — Lo que se investigó

| Pregunta | Respuesta |
|---|---|
| ¿El `agentProfile` ya tiene las columnas necesarias? | Sí: `instructions`, `escalation_rules`, `tone`, `name` en [`schema.ts:710-734`](../../src/lib/db/schema.ts:710). |
| ¿`GET /api/bot/profile` publica esos campos? | Sí: [`serializeBotProfile`](../../src/server/bot/profile.ts:27) devuelve `{ profile: { name, tone, instructions, escalationRules, ... }, kb, resources, llm }`. |
| ¿El Laboratorio mide el texto del perfil? | Sí: [`runner.ts:120-199`](../../src/server/lab/runner.ts:120) arma `behaviorText` con las cuatro columnas y lo entrega al juez; un cambio en `instructions` se refleja en la calificación. |
| ¿Las personas del Laboratorio cubren las rutas del manifiesto? | Sí: de las 8 personas ([`personas.ts`](../../src/server/lab/personas.ts)), **Carlos el Comprador** (`buy_decided`), **Teresa la Garantías** (`warranty`), **Alicia la Hostil** (`hostile`), **Sofía la Curiosa** (`chitchat`) y **Pablo el Pintor** (`paint`) ya ejercen las cinco rutas; sin código nuevo, un perfil curado con las plantillas declaradas pasa el Laboratorio. |
| ¿Existe ya la razón de handoff `hostilidad`? | Sí: [`HANDOFF_REASONS`](../../src/server/bot/handoff.ts:21) incluye `"hostilidad"` desde la introducción de handoff por razón; [`toHandoffReason`](../../src/server/bot/handoff.ts:21) la reconoce. |
| ¿La exención de ventana de Evolution está implementada? | Sí: spec 024 ([`assertReplyWindow`](../../src/server/inbox/window.ts)) con [`isEvolutionChannel`](../../src/lib/evolution.ts); Instagram y Messenger declaran 7 días de ventana humana, TikTok 48 h (spec 022); todas usan [`windowMsFor(channel)`](../../src/server/channels/capabilities.ts), nunca «24 h» cableado. [`tests/unit/reply-window.test.ts`](../../tests/unit/reply-window.test.ts) cubre el contrato. |
| ¿Hay un `SYSTEM_MANIFEST.md` en el repo que chocaría? | Sí: [`SYSTEM_MANIFEST.md`](../../SYSTEM_MANIFEST.md) en raíz describe proveedores de Evolution API (Evolution, Waha, Ultra); es un documento distinto, no se modifica. |
| ¿La frase de blindaje debe ser mutable? | No: el manifiesto la declara inmutable («palabra por palabra»); va en el seed del demo y en la guía, pero no se hace cumplir en código porque es contenido del perfil, no lógica del CRM. |
| ¿Qué devuelve `renderKb` cuando la base de conocimiento está vacía? | [`prompts.ts:15`](../../src/server/ai/prompts.ts:15): devuelve la cadena exacta `"(knowledge base vacío)"` si `entries.length === 0`. |
| ¿Cambió algo en el contrato del despacho o de `/api/bot/messages`? | No: el evento de despacho ([`contract.ts`](../../src/server/brains/contract.ts)) viaja igual; `/api/bot/messages` ([`docs/openapi.json`](../../docs/openapi.json)) recibe `text`/`template`/`typing`/`image` sin cambios; el veredicto del juez ([`judge.ts`](../../src/server/lab/judge.ts)) sigue siendo `{"score", "passed", "feedback"}`; nada del contrato publicado se toca. |

## Fase 1 — Diseño

### Datos

**Sin migración.**

El esquema del [`agentProfile`](../../src/lib/db/schema.ts:710) se usa tal como está:

- `instructions` — texto libre Markdown que declara las cinco rutas y el límite de dos oraciones.
- `escalation_rules` — texto libre Markdown con la regla de handoff por hostilidad y la frase de blindaje anti-alucinación.
- `tone` — personalidad («amable, profesional, conciso»).
- `name` — «Asistente» (default) o nombre comercial del negocio.

La conducta curada es **dato** del perfil, no lógica del CRM.

### Servidor

**Siembra del demo** — [`src/server/seed/demo.ts`](../../src/server/seed/demo.ts)

Actualizar el seed de «Ferretería El Martillo» para que `agent_profile` (hoy con `tone` e `instructions` genéricas) tenga:

```typescript
instructions: `
# Rutas de intención

1. **Compra decidida** → «Perfecto, ¿me compartes tu nombre completo y la dirección de entrega para preparar tu pedido?»
2. **Garantía** → «Con gusto te ayudo con la garantía. ¿Me compartes tu número de orden o factura?»
3. **Consulta de catálogo** → consulta la base de conocimiento; si está vacía, aplica la regla de escalación.
4. **Conversación casual** → respuesta breve y cordial en máximo dos oraciones.

# Límite de extensión

Cada respuesta: **máximo dos oraciones**.
`.trim(),

escalation_rules: `
# Blindaje anti-alucinación

Si un cliente pregunta por productos, precios o disponibilidad y la base de conocimiento está vacía, responde **palabra por palabra**:

"No tengo confirmado el catálogo ni los precios actuales; con gusto te conecto con un asesor para que te confirme disponibilidad y cotización exacta."

Luego haz handoff con razón \`cliente\`.

# Hostilidad

Si detectas insultos, amenazas o lenguaje irrespetuoso, **no respondas**; haz handoff de inmediato con razón \`hostilidad\`.
`.trim(),

tone: "Amable, profesional y directo. Siempre en máximo dos oraciones.",
```

El seed es idempotente: segunda ejecución no duplica ni falla.

**Sin cambio en la API** — [`serializeBotProfile`](../../src/server/bot/profile.ts:27) ya publica `instructions` y `escalationRules`; el cerebro (Nea u otro) los recibe y los sigue.

### UI

**Sin cambio.**

La pantalla **Agente → Perfil** ([`src/app/(app)/agent/page.tsx`](../../src/app/(app)/agent/page.tsx)) ya tiene los campos `instructions`, `escalation_rules` y `tone` editables; un dueño puede cargar las plantillas del demo o escribir las suyas.

### Documentación

**Nueva guía `docs/guia-agente.md`** con:

1. Qué son las rutas de intención y por qué van en el perfil.
2. Las cinco rutas del demo con su plantilla (palabra por palabra).
3. La frase de blindaje (palabra por palabra) y cuándo se aplica.
4. El límite de dos oraciones y cómo medirlo.
5. El handoff por hostilidad.
6. Cómo el Laboratorio mide la adherencia al perfil.
7. Enlace al [perfil publicado en `/api/bot/profile`](../../docs/openapi.json).

**Enlace desde el README** — agregar en la sección «Documentación»:

```markdown
- [Guía del agente: enrutamiento y blindaje](docs/guia-agente.md)
```

## Pruebas

### Unitarias

1. **Siembra idempotente** — correr `seed:demo` dos veces contra la misma BD; la segunda no falla ni duplica.
2. **`serializeBotProfile` publica las rutas** — dado un perfil con `instructions` y `escalation_rules`, el JSON de salida los incluye sin transformarlos.
3. **`renderKb` con base vacía** — `renderKb([]) === "(knowledge base vacío)"`.
4. **`toHandoffReason("hostilidad")` devuelve `"hostilidad"`** — y cualquier otro valor del enum pasa igual.
5. **`behaviorText` arma el prompt del juez con las cuatro columnas** — mock de perfil con `name`, `tone`, `instructions`, `escalation_rules` → el `behaviorText` las menciona todas.

### E2E

**Laboratorio** ([`tests/e2e/us4-lab.md`](../../tests/e2e/us4-lab.md), arnés [`scripts/e2e-lab.mjs`](../../scripts/e2e-lab.mjs)):

1. Sembrar el demo con las plantillas de 044.
2. Encender el agente, configurar despacho hacia un cerebro mock que respeta el perfil.
3. Correr el Laboratorio con las 8 personas (incluyendo Carlos, Teresa, Alicia, Sofía, Pablo).
4. Esperar a que termine.
5. Verificar `score >= 95` (tolerancia para varianza del LLM).
6. Verificar que Carlos recibió la plantilla de compra decidida, Teresa la de garantía, Alicia provocó handoff con razón `hostilidad`, Sofía recibió respuesta de máximo dos oraciones y Pablo, ante base vacía, recibió la frase de blindaje palabra por palabra seguida de handoff con razón `cliente`.

Registrar la captura del veredicto 95+ como evidencia de **AC9**.

## Constitution Check (después del diseño)

**Sin cambios**: sigue siendo carril ligero sin violaciones; el diseño no introdujo migración ni cambio de contrato.
