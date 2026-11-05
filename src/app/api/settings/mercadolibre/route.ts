import { z } from "zod";
import { parseBody, withAuth } from "@/lib/api";
import { isMlConfigured, mlAuthorizeUrl } from "@/lib/mercadolibre/client";
import { ML_QA_MODES } from "@/lib/mercadolibre/qa";
import {
    deleteMlCredentials,
    getMlCredentialsByOrg,
    setMlQaMode,
    tokenLast4,
} from "@/server/mercadolibre/credentials";

export const dynamic = "force-dynamic";

/** Estado de la conexión con Mercado Libre, para Ajustes. */
export const GET = withAuth(async (session) => {
    if (!isMlConfigured()) {
        return Response.json({ configured: false, connection: null });
    }
    const creds = await getMlCredentialsByOrg(session.organizationId);
    if (!creds) {
        return Response.json({ configured: true, connection: null });
    }
    return Response.json({
        configured: true,
        connection: {
            status: creds.status,
            nickname: creds.nickname,
            mlUserId: creds.mlUserId,
            tokenLast4: tokenLast4(creds.accessToken),
            qaMode: creds.qaMode,
        },
    });
});

const QaModeBody = z.object({
    qaMode: z.enum(ML_QA_MODES),
});

/** 067 — cambia cómo contesta la IA las preguntas de las publicaciones. */
export const PATCH = withAuth(async (session, req: Request) => {
    const body = await parseBody(req, QaModeBody);
    if (!body.ok) return body.response;
    const creds = await getMlCredentialsByOrg(session.organizationId);
    if (!creds) {
        return Response.json(
            { error: "ml_no_conectado", message: "No hay una cuenta de Mercado Libre conectada" },
            { status: 409 }
        );
    }
    await setMlQaMode(session.organizationId, body.data.qaMode);
    return Response.json({ ok: true, qaMode: body.data.qaMode });
});

/**
 * Arranca el flujo OAuth: devuelve la URL de autorización de ML con `state`
 * igual a la organización activa, para que el callback la pueda confirmar
 * contra la sesión de quien vuelva.
 */
export const POST = withAuth(async (session) => {
    if (!isMlConfigured()) {
        return Response.json(
            { error: "ml_no_configurado", message: "Mercado Libre no está configurado en esta instancia" },
            { status: 409 }
        );
    }
    // El `state` ES la organización activa: el callback lo compara con la
    // sesión de quien vuelve, así que si alguien abre la URL de autorización
    // en otro navegador, el canje se rechaza.
    return Response.json({ url: mlAuthorizeUrl(session.organizationId) });
});

export const DELETE = withAuth(async (session) => {
    await deleteMlCredentials(session.organizationId);
    return Response.json({ ok: true });
});
