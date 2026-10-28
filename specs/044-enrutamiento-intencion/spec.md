# 044 — Enrutamiento de intención y blindaje anti-alucinación

**Feature Branch**: `044-enrutamiento-intencion`
**Created**: 2026-10-28
**Status**: Especificada antes de escribir código.
**Input**: Manifiesto «Motor de enrutamiento, asistencia comercial y gestión de canales (Vocero CRM)»: clasificar la intención antes de responder, cero alucinación, comportamiento editable desde la UI, respuesta exacta ante conocimiento vacío, cinco rutas de intención y límite de dos frases por respuesta.
**Carril**: Ligero. No toca el modelo de datos ni ningún contrato publicado. Se apoya en columnas que ya existen en `agent_profile` (`instructions`, `escalation_rules`, `tone`) y en campos que `GET /api/bot/profile` ya publica desde 034. Justificación del Principio VI en [plan.md](plan.md); tareas en [tasks.md](tasks.md).

---

## Contexto

Desde 036 el CRM no trae agente: no hay prompt dentro del proceso. Contesta un cerebro conectado al lado (Nea u otro) por el despacho y `/api/bot/*`. El CRM aporta **datos**: el perfil del agente y su conocimiento, que el cerebro lee por `GET /api/bot/profile`.

Eso decide cómo aterriza este manifiesto. El enrutamiento de intención **no** puede ser código dentro del CRM, porque no hay turno que enrutar. Su lugar es el perfil: `instructions` y `escalationRules` son la voz autorizada del negocio, viajan al cerebro y son exactamente lo que el Laboratorio mide (`behaviorText` en [`runner.ts`](../../src/server/lab/runner.ts)). Lo que el manifiesto pide como motor, aquí se entrega como **datos curados, medibles y editables desde la UI**.

---

## Historias

**H1 — Clasificar antes de responder.** Como dueño del negocio, quiero que el agente identifique la intención del cliente antes de escribir, para que no mezcle una venta con una garantía ni responda de más. El perfil declara las cinco rutas y su plantilla; el cerebro (o el modelo que lo encarne) las sigue.

**H2 — Cero alucinación sin catálogo.** Como dueño sin catálogo cargado, quiero que el agente nunca invente un precio ni una existencia. Sin conocimiento en la base, la respuesta es una frase fija que reconoce el vacío y ofrece un asesor.

**H3 — Rutas de negocio con texto exacto.** Como dueño de una ferretería o pinturería, quiero respuestas predecibles para «ya decidí comprar», «garantía» y «cliente hostil», sin que nadie las improvise.

**H4 — Comportamiento desde la UI.** Como dueño, quiero ajustar tono, instrucciones y reglas de escalado en Agente → Perfil, sin tocar código ni pedir un despliegue. Lo que guardo es lo que el agente hace.

**H5 — Medible en el Laboratorio.** Como dueño, quiero correr las personas guionadas en el Laboratorio y ver si el agente cumple las rutas, para saber que está listo antes de hablar con clientes reales. La meta del manifiesto es 100/100.

---

## Decisiones

### D1 — Las rutas son datos del perfil, no código del CRM

Post-036 el CRM no piensa. Cualquier «motor» que se escribiera aquí sería código muerto: nadie lo invocaría. Las rutas viven en `agent_profile.instructions` (la política) y `agent_profile.escalation_rules` (cuándo devolver a un humano), y se publican por `serializeBotProfile` en [`profile.ts`](../../src/server/bot/profile.ts:27). El cerebro las obedece; el CRM las guarda, las sirve y las mide.

### D2 — Las cinco rutas y su plantilla

| Ruta | Cuándo | Qué responde |
|---|---|---|
| `buy_decided` | El cliente ya decidió comprar | «Perfecto, ¿me compartes tu nombre completo y la dirección de entrega para preparar tu pedido?» |
| `warranty` | Pide garantía o un cambio | «Con gusto te ayudo con la garantía. ¿Me compartes tu número de orden o factura?» |
| `hostile` | Insulto, amenaza o reclamo airado | No responde texto: traspaso a humano con razón `hostilidad` |
| `chitchat` | Conversación sin intención comercial | Saludo breve y devolución de la iniciativa, sin prometer nada |
| `paint` / `ferreteria` | Consulta de producto o de rubro | Responde solo con lo que esté en el conocimiento; si no está, dispara D3 |

Las plantillas de `buy_decided` y `warranty` son literales: entran al perfil palabra por palabra, sin adornos, para que la prueba pueda exigirlas tal cual.

### D3 — Blindaje ante conocimiento vacío

Cuando la base de conocimiento está vacía, `renderKb` devuelve `"(knowledge base vacío)"` ([`prompts.ts`](../../src/server/ai/prompts.ts:15)). El perfil declara, además, la frase de blindaje exacta e inmutable:

> «No tengo confirmado el catálogo ni los precios actuales; con gusto te conecto con un asesor para que te confirme disponibilidad y cotización exacta.»

Esa frase se acompaña de un traspaso con razón `cliente`. El agente no adivina precios, existencias ni plazos: reconoce el vacío y deriva.

### D4 — Dos frases como máximo

