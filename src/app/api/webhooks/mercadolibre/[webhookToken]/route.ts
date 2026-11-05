import { getEnv } from "@/lib/env";
import { isValidWebhookToken } from "@/server/inbox/webhook";
import {
    channelDisabledResponse,
    isChannelEnabled,
} from "@/server/channels/enabled";
import { recibirEvento } from "@/server/webhooks/recibir";

export const dynamic = "force-dynamic";
type Params = { params: Promise<{ webhookToken: string }> };

export async function GET(_req: Request, { params }: Params) {
    if (!isChannelEnabled("mercadolibre")) return channelDisabledResponse();
    const { webhookToken } = await params;
    if (!isValidWebhookToken(webhookToken, getEnv().META_WEBHOOK_VERIFY_TOKEN)) {
        return new Response(null, { status: 404 });
    }
    return Response.json({ ok: true });
}

export async function POST(req: Request, { params }: Params) {
    if (!isChannelEnabled("mercadolibre")) return channelDisabledResponse();
    const { webhookToken } = await params;
    if (!isValidWebhookToken(webhookToken, getEnv().META_WEBHOOK_VERIFY_TOKEN)) {
        return new Response(null, { status: 404 });
    }
    const rawBody = await req.text();
    let payload: unknown;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        // Mercado Libre no firma sus notificaciones: la autenticidad se establece
        // después, cuando mlFetch vuelve a pedir el recurso con el token guardado.
        // Un cuerpo que no es JSON no lleva nada que procesar: se acusa recibido.
        return Response.json({ received: true });
    }
    return recibirEvento("mercadolibre", payload, rawBody, "mercadolibre");
}
