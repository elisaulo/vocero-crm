/**
 * pnpm db:rebrand — Renombra la base de datos y el rol heredados de la era
 * «Vocero» a los de Jombe (2.8.0), sin perder datos.
 *
 * Por qué existe
 * --------------
 * El rebrand es de código, no de esquema: ninguna tabla ni columna lleva
 * «vocero» en el nombre. Lo que sí puede llevar el nombre viejo es el objeto
 * de Postgres en sí —`CREATE DATABASE vocero`, `CREATE USER vocero`, o los
 * defaults `POSTGRES_DB=vocero` / `POSTGRES_USER=vocero` de un
 * docker-compose viejo—. Eso no lo arregla una migración de Drizzle: se
 * renombra una sola vez, desde fuera, y con el CRM parado.
 *
 * Qué hace
 * --------
 *   1. Lee DATABASE_URL (o `--url`). La base y el rol de destino salen del
 *      nombre nuevo por defecto: `jombe`.
 *   2. Si existe una base llamada `vocero` y no existe una `jombe`, la
 *      renombra con `ALTER DATABASE ... RENAME TO`. Los datos, índices,
 *      propietarios y permisos sobreviven intactos.
 *   3. Igual con el rol: `ALTER ROLE vocero RENAME TO jombe`.
 *   4. Si la base nueva ya existe, o la vieja no existe, no toca nada: es
 *      re-ejecutable y se puede correr en cada despliegue sin riesgo.
 *
 * Qué NO hace
 * -----------
 * No toca DATABASE_URL de tu .env ni de tu panel: eso lo cambias tú (el
 * script imprime el valor exacto que hay que poner). Tampoco borra nada:
 * Postgres no deja renombrar una base con sesiones abiertas, así que hay que
 * parar el CRM primero.
 *
 * Uso
 * ---
 *   pnpm db:rebrand --dry-run    # muestra el SQL y no lo ejecuta
 *   pnpm db:rebrand              # ejecuta (pide confirmación)
 *   pnpm db:rebrand --force      # sin confirmación (CI / despliegue)
 *   pnpm db:rebrand --from vocero --to jombe
 *
 * Requiere que la URL conecte con un rol capaz de renombrar (postgres).
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import postgres from "postgres";
import { PG_CONNECTION_OPTIONS } from "@/lib/db";

// ─── .env, como los demás scripts (sin pisar el entorno del proceso) ─────────
const envPath = path.join(process.cwd(), ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

// ─── Argumentos ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const valor = (bandera) => {
    const i = args.indexOf(bandera);
    return i >= 0 ? args[i + 1] : undefined;
};
const FORCE = args.includes("--force");
const DRY_RUN = args.includes("--dry-run");
const DESDE = valor("--from") ?? "vocero";
const HASTA = valor("--to") ?? "jombe";

const url = valor("--url") ?? process.env.DATABASE_URL;
if (!url) {
    console.error("[rebrand] DATABASE_URL no está definida (ni hay --url)");
    process.exit(1);
}

// ─── Nombres que hay que cambiar ─────────────────────────────────────────────
const NOMBRES = [/^[a-z_][a-z0-9_]*$/i];
for (const [etiqueta, nombre] of [
    ["--from", DESDE],
    ["--to", HASTA],
]) {
    if (!NOMBRES[0].test(nombre)) {
        console.error(`[rebrand] ${etiqueta}="${nombre}" no es un nombre válido de Postgres`);
        process.exit(1);
    }
}
if (DESDE === HASTA) {
    console.log("[rebrand] el origen y el destino son el mismo nombre: nada que hacer");
    process.exit(0);
}

// ─── Cita de identificadores: se interpola solo lo que ya validamos ──────────
const ident = (nombre) => `"${nombre.replace(/"/g, '""')}"`;

/**
 * Conexión de mantenimiento. Para renombrar una base no se puede estar
 * conectado a ella, así que se va por `postgres` (o por la base que diga la
 * URL si esa tampoco existe). El resto de la URL se conserva tal cual: host,
 * puerto, credenciales y opciones de sesión.
 */
function urlHacia(base) {
    const u = new URL(url);
    u.pathname = `/${base}`;
    return u.toString();
}

async function conectar(base) {
    return postgres(urlHacia(base), { max: 1, ...PG_CONNECTION_OPTIONS });
}

async function pregunta(texto) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const respuesta = await new Promise((res) => rl.question(texto, res));
    rl.close();
    return respuesta.trim().toLowerCase();
}

