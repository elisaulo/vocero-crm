# Guía del agente — Cómo responde Vocero CRM

Esta guía explica cómo configurar el comportamiento del agente para que clasifique la intención del cliente antes de responder, limite la longitud de sus respuestas y derive a un humano cuando toca.

---

## 1. El perfil del agente

El agente no trae un prompt fijo: lee su comportamiento desde **Agente → Perfil** en la UI. Lo que guardas ahí es lo que hace.

| Campo | Para qué |
|---|---|
| **Nombre** | Cómo se presenta ante el cliente. |
| **Tono** | El registro: formal, cercano, técnico… |
| **Instrucciones** | La política de respuesta: qué rutas reconoce, qué plantilla usa, cuántas frases escribe. |
| **Reglas de escalado** | Cuándo devuelve la conversación a un humano y con qué razón. |
| **Saludo** | El primer mensaje que envía cuando el cliente escribe por primera vez. |

Desde la versión 2.0 (spec 036), el CRM no piensa: contesta un cerebro conectado al lado (Nea u otro) que lee este perfil por `/api/bot/profile`. El Laboratorio también lo lee: mide si el agente cumple lo que declaraste.

---

## 2. Las cinco rutas de intención

El agente debe **clasificar antes de responder**. Las instrucciones declaran cinco rutas:

### 2.1 `buy_decided` — El cliente ya decidió comprar

**Cuándo**: «Quiero el taladro de 500 W», «Ya me decidí», «Me lo llevo».

**Qué responde** (literal):
> «Perfecto, ¿me compartes tu nombre completo y la dirección de entrega para preparar tu pedido?»

### 2.2 `warranty` — Pide garantía o un cambio

**Cuándo**: «El martillo se rompió», «¿Tiene garantía?», «Quiero devolver esto».

**Qué responde** (literal):
> «Con gusto te ayudo con la garantía. ¿Me compartes tu número de orden o factura?»

### 2.3 `hostile` — Insulto, amenaza o reclamo airado

**Cuándo**: Insultos, amenazas, reclamos con lenguaje violento.

**Qué hace**: **No responde texto**. Traspasa de inmediato a un humano con razón `hostilidad`.

### 2.4 `chitchat` — Conversación sin intención comercial

**Cuándo**: «¿Cómo estás?», «¿Qué tal el clima?», chistes, saludos sin consulta.

**Qué responde**: Saludo breve y devuelve la iniciativa, sin prometer nada. Ejemplo: «¡Hola! ¿En qué te puedo ayudar hoy?»

### 2.5 `paint` / `ferreteria` — Consulta de producto o rubro

**Cuándo**: «¿Tienen pintura blanca?», «¿Cuánto cuesta un taladro?», «¿Qué marcas de brocas manejan?»

**Qué responde**: Solo con lo que esté en la **base de conocimiento**. Si la pregunta no está cubierta, dispara el blindaje de la sección 3.

---

## 3. Blindaje ante conocimiento vacío

Si la base de conocimiento está vacía o no cubre la pregunta, el agente **nunca** inventa precios, existencias ni plazos. Dice exactamente:

> «No tengo confirmado el catálogo ni los precios actuales; con gusto te conecto con un asesor para que te confirme disponibilidad y cotización exacta.»

Y traspasa la conversación a un humano con razón `cliente`.

Esta frase es **inmutable**: no la parafrasees, no la adornes. El Laboratorio la busca tal cual.

---

## 4. Límite de dos frases

El agente responde **en dos frases como máximo**. Si necesita más espacio, ofrece un asesor en lugar de escribir un párrafo.

Esto evita respuestas largas que el cliente no lee y acelera el ritmo de la conversación.

---

## 5. Reglas de escalado

El agente devuelve la conversación a un humano en tres casos:

1. **Cliente hostil** (insulto, amenaza, reclamo airado): traspaso inmediato con razón `hostilidad`.
2. **Conocimiento vacío o pregunta no cubierta**: frase de blindaje + traspaso con razón `cliente`.
3. **El cliente lo pide explícitamente**: «Quiero hablar con una persona», «Pásame con un asesor» → traspaso con razón `cliente`.

Las razones de traspaso son: `cliente`, `modelo`, `error`, `ventana`, `hostilidad`. El cerebro elige cuál usar; las reglas de escalado le dicen cuándo.

---

## 6. Cómo editar el perfil

1. Ve a **Agente → Perfil** en la UI.
2. Escribe las cinco rutas en **Instrucciones**, palabra por palabra como están en esta guía.
3. Escribe las tres reglas en **Reglas de escalado**.
4. Ajusta **Tono** al registro de tu negocio (formal, cercano, técnico…).
5. Guarda.

El cambio aplica de inmediato: el siguiente mensaje del agente ya sigue la nueva política.

---

## 7. Cómo verificar en el Laboratorio

El **Laboratorio** (Agente → Laboratorio) corre ocho personas guionadas que le escriben al agente. Un juez LLM evalúa cada conversación y asigna un veredicto:

- **Verde**: el agente cumplió la ruta.
- **Amarillo**: cumplió pero con un problema de tono o estilo.
- **Rojo**: no cumplió, alucinó o debió escalar y no lo hizo.

El puntaje final es el porcentaje de veredictos verdes y amarillos. La meta de esta spec es **95 o más** (el manifiesto pedía 100, pero un juez LLM no da un dígito estable).

### Pasos

1. Conecta un cerebro (Nea u otro) con `BRAIN_DISPATCH_URL` y `BOT_API_KEY`.
2. Configura un proveedor de IA en **Ajustes → IA** (necesario para el juez; el cerebro puede usar su propia llave).
3. Enciende el interruptor del agente en **Agente → Perfil**.
4. Ve a **Agente → Laboratorio** y haz clic en **Iniciar corrida**.
5. Espera 2-3 minutos. Cada persona escribe su guion, el agente responde, el juez califica.
6. Revisa el resultado: puntaje, veredictos por persona, hallazgos.

Si el puntaje es bajo:
- Lee los **hallazgos** (qué falló en cada conversación).
- Ajusta las instrucciones o las reglas de escalado.
- Corre de nuevo.

El Laboratorio no toca clientes reales: las conversaciones son `is_test` y no persisten en la bandeja ni el pipeline.

---

## Referencias

- Spec 044: [`specs/044-enrutamiento-intencion/spec.md`](../specs/044-enrutamiento-intencion/spec.md)
- Código del perfil: [`src/server/bot/profile.ts`](../src/server/bot/profile.ts)
- Laboratorio: [`src/server/lab/runner.ts`](../src/server/lab/runner.ts)
- Personas: [`src/server/lab/personas.ts`](../src/server/lab/personas.ts)
- Razones de traspaso: [`src/server/bot/handoff.ts`](../src/server/bot/handoff.ts)
