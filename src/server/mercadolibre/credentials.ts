import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";

/**
 * Credenciales OAuth de la cuenta de Mercado Libre conectada.
 *
 * Dos secretos cifrados (access token + refresh token) con el mismo
 * AES-256-GCM del resto del CRM. El access token se refresca automáticamente
 * en `mlFetch` cuando `tokenExpiresAt` está próximo; aquí se exponen solo las
 * funciones de lectura/escritura, sin lógica de refresh.
 */

export type MlCredentials = {
    id: string;
    organizationId: string;
    mlUserId: string;
    nickname: string | null;
    /** 069 — sitio del vendedor (`MLM`, `MLB`…); puede faltar en cuentas viejas. */
    siteId: string | null;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date;
    scope: string | null;
    status: "connected" | "reconnect_required";
    /** 067 — cómo contesta la IA las preguntas de las publicaciones. */
    qaMode: "off" | "copiloto" | "automatico";
};

type Row = typeof schema.mlCredentials.$inferSelect;

function toCredentials(row: Row): MlCredentials {
    return {
        id: row.id,
        organizationId: row.organizationId,
        mlUserId: row.mlUserId,
        nickname: row.nickname,
        siteId: row.siteId,
        accessToken: decryptSecret({
            cipher: row.accessTokenCipher,
            iv: row.accessTokenIv,
            tag: row.accessTokenTag,
        }),
        refreshToken: decryptSecret({
            cipher: row.refreshTokenCipher,
            iv: row.refreshTokenIv,
            tag: row.refreshTokenTag,
        }),
        tokenExpiresAt: row.tokenExpiresAt,
        scope: row.scope,
        status: row.status,
        qaMode: row.qaMode,
    };
}

export async function getMlCredentialsByOrg(
    organizationId: string
): Promise<MlCredentials | null> {
    const rows = await getDb()
        .select()
        .from(schema.mlCredentials)
        .where(scoped(schema.mlCredentials.organizationId, organizationId))
        .limit(1);
    return rows[0] ? toCredentials(rows[0]) : null;
}

/** Enrutado del webhook: cada notificación de ML trae `user_id`. */
export async function getMlCredentialsByUserId(
    mlUserId: string
): Promise<MlCredentials | null> {
    const rows = await getDb()
        .select()
        .from(schema.mlCredentials)
        .where(eq(schema.mlCredentials.mlUserId, mlUserId))
        .limit(1);
    return rows[0] ? toCredentials(rows[0]) : null;
}

export async function saveMlCredentials(input: {
    organizationId: string;
    mlUserId: string;
    nickname: string | null;
    /** 069 — sitio del vendedor; si no se sabe, `null` y se rellena luego. */
    siteId?: string | null;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: Date;
    scope: string | null;
}): Promise<void> {
    const db = getDb();
    const access = encryptSecret(input.accessToken);
    const refresh = encryptSecret(input.refreshToken);
    const values = {
        mlUserId: input.mlUserId,
        nickname: input.nickname,
        siteId: input.siteId ?? null,
        accessTokenCipher: access.cipher,
        accessTokenIv: access.iv,
        accessTokenTag: access.tag,
        refreshTokenCipher: refresh.cipher,
        refreshTokenIv: refresh.iv,
        refreshTokenTag: refresh.tag,
        tokenExpiresAt: input.tokenExpiresAt,
        scope: input.scope,
        status: "connected" as const,
        updatedAt: new Date(),
    };

    await db
        .insert(schema.mlCredentials)
        .values({
            id: newId("mlCredentials"),
            organizationId: input.organizationId,
            ...values,
        })
        .onConflictDoUpdate({
            target: [schema.mlCredentials.organizationId],
            set: values,
        });
}

/** Actualiza solo el access token cuando el refresh lo renueva. */
export async function updateMlAccessToken(
    id: string,
    accessToken: string,
    expiresAt: Date
): Promise<void> {
    const enc = encryptSecret(accessToken);
    await getDb()
        .update(schema.mlCredentials)
        .set({
            accessTokenCipher: enc.cipher,
            accessTokenIv: enc.iv,
            accessTokenTag: enc.tag,
            tokenExpiresAt: expiresAt,
            status: "connected",
            updatedAt: new Date(),
        })
        .where(eq(schema.mlCredentials.id, id));
}

/** 069 — guarda el sitio del vendedor cuando una cuenta vieja no lo tenía. */
export async function updateMlSiteId(
    organizationId: string,
    siteId: string
): Promise<void> {
    await getDb()
        .update(schema.mlCredentials)
        .set({ siteId, updatedAt: new Date() })
        .where(scoped(schema.mlCredentials.organizationId, organizationId));
}

/** El refresh token venció: se requiere reconectar desde la UI. */
export async function markMlReconnectRequired(
    organizationId: string
): Promise<void> {
    await getDb()
        .update(schema.mlCredentials)
        .set({ status: "reconnect_required", updatedAt: new Date() })
        .where(scoped(schema.mlCredentials.organizationId, organizationId));
}

export async function deleteMlCredentials(
    organizationId: string
): Promise<void> {
    await getDb()
        .delete(schema.mlCredentials)
        .where(scoped(schema.mlCredentials.organizationId, organizationId));
}

/** 067 — cambia cómo contesta la IA las preguntas de las publicaciones. */
export async function setMlQaMode(
    organizationId: string,
    qaMode: "off" | "copiloto" | "automatico"
): Promise<void> {
    await getDb()
        .update(schema.mlCredentials)
        .set({ qaMode, updatedAt: new Date() })
        .where(scoped(schema.mlCredentials.organizationId, organizationId));
}

/** Solo los últimos 4 del access token, para la UI. */
export function tokenLast4(token: string): string {
    return token.slice(-4);
}