const objetivo = new URL(url).pathname.replace(/^\//, "");

// ─── Plan ─────────────────────────────────────────────────────────────────────
const plan = [];

const pasos = await (async () => {
    let sql;
    try {
        sql = await conectar("postgres");
    } catch (err) {
        // Sin base `postgres` (instalaciones gestionadas que no la exponen), se
        // intenta por la base de la propia URL: ALTER DATABASE ... RENAME no
        // necesita conectarse a la base que renombra.
        try {
            sql = await conectar(objetivo);
        } catch {
            console.error(`[rebrand] no se pudo conectar para inspeccionar: ${err.message ?? err}`);
            process.exit(1);
        }
    }

    try {
        const bases = await sql`
      select datname from pg_database where datname in (${DESDE}, ${HASTA})
    `;
        const nombresBases = bases.map((r) => r.datname);

        const roles = await sql`
      select rolname from pg_roles where rolname in (${DESDE}, ${HASTA})
    `;
        const nombresRoles = roles.map((r) => r.rolname);

        return { nombresBases, nombresRoles };
    } finally {
        await sql.end().catch(() => { });
    }
})();

// Base de datos
if (pasos.nombresBases.includes(HASTA)) {
    plan.push({ tipo: "saltar", objeto: "base", motivo: `la base ${ident(HASTA)} ya existe` });
} else if (!pasos.nombresBases.includes(DESDE)) {
    plan.push({ tipo: "saltar", objeto: "base", motivo: `no hay ninguna base ${ident(DESDE)}` });
} else {
    plan.push({
        tipo: "renombrar",
        objeto: "base",
        sql: `ALTER DATABASE ${ident(DESDE)} RENAME TO ${ident(HASTA)};`,
    });
}

// Rol
if (pasos.nombresRoles.includes(HASTA)) {
    plan.push({ tipo: "saltar", objeto: "rol", motivo: `el rol ${ident(HASTA)} ya existe` });
} else if (!pasos.nombresRoles.includes(DESDE)) {
    plan.push({ tipo: "saltar", objeto: "rol", motivo: `no hay ningún rol ${ident(DESDE)}` });
} else {
    plan.push({
        tipo: "renombrar",
        objeto: "rol",
        sql: `ALTER ROLE ${ident(DESDE)} RENAME TO ${ident(HASTA)};`,
    });
}

// ─── Salida ──────────────────────────────────────────────────────────────────
console.log(`\n[rebrand] ${DESDE} → ${HASTA}\n`);
for (const p of plan) {
    if (p.tipo === "renombrar") console.log(`  · ${p.objeto}: ${p.sql}`);
    else console.log(`  · ${p.objeto}: se deja como está (${p.motivo})`);
}

const renombres = plan.filter((p) => p.tipo === "renombrar");
if (renombres.length === 0) {
    console.log("\n[rebrand] nada que renombrar: la base ya está en Jombe.\n");
    process.exit(0);
}

if (DRY_RUN) {
    console.log("\n[rebrand] --dry-run: no se ejecutó nada.\n");
    process.exit(0);
}

if (!FORCE) {
    console.log(
        "\n[rebrand] Para renombrar una base, Postgres exige que no haya sesiones abiertas:\n" +
        "          para el CRM antes (docker compose stop app) y ten una copia de seguridad.\n"
    );
    const si = await pregunta(`¿Renombrar ${DESDE} → ${HASTA}? [s/N] `);
    if (si !== "s" && si !== "si" && si !== "sí" && si !== "y") {
        console.log("[rebrand] cancelado\n");
        process.exit(0);
    }
}

// ─── Ejecución ───────────────────────────────────────────────────────────────
let sql;
try {
    sql = await conectar("postgres");
} catch {
    sql = await conectar(objetivo);
}

let fallos = 0;
try {
    for (const p of renombres) {
        try {
            await sql.unsafe(p.sql);
            console.log(`  ✓ ${p.objeto} renombrado`);
        } catch (err) {
            fallos++;
            console.error(`  ✗ ${p.objeto}: ${err.message ?? err}`);
            if (p.objeto === "base" && /being accessed by other users/.test(String(err))) {
                console.error(
                    "    hay sesiones abiertas contra la base: para el CRM (docker compose stop app) y reintenta"
                );
            }
        }
    }
} finally {
    await sql.end().catch(() => { });
}

if (fallos > 0) {
    console.error(`\n[rebrand] ${fallos} renombre(s) fallaron\n`);
    process.exit(1);
}

console.log(
    `\n[rebrand] listo. Actualiza DATABASE_URL para que apunte a ${ident(HASTA)}:\n` +
    `          ${urlHacia(HASTA)}\n` +
    `          (en docker compose no hace falta si POSTGRES_DB y POSTGRES_USER ya dicen ${HASTA})\n`
);
