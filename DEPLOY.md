# Guía de Despliegue en VPS — Vocero CRM con Proveedor Dual (Meta + Evolution API)

Esta guía detalla los pasos para desplegar Vocero CRM en un servidor VPS propio utilizando Docker Compose, Caddy para SSL automático, PostgreSQL y Evolution API v2 para sesiones de WhatsApp por código QR.

---

## Requisitos Previos

- Servidor VPS con Linux (Ubuntu 22.04 LTS recomendado) y dirección IP pública.
- Dominio propio con registros DNS A apuntando a la IP pública del VPS (ej. `crm.tudominio.com`).
- Docker Engine y Docker Compose v2 instalados (`docker compose version`).

---

## Paso 1: Clonar el Repositorio e Inicializar Variables

1. Clona el repositorio en tu servidor VPS:
   ```bash
   git clone https://github.com/kevinrivm/vocero-crm.git
   cd vocero-crm
   ```

2. Copia la plantilla de producción a `.env`:
   ```bash
   cp .env.production.example .env
   ```

3. Genera las claves de seguridad requeridas en la consola:
   ```bash
   # Para POSTGRES_PASSWORD:
   openssl rand -hex 24

   # Para BETTER_AUTH_SECRET:
   openssl rand -base64 32

   # Para ENCRYPTION_KEY (debe ser de 32 bytes en base64):
   openssl rand -base64 32

   # Para META_WEBHOOK_VERIFY_TOKEN:
   openssl rand -hex 32

   # Para EVOLUTION_API_KEY:
   openssl rand -hex 24
   ```

4. Edita el archivo `.env` y reemplaza cada variable con los valores generados y el dominio de tu servidor (`DOMAIN=crm.tudominio.com`).

---

## Paso 2: Despliegue del Entorno con Docker Compose

1. Construye e inicia todos los servicios de producción en segundo plano:
   ```bash
   docker compose up -d --build
   ```

2. Verifica que los servicios estén ejecutándose y saludables:
   ```bash
   docker compose ps
   ```

   Deberías ver los siguientes contenedores activos:
   - `vocero-crm-app-1` (Next.js 15 App)
   - `vocero-crm-postgres-1` (PostgreSQL 16)
   - `vocero-crm-caddy-1` (Servidor web HTTPS)
   - `vocero-crm-evolution-api-1` (Evolution API v2)

---

## Paso 3: Aplicación de Migraciones de Base de Datos

Las migraciones SQL de Drizzle se aplican automáticamente al arrancar el contenedor de la aplicación. Para ejecutarlas manualmente dentro del contenedor si es necesario:

```bash
docker compose exec app node scripts/migrate.mjs
```

---

## Paso 4: Conectar WhatsApp (Evolution API / Meta Cloud API)

### Opción A: Configuración desde el Panel de Vocero CRM (Recomendado)

1. Abre tu navegador en `https://crm.tudominio.com` y regístrate como el primer usuario administrador.
2. Navega a **Ajustes → WhatsApp**.
3. Selecciona la pestaña **Evolution API (QR)**:
   - **URL de Evolution API**: `http://evolution-api:8080`
   - **API Key**: La clave definida en `EVOLUTION_API_KEY`.
   - **Nombre de Instancia**: `vocero_prod` (o el nombre deseado).
4. Haz clic en **Guardar y Activar Evolution API**.
5. Configura en Evolution API el webhook apuntando a: `https://crm.tudominio.com/api/webhooks/evolution?instance=vocero_prod`.

### Opción B: Uso de Meta Cloud API Oficial

1. En **Ajustes → WhatsApp**, selecciona la pestaña **Meta Cloud API (Oficial)**.
2. Ingresa tu WABA ID, Phone Number ID y Token Permanente de Graph API.
3. Haz clic en **Guardar Conexión**.

---

## Mantenimiento y Logs

- Ver logs en tiempo real de todos los servicios:
  ```bash
  docker compose logs -f
  ```
- Logs específicos del CRM o de Evolution API:
  ```bash
  docker compose logs -f app
  docker compose logs -f evolution-api
  ```
- Actualizar a una nueva versión del CRM:
  ```bash
  git pull
  docker compose up -d --build
  ```
