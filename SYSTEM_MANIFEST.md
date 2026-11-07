# SYSTEM_MANIFEST.md — Jombe CRM Multi-Provider (Evolution API Extension)

## 1. Zonas Sagradas (Protected / Inmutables)
Queda estrictamente prohibido refactorizar, renombrar o eliminar los siguientes componentes y flujos nativos:
- **Meta Cloud API Webhook:** `src/app/api/webhooks/whatsapp/route.ts` (mantiene su estructura, validacion de verify token y procesamiento de eventos de Meta).
- **Meta Sender Service:** `src/lib/whatsapp.ts` (las funciones existentes que llamen a Graph API se preservan intactas).
- **Esquema Base de Drizzle:** Las tablas principales (`users`, `leads`, `messages`, `organizations`) conservan su integridad referencial y tipos base.

## 2. Nueva Logica de Integracion (Evolution API)
La integracion con Evolution API se agrega como un proveedor conmutable mediante el patron Provider/Adapter:
- **Modelo de Configuracion:** Adicion del campo `whatsapp_provider` (`enum: 'meta' | 'evolution'`, default: `'meta'`) y credenciales de Evolution (`evolution_api_url`, `evolution_api_key`, `evolution_instance`).
- **Webhook Dedicado:** Creacion de `src/app/api/webhooks/evolution/route.ts` para capturar el evento `messages.upsert` de Baileys, normalizar el payload al formato interno de Jombe e invocar el pipeline de leads y agentes.
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

### Logo Jombe (v2.7.4) — imagen estática e inmutable

**Regla inviolable:** el logo de Jombe es una IMAGEN ESTÁTICA e INMUTABLE,
recortada píxel a píxel del logo oficial. Está PROHIBIDO:

- Renderizar el nombre del CRM como texto HTML en `BrandLogo` (nada de `<span>Jombe</span>`).
- Dibujar el logo con SVG a mano (nada de globos, iniciales ni formas aproximadas).
- Dejar que el color de acento (`accent`) tiña el logo o su fondo.

**Activos oficiales** (generados por `scripts/gen-jombe-assets.mjs`):

| Archivo | Uso |
|---|---|
| `public/jombe-logo-full.png` / `.webp` | Logo horizontal completo (sidebar expandido, login, header móvil) |
| `public/jombe-icon-512.png` | Icono PWA / app instalable |
| `public/jombe-icon-192.png` | `BrandTile` (sidebar colapsado) y manifest |
| `public/jombe-icon-32.png` | Favicon del navegador |
| `public/favicon.ico` | Favicon legacy (PNG embebido) |

**Puntos de enganche:**

- `src/lib/brand.ts` — constantes `JOMBE_LOGO_FULL`, `JOMBE_ICON`, `JOMBE_ICON_512`, `JOMBE_ICON_32`, `isJombeName()`. Ya NO existen `JOMBE_PURPLE`, `JOMBE_GREEN` ni `JombeMark`.
- `src/components/brand-mark.tsx` — `BrandLogo` y `BrandTile` ramifican por `isJombeName()` y pintan solo `<img>`. Sin texto HTML y sin `.brand-tile` (acento).
- `src/lib/favicon.ts` — `faviconHref()` devuelve `JOMBE_ICON_32` para Jombe, nunca el SVG generado.
- `src/server/app-icon.tsx` — el icono PWA usa `jombe-icon-512.png` como data-URI.
- `src/app/api/branding/favicon/route.ts` — sirve `jombe-icon-32.png` como respaldo público.
- `src/app/api/settings/branding/route.ts` — el PUT ignora `name` y fuerza `DEFAULT_BRANDING.name`.
- `src/app/api/settings/branding/favicon/route.ts` — PUT y DELETE responden 404 `logo_bloqueado`.
- `src/components/settings/favicon-card.tsx` — tarjeta bloqueada, solo visual.
- `src/lib/branding.ts` — `DEFAULT_BRANDING` con nombre "Jombe" y acento `#5B5CE2`.
- `public/jombe-logo.jpg` — Logo horizontal original de Jombe (fuente).

---

**Ultima actualizacion:** v2.7.4 (2026-11-02)
**Mantenido por:** Elisaul / Jombe
