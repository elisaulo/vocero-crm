import { AsyncLocalStorage } from "node:async_hooks";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { getDb, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { AUTH_RATE_LIMIT, checkRateLimit, clientIp } from "@/lib/rate-limit";
import {
  onUserCreated,
  resolveActiveOrganizationId,
} from "@/server/auth/on-signup";
import { isPublicSignupAllowed } from "@/server/auth/registration";

/**
 * Contexto interno del proceso: permite que el alta de cuentas de equipo
 * (owner → API) atraviese el gate de registro cerrado. No es alcanzable
 * desde fuera: solo envuelve llamadas server-side.
 */
const globalForSignup = globalThis as unknown as {
  __voceroInternalSignup?: AsyncLocalStorage<boolean>;
};

// En globalThis: los módulos pueden evaluarse más de una vez (una por ruta en
// dev) y todas las copias deben compartir el mismo contexto.
function internalSignupContext(): AsyncLocalStorage<boolean> {
  if (!globalForSignup.__voceroInternalSignup) {
    globalForSignup.__voceroInternalSignup = new AsyncLocalStorage<boolean>();
  }
  return globalForSignup.__voceroInternalSignup;
}

export function runInternalSignup<T>(fn: () => Promise<T>): Promise<T> {
  return internalSignupContext().run(true, fn);
}

function isInternalSignup(): boolean {
  return internalSignupContext().getStore() === true;
}

const RATE_LIMITED_PATHS = new Set(["/sign-in/email", "/sign-up/email"]);

/**
 * Tarea 2 (rebranding a jombe.app): los orígenes desde los que se acepta una
 * petición de autenticación. `BETTER_AUTH_TRUSTED_ORIGINS` los declara a mano
 * (coma) porque conviven landing, www, la app y la API en subdominios
 * distintos; si falta, el único de confianza es el de `baseURL`.
 */
function trustedOrigins(env: ReturnType<typeof getEnv>): string[] {
  const declarados = (env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter((o) => o.length > 0);
  const base = (env.BETTER_AUTH_URL ?? env.APP_BASE_URL).replace(/\/+$/, "");
  return [...new Set([base, ...declarados])];
}

function createAuth() {
  const env = getEnv();
  return betterAuth({
    baseURL: env.BETTER_AUTH_URL ?? env.APP_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: trustedOrigins(env),
    // Tarea 2: la sesión solo viaja entre subdominios si se declara el dominio
    // padre (`.jombe.app`). Sin `AUTH_COOKIE_DOMAIN` la cookie es de host, que
    // es lo correcto en una instalación self-hosted de un solo host.
    advanced: env.AUTH_COOKIE_DOMAIN
      ? {
        crossSubDomainCookies: {
          enabled: true,
          domain: env.AUTH_COOKIE_DOMAIN,
        },
      }
      : undefined,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    plugins: [organization({ creatorRole: "owner" })],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Rate limit por IP en login/registro (FR-062): 10 / 10 min → 429.
        if (RATE_LIMITED_PATHS.has(ctx.path)) {
          const ip = clientIp(ctx.headers);
          const result = checkRateLimit(`${ctx.path}:${ip}`, AUTH_RATE_LIMIT);
          if (!result.allowed) {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Demasiados intentos; espera unos minutos",
            });
          }
        }
        // Registro público cerrado tras la primera organización (FR-060).
        if (ctx.path === "/sign-up/email") {
          if (!isInternalSignup() && !(await isPublicSignupAllowed())) {
            throw new APIError("FORBIDDEN", {
              message:
                "El registro está cerrado: esta instancia ya tiene su organización",
            });
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await onUserCreated(user.id, user.name);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const organizationId = await resolveActiveOrganizationId(
              session.userId
            );
            return {
              data: { ...session, activeOrganizationId: organizationId },
            };
          },
        },
      },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __voceroAuth?: Auth };

export function getAuth(): Auth {
  if (!globalForAuth.__voceroAuth) globalForAuth.__voceroAuth = createAuth();
  return globalForAuth.__voceroAuth;
}