El límite vive en `instructions` como regla explícita («responde en dos frases como máximo; si necesitas más, ofrece un asesor»). Es medible porque `behaviorText` de [`runner.ts`](../../src/server/lab/runner.ts) entrega ese texto al juez del Laboratorio, que puede contar frases en la respuesta del agente.

### D5 — La exención de ventana de Evolution ya existe

El manifiesto pide que los canales vía Evolution API / QR queden exentos de la ventana de 24 h. Ya está implementado: `isEvolutionChannel` en [`evolution.ts`](../../src/lib/evolution.ts) y `assertReplyWindow` en [`window.ts`](../../src/server/inbox/window.ts) (spec 024). Esta feature solo lo documenta; no lo reimplementa. Instagram y Messenger conservan su ventana humana de 7 días (024) y TikTok su ventana de 48 h (022). Ninguna cifra se escribe a mano: sale de `windowMsFor(channel)`.

### D6 — `hostilidad` ya es una razón de traspaso

`HANDOFF_REASONS` en [`handoff.ts`](../../src/server/bot/handoff.ts:21) ya incluye `hostilidad`. La ruta `hostile` no inventa un mecanismo: usa el que existe. Sin migración, sin campo nuevo.

### D7 — El negocio demo siembra las rutas

`src/server/seed/demo.ts` siembra el perfil de la Ferretería El Martillo de forma idempotente. Ahí entran las cinco rutas, la frase de blindaje y el límite de dos frases, para que una instalación nueva tenga el comportamiento desde el primer arranque y el Laboratorio tenga contra qué medir.

### D8 — No se toca `SYSTEM_MANIFEST.md`

El `SYSTEM_MANIFEST.md` de la raíz habla de proveedores de Evolution API; es otro documento y no se modifica. Se deja anotado para que nadie los confunda dentro de un año.

### D9 — Sin cambio de contrato publicado

`/api/bot/profile` ya publica `instructions` y `escalationRules` (034). No cambian las formas de `/api/bot/messages`, del evento de despacho, de `docs/openapi.json` ni del veredicto del juez. Agregar texto al perfil no es cambiar el contrato.

### D10 — Guía operativa nueva

`docs/guia-agente.md` explica, para quien opera el CRM, cómo escribir cada ruta, cuál es la frase de blindaje y cómo correr el Laboratorio para verificar. Se enlaza desde el README.

---

## Fuera de alcance

- Escribir un clasificador de intención dentro del CRM: no hay turno donde ejecutarlo (036).
- Clasificación por ML o embeddings: las rutas son texto curado, no un modelo.
- Cambiar la ventana de los canales oficiales de Meta.
- Tocar `SYSTEM_MANIFEST.md`.
- Nuevas personas del Laboratorio: las ocho existentes ya disparan estas rutas.
- Migración de base de datos: no hace falta ninguna.

---

## Criterios de aceptación

**AC1** — `GET /api/bot/profile` devuelve `profile.instructions` con las cinco rutas y `profile.escalationRules` con la regla de traspaso de `hostile`.

**AC2** — El perfil contiene, palabra por palabra, la frase de blindaje de D3.

**AC3** — El perfil contiene, palabra por palabra, las plantillas de `buy_decided` y `warranty`.

**AC4** — El perfil declara el límite de dos frases.

**AC5** — Con la base de conocimiento vacía, `renderKb` devuelve `"(knowledge base vacío)"` y el perfil indica derivar a un asesor con razón `cliente`.

**AC6** — `toHandoffReason("hostilidad")` devuelve `"hostilidad"`; la ruta `hostile` no produce texto saliente.

**AC7** — `tests/unit/reply-window.test.ts` sigue verde sin tocarlo: la exención de Evolution y las ventanas por canal no cambian.

**AC8** — El negocio demo se siembra dos veces sin duplicar ni fallar.

**AC9** — Una corrida del Laboratorio con las personas existentes puntúa las rutas; el resultado queda registrado como evidencia de la meta 100/100.

---

## Constitution Check

| Principio | Cómo se cumple |
|---|---|
| I — Seguridad | Sin secretos nuevos. El perfil es texto del negocio que ya viaja por `/api/bot/profile` autenticado por `BOT_API_KEY`. |
| II — Soberanía | Sin dependencias nuevas. Solo Postgres y el perfil que ya existe. |
| III — Multi-tenancy | Todo texto vive en `agent_profile`, con `organization_id` y acceso por `scoped()`. Nada global. |
| IV — Idempotencia | La siembra del demo es re-ejecutable (AC8). No hay migración que aplicar. |
| V — Calidad verificable | AC1-AC9 son comprobables: unitarias sobre `serializeBotProfile`, `renderKb` y `toHandoffReason`, y E2E en el Laboratorio. |
| VI — Spec antes de código | Este spec se escribe antes de tocar nada y declara carril ligero. |
| VII — Trazabilidad | Cada decisión D1-D10 apunta a su archivo y su línea. |
| VIII — Foco vertical | Es una sola cosa: cómo responde el agente. No abre frentes laterales. |
| IX — Hecho = probado en vivo | La tarea final exige la corrida real del Laboratorio; sin ella la feature queda pendiente, no «hecha». |
