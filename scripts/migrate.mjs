/**
 * Migraciones al ARRANQUE del contenedor (no en pre-deploy: el pre-deploy de
 * plataformas como Coolify corre en el contenedor viejo). Se bundlea con
 * esbuild dentro de la imagen y corre antes de `node server.js`.
 *
 * El merge con upstream dejó prefijos numéricos duplicados en drizzle/ (dos
 * 0023, dos 0024, dos 0025) y el journal solo registra una de cada pareja: las
 * migraciones de webhook_event, quick_reply, conversation_note y la columna
 * messaging_account_id quedaron fuera del journal. ensureSchemaSync las aplica
 * SIEMPRE después de migrate(), de forma idempotente (IF NOT EXISTS), para que
 * una instalación vieja actualice sin pasos manuales.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("[migrate] DATABASE_URL no está definida");
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsFolder =
  process.env.MIGRATIONS_DIR ?? path.join(here, "drizzle");

/**
 * Estructuras de las migraciones que el journal no registra (prefijos
 * duplicados por el merge). Todo con IF NOT EXISTS o capturando
 * duplicate_object: correrlo dos veces no cambia nada.
 */
async function ensureSchemaSync(sql) {
  // 0023_webhook_event.sql — eventos de entrada guardados antes de procesarse.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "webhook_event" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL,
      "fuente" text NOT NULL,
      "payload" jsonb NOT NULL,
      "huella" text NOT NULL,
      "status" text DEFAULT 'pendiente' NOT NULL,
      "attempts" integer DEFAULT 0 NOT NULL,
      "not_before" timestamp DEFAULT now() NOT NULL,
      "leased_until" timestamp,
      "last_error" text,
      "processed_at" timestamp,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  await sql.unsafe(`
    DO $$
    BEGIN
      ALTER TABLE "webhook_event"
        ADD CONSTRAINT "webhook_event_organization_id_organization_id_fk"
        FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await sql.unsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "webhook_event_huella_uq" ON "webhook_event" USING btree ("huella");`
  );
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS "webhook_event_barrido_idx" ON "webhook_event" USING btree ("status","not_before") WHERE "webhook_event"."status" in ('pendiente', 'en_proceso');`
  );
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS "webhook_event_org_status_idx" ON "webhook_event" USING btree ("organization_id","status");`
  );

  // 0024_quick_reply.sql — respuestas rápidas de la organización.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "quick_reply" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL,
      "atajo" text NOT NULL,
      "texto" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  await sql.unsafe(`
    DO $$
    BEGIN
      ALTER TABLE "quick_reply"
        ADD CONSTRAINT "quick_reply_organization_id_organization_id_fk"
        FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
        ON DELETE cascade ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await sql.unsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "quick_reply_org_atajo_uq" ON "quick_reply" USING btree ("organization_id","atajo");`
  );

  // 0025_conversation_note.sql — notas internas del hilo.
  await sql.unsafe(`
    CREATE TABLE IF NOT EXISTS "conversation_note" (
      "id" text PRIMARY KEY NOT NULL,
      "organization_id" text NOT NULL,
      "conversation_id" text NOT NULL,
      "author_user_id" text,
      "texto" text NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL
    );
  `);
  await sql.unsafe(`
    DO $$
    BEGIN
      ALTER TABLE "conversation_note"
        ADD CONSTRAINT "conversation_note_organization_id_organization_id_fk"
        FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id")
        ON DELETE cascade ON UPDATE no action;
      ALTER TABLE "conversation_note"
        ADD CONSTRAINT "conversation_note_conversation_id_conversation_id_fk"
        FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id")
        ON DELETE cascade ON UPDATE no action;
      ALTER TABLE "conversation_note"
        ADD CONSTRAINT "conversation_note_author_user_id_user_id_fk"
        FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);
  await sql.unsafe(
    `CREATE INDEX IF NOT EXISTS "conversation_note_conv_idx" ON "conversation_note" USING btree ("organization_id","conversation_id","created_at");`
  );

  // 0026_cuenta_de_mensajes.sql — la Cuenta de mensajes del split de 2026
  // (plantillas y pago). Aditiva y anulable.
  await sql.unsafe(
    `ALTER TABLE "meta_credentials" ADD COLUMN IF NOT EXISTS "messaging_account_id" text;`
  );
}

const maxAttempts = 15;
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  // TimeZone UTC: invariante de tiempo del proyecto (ver src/lib/db/index.ts).
  const sql = postgres(url, {
    max: 1,
    onnotice: () => { },
    connection: { TimeZone: "UTC" },
  });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
    await ensureSchemaSync(sql);
    console.log("[migrate] migraciones aplicadas");
    await sql.end();
    process.exit(0);
  } catch (err) {
    await sql.end().catch(() => { });
    if (attempt === maxAttempts) {
      console.error("[migrate] falló tras varios intentos:", err);
      process.exit(1);
    }
    console.log(
      `[migrate] BD no lista (intento ${attempt}/${maxAttempts}), reintento en 2s…`
    );
    await new Promise((r) => setTimeout(r, 2000));
  }
}
