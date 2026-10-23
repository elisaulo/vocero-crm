/**
 * pnpm db:clean — Vaciado atómico de datos (Clean Slate)
 *
 * Deja la base de datos con cero registros sin tocar la estructura:
 * tablas, tipos enum, extensiones y migraciones aplicadas por Drizzle
 * se conservan intactos.
 *
 * Cuándo usarlo:
 *   - Antes del primer despliegue en producción si hubo pruebas en el mismo
 *     entorno y hay que arrancar limpio.
 *   - Resetear un entorno de staging a estado virgen.
 *   - NUNCA en producción con usuarios reales sin una copia de seguridad previa.
 *
 * Qué garantiza:
 *   1. Atomicidad: todo el TRUNCATE ocurre en una sola transacción.
 *   2. Orden correcto de claves foráneas: las tablas de detalles se vacían
 *      antes que las de cabecera; CASCADE resuelve el resto.
 *   3. Secuencias: RESTART IDENTITY reinicia los contadores.
 *   4. Tablas del sistema excluidas: __drizzle_migrations no se toca.
 *   5. La tabla "user" se trunca al final (la más referenciada).
 *
 * Uso:
 *   pnpm db:clean                  # pide confirmación interactiva
 *   pnpm db:clean --force          # salta la confirmación (CI / Docker entrypoint)
 *   pnpm db:clean --dry-run        # muestra el SQL sin ejecutarlo
 */

import path from "node:path";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import postgres from "postgres";
import { PG_CONNECTION_OPTIONS } from "@/lib/db";

// ─── Carga .env si existe (igual que doctor.ts) ───────────────────────────────
const envPath = path.join(process.cwd(), ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

// ─── Argumentos ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const DRY_RUN = args.includes("--dry-run");

// ─── Tablas en orden de truncado (hijas antes que padres) ────────────────────
//
// Regla: si B referencia a A, B aparece antes que A.
// CASCADE resuelve dependencias no previstas en migraciones futuras.
//
const TABLAS_EN_ORDEN: string[] = [
  // 021 Despacho — referencia organization + conversation
  "dispatch",

  // 016 Conversions API / atribución
  "conversion_event",
  "capi_settings",
  "ad_attribution",

  // Laboratorio
  "agent_test_case",
  "agent_test_run",

  // 015 Agenda
  "offered_slot",
  "booking",
  "calendar_settings",
  "zoom_credentials",
  "google_credentials",

  // Mensajería
  "message",
  "media_asset",
  "conversation",

  // Conocimiento / plantillas / perfil IA
  "kb_entry",
  "template",
  "agent_profile",
  "ai_credentials",

  // Historial de etapas (append-only; referencia lead)
  "lead_stage_event",

  // Pipeline
  "lead",
  "pipeline_stage",

  // Contactos
  "contact",

  // Credenciales de canal
  "meta_credentials",
  "instagram_credentials",
  "messenger_credentials",

  // Organización y membresía
  "invitation",
  "member",
  "organization",

  // Better Auth — más referenciadas, al final
  "verification",
  "account",
  "session",
  "user",
];

// ─── SQL de truncado ──────────────────────────────────────────────────────────
function buildSql(): string {
  const lista = TABLAS_EN_ORDEN.map((t) => `"${t}"`).join(",\n  ");
  return `TRUNCATE TABLE\n  ${lista}\nRESTART IDENTITY CASCADE;`;
}

// ─── Confirmación interactiva ─────────────────────────────────────────────────
async function confirmar(): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      '\n⚠️  ATENCIÓN: Se eliminarán TODOS los datos. Esquema y migraciones intactos.\n' +
        '   Solo úsalo antes del primer arranque en producción o en staging.\n\n' +
        '   Escribe "limpiar" para confirmar: ',
      (respuesta) => {
        rl.close();
        resolve(respuesta.trim().toLowerCase() === "limpiar");
      }
    );
  });
}

// ─── Oculta credenciales en DATABASE_URL para log seguro ─────────────────────
function maskUrl(url: string): string {
  return url.replace(/:\/\/[^@]+@/, "://<credenciales>@");
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("✗ DATABASE_URL no está definida. Corre `pnpm init-env` primero.");
    process.exit(1);
  }

  const sql = buildSql();

  if (DRY_RUN) {
    console.log("\n[dry-run] SQL que se ejecutaría:\n");
    console.log(sql);
    console.log(
      `\n[dry-run] ${TABLAS_EN_ORDEN.length} tablas afectadas. Sin --dry-run se ejecuta de verdad.`
    );
    process.exit(0);
  }

  console.log("\nVocero CRM — db:clean (Clean Slate)");
  console.log(`Base de datos: ${maskUrl(databaseUrl)}`);

  if (!FORCE) {
    const ok = await confirmar();
    if (!ok) {
      console.log("\nOperación cancelada.");
      process.exit(0);
    }
  } else {
    console.log("  --force activo: confirmación omitida.");
  }

  console.log("\n  Conectando…");
  const client = postgres(databaseUrl, {
    max: 1,
    ...PG_CONNECTION_OPTIONS,
  });

  try {
    console.log(`  Vaciando ${TABLAS_EN_ORDEN.length} tablas en una transacción atómica…`);

    // Una sola transacción: o todo o nada.
    await client.begin(async (tx) => {
      await tx.unsafe(sql);
    });

    console.log("\n✓ Base de datos vaciada exitosamente.");
    console.log(
      "  Al arrancar el servidor detectará 0 organizaciones y mostrará el onboarding inicial."
    );
    console.log("  Siguiente paso: pnpm dev  (o docker compose up -d en producción)\n");
  } catch (err) {
    console.error("\n✗ Error al vaciar la base de datos:");
    console.error(err);
    process.exit(1);
  } finally {
    await client.end({ timeout: 3 }).catch(() => {});
  }
}

await main();
