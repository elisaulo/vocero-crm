# SYSTEM_MANIFEST.md — Vocero CRM Multi-Provider (Evolution API Extension)

## 1. Zonas Sagradas (Protected / Inmutables)
Queda estrictamente prohibido refactorizar, renombrar o eliminar los siguientes componentes y flujos nativos:
- **Meta Cloud API Webhook:** `src/app/api/webhooks/whatsapp/route.ts` (mantiene su estructura, validacion de verify token y procesamiento de eventos de Meta).
- **Meta Sender Service:** `src/lib/whatsapp.ts` (las funciones existentes que llamen a Graph API se preservan intactas).
- **Esquema Base de Drizzle:** Las tablas principales (`users`, `leads`, `messages`, `organizations`) conservan su integridad referencial y tipos base.

## 2. Nueva Logica de Integracion (Evolution API)
La integracion con Evolution API se agrega como un proveedor conmutable mediante el patron Provider/Adapter:
- **Modelo de Configuracion:** Adicion del campo `whatsapp_provider` (`enum: 'meta' | 'evolution'`, default: `'meta'`) y credenciales de Evolution (`evolution_api_url`, `evolution_api_key`, `evolution_instance`).
- **Webhook Dedicado:** Creacion de `src/app/api/webhooks/evolution/route.ts` para capturar el evento `messages.upsert` de Baileys, normalizar el payload al formato interno de Vocero e invocar el pipeline de leads y agentes.
- **Servicio Saliente Modular:** Creacion de `src/lib/evolution.ts` para despachar mensajes mediante `POST /message/sendText/{instance}`.
- **Despachador Unificado:** `src/lib/messaging-dispatcher.ts` bifurca la salida hacia Meta o Evolution segun la configuracion activa de la organizacion.
- **Interfaz de Ajustes:** Extension de la UI de configuracion con selector de pestanas o toggle (*Meta Cloud API* / *Evolution API (QR)*).

## 3. Zonas de Descarte
- Archivos de configuracion de pruebas locales temporales.
- Mockups o scripts manuales generados durante la prueba de endpoints.

---

## 4. PARCHES CRITICOS — NO ELIMINAR NI SOBRESCRIBIR EN MERGES (v2.7.3)

### PARCHE 1: Evolution API — Sin restriccion de ventana de 24 horas

**Regla INVIOLABLE:** Evolution API (Baileys/QR) NUNCA tiene la restriccion de ventana de 24 horas de WhatsApp Business Cloud API. Esta restriccion es EXCLUSIVA de Meta Cloud API oficial.

**Archivos afectados (NO revertir):**
- `src/lib/channels/evolution-patches.ts` — Modulo canonico: `isEvolutionUnlimitedWindow()`
- `src/server/inbox/queries.ts` — `serializeConversation()` fuerza `windowOpen=true` para Evolution
- `src/components/inbox/composer.tsx` — El Composer no bloquea cuando `evolutionWindow=true`
- `src/server/inbox/send.ts` — El guard de ventana se omite cuando `evolutionInstance` esta presente

**Como detectar el proveedor:**
```typescript
import { isEvolutionUnlimitedWindow } from "@/lib/channels/evolution-patches";
const unlimitado = isEvolutionUnlimitedWindow(whatsappProvider, evolutionInstance);
// true => sin restriccion de tiempo, compositor siempre habilitado
```

### PARCHE 2: Soporte de JIDs @lid y fallback automatico HTTP 400

**Regla INVIOLABLE:** Los JIDs con sufijo `@lid` (Linked-ID, de contactos de alta privacidad o anuncios) deben enviarse COMPLETOS a Evolution API. Enviar solo los digitos causa HTTP 400 `"exists": false`.

**Archivos afectados (NO revertir):**
- `src/lib/channels/evolution-patches.ts` — Funciones puras: `formatEvolutionRecipient()`, `buildLidFallback()`, `isLidNotFoundError()`
- `src/lib/evolution.ts` — `sendEvolutionText()` usa `formatEvolutionRecipient()` y reintenta con `@lid` si HTTP 400
- `src/app/api/webhooks/evolution/route.ts` — El webhook preserva el JID `@lid` completo como identidad del contacto

**Flujo del fallback:**
1. Cliente escribe desde anuncio → WhatsApp asigna JID `9822791549160@lid`
2. Webhook recibe `remoteJid: "9822791549160@lid"` → guarda identity como `"9822791549160@lid"`
3. Al responder: `formatEvolutionRecipient("9822791549160@lid")` → devuelve el JID completo
4. Si aun asi Evolution falla con HTTP 400 `exists:false` → reintento automatico con `@lid`

### PARCHE 3: Modulo canonico de parches

El modulo `src/lib/channels/evolution-patches.ts` es la UNICA fuente de verdad para:
- La logica de ventana ilimitada de Evolution API
- El formateo de JIDs para Evolution API
- La deteccion del error @lid

Cualquier otro archivo que necesite estas funciones DEBE importar desde ese modulo.

### Logo Jombe (v2.7.3)
- `src/lib/brand.ts` — `isJombeName()`, `JOMBE_PURPLE`, `JOMBE_GREEN`
- `src/components/brand-mark.tsx` — `JombeMark` SVG inline, BrandLogo y BrandTile actualizados
- `src/lib/branding.ts` — `DEFAULT_BRANDING` cambiado a nombre "Jombe" y acento `#5B5CE2`
- `public/jombe-logo.jpg` — Logo horizontal original de Jombe

---

**Ultima actualizacion:** v2.7.3 (2026-11-02)
**Mantenido por:** Elisaul / Jombe
