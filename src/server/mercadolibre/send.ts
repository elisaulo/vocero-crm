import { mlFetch } from "@/lib/mercadolibre/client";
import type { MlCredentials } from "@/server/mercadolibre/credentials";

export type MlSendResult = { platformMessageId: string };

type MlMessageResponse = {
    id?: string | number;
    message_id?: string | number;
};

/**
 * Mensajería post-venta de Mercado Libre: un mensaje sale dentro del pack
 * (orden) al que pertenece la conversación, nunca suelto. `threadRef` es el
 * packId, igual que TikTok usa `channelThreadRef` para su propia conversación.
 * `recipient` es el user_id del comprador en Mercado Libre.
 */
export async function sendMlText(input: {
    credentials: MlCredentials;
    recipient: string;
    threadRef: string | null;
    text: string;
}): Promise<MlSendResult> {
    const { credentials, recipient, threadRef, text } = input;
    if (!threadRef) {
        throw new Error("Falta el packId del pedido: no hay a dónde enviar el mensaje");
    }

    const res = await mlFetch(
        credentials.organizationId,
        `/messages/packs/${threadRef}/sellers/${credentials.mlUserId}?tag=post_sale`,
        {
            method: "POST",
            body: JSON.stringify({
                from: { user_id: credentials.mlUserId },
                to: { user_id: recipient },
                text,
            }),
        }
    );

    const data = (res ?? {}) as MlMessageResponse;
    const id = data.id ?? data.message_id;
    return { platformMessageId: id != null ? String(id) : `ml_out_${Date.now()}` };
}
