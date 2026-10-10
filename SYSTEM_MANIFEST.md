# SYSTEM_MANIFEST.md — Vocero CRM Multi-Provider (Evolution API Extension)

## 1. Zonas Sagradas (Protected / Inmutables)
Queda estrictamente prohibido refactorizar, renombrar o eliminar los siguientes componentes y flujos nativos:
- **Meta Cloud API Webhook:** `src/app/api/webhooks/whatsapp/route.ts` (mantiene su estructura, validación de verify token y procesamiento de eventos de Meta).
- **Meta Sender Service:** `src/lib/whatsapp.ts` (las funciones existentes que llamen a Graph API se preservan intactas).
- **Esquema Base de Drizzle:** Las tablas principales (`users`, `leads`, `messages`, `organizations`) conservan su integridad referencial y tipos base.

## 2. Nueva Lógica de Integración (Evolution API)
La integración con Evolution API se agrega como un proveedor conmutable mediante el patrón Provider/Adapter:
- **Modelo de Configuración:** Adición del campo `whatsapp_provider` (`enum: 'meta' | 'evolution'`, default: `'meta'`) y credenciales de Evolution (`evolution_api_url`, `evolution_api_key`, `evolution_instance`).
- **Webhook Dedicado:** Creación de `src/app/api/webhooks/evolution/route.ts` para capturar el evento `messages.upsert` de Baileys, normalizar el payload al formato interno de Vocero e invocar el pipeline de leads y agentes.
- **Servicio Saliente Modular:** Creación de `src/lib/evolution.ts` para despachar mensajes mediante `POST /message/sendText/{instance}`.
- **Despachador Unificado:** `src/lib/messaging-dispatcher.ts` bifurca la salida hacia Meta o Evolution según la configuración activa de la organización.
- **Interfaz de Ajustes:** Extensión de la UI de configuración con selector de pestañas o toggle (*Meta Cloud API* / *Evolution API (QR)*).

## 3. Zonas de Descarte
- Archivos de configuración de pruebas locales temporales.
- Mockups o scripts manuales generados durante la prueba de endpoints.