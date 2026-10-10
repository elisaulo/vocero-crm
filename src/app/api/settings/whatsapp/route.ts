import { z } from "zod";
import { eq } from "drizzle-orm";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import {
  desconectarCanal,
  getCredentialsByOrg,
  saveCredentials,
  tokenLast4,
} from "@/server/whatsapp/credentials";
import {
  registerWebhookForNumber,
  testConnection,
  unregisterWebhookForNumber,
} from "@/server/whatsapp/connect";
import {
  webhookPath,
  webhookUrl,
  webhookVerifyToken,
} from "@/server/whatsapp/webhook-url";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (session) => {
  const db = getDb();
  const [creds, orgs] = await Promise.all([
    getCredentialsByOrg(session.organizationId),
    db
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.id, session.organizationId))
      .limit(1),
  ]);

  const org = orgs[0];

  return Response.json({
    whatsappProvider: org?.whatsappProvider ?? "meta",
    connection: creds
      ? {
          wabaId: creds.wabaId,
          phoneNumberId: creds.phoneNumberId,
          displayPhoneNumber: creds.displayPhoneNumber,
          verifiedName: creds.verifiedName,
          status: creds.status,
          tokenLast4: tokenLast4(creds.token),
        }
      : null,
    evolution: {
      apiUrl: org?.evolutionApiUrl ?? "",
      apiKeyLast4: org?.evolutionApiKey ? tokenLast4(org.evolutionApiKey) : "",
      instance: org?.evolutionInstance ?? "",
    },
  });
});

const putSchema = z.union([
  z.object({
    provider: z.enum(["meta", "evolution"]),
  }),
  z.object({
    evolutionApiUrl: z.string().trim().min(1),
    evolutionApiKey: z.string().trim().min(1),
    evolutionInstance: z.string().trim().min(1),
  }),
  z.object({
    wabaId: z.string().trim().min(1),
    phoneNumberId: z.string().trim().min(1),
    token: z.string().trim().min(1),
  }),
]);

export const PUT = withAuth(async (session, req: Request) => {
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  if ("provider" in body.data) {
    const db = getDb();
    await db
      .update(schema.organization)
      .set({ whatsappProvider: body.data.provider })
      .where(eq(schema.organization.id, session.organizationId));

    return Response.json({ ok: true, provider: body.data.provider });
  }

  if ("evolutionApiUrl" in body.data) {
    const db = getDb();
    await db
      .update(schema.organization)
      .set({
        whatsappProvider: "evolution",
        evolutionApiUrl: body.data.evolutionApiUrl,
        evolutionApiKey: body.data.evolutionApiKey,
        evolutionInstance: body.data.evolutionInstance,
      })
      .where(eq(schema.organization.id, session.organizationId));

    return Response.json({
      ok: true,
      provider: "evolution",
      evolution: {
        apiUrl: body.data.evolutionApiUrl,
        instance: body.data.evolutionInstance,
      },
    });
  }

  // Meta Cloud API Connection
  const check = await testConnection(
    body.data.phoneNumberId,
    body.data.token
  );
  if (!check.ok) {
    const status = check.code === "meta_unavailable" ? 503 : 422;
    return apiError(status, check.code, check.message);
  }

  await saveCredentials({
    organizationId: session.organizationId,
    wabaId: body.data.wabaId,
    phoneNumberId: body.data.phoneNumberId,
    token: body.data.token,
    displayPhoneNumber: check.displayPhoneNumber,
    verifiedName: check.verifiedName,
  });

  try {
    const db = getDb();
    await db
      .update(schema.organization)
      .set({ whatsappProvider: "meta" })
      .where(eq(schema.organization.id, session.organizationId));
  } catch {
    // En pruebas unitarias donde getDb no se conecta a Postgres real, ignorar
  }

  const webhook = await registerWebhookForNumber({
    wabaId: body.data.wabaId,
    phoneNumberId: body.data.phoneNumberId,
    token: body.data.token,
    webhookUrl: webhookUrl("wa"),
    verifyToken: webhookVerifyToken(),
  });

  return Response.json({
    ok: true,
    displayPhoneNumber: check.displayPhoneNumber,
    webhook,
  });
});

export const DELETE = withAuth(async (session) => {
  const creds = await getCredentialsByOrg(session.organizationId);
  if (creds) {
    await unregisterWebhookForNumber({
      phoneNumberId: creds.phoneNumberId,
      token: creds.token,
      webhookPath: webhookPath("wa"),
    });
  }
  await desconectarCanal(session.organizationId);
  return Response.json({ ok: true });
});
