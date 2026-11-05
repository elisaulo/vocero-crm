import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { moveLeadToStage } from "@/server/leads/stage-history";

/**
 * 067 — El pedido de Mercado Libre empuja el pipeline.
 *
 * Una venta en ML es un lead ganado y una cancelación, uno perdido; el resto de
 * estados (`payment_required`, `payment_in_process`) todavía no deciden nada y
 * no mueven la tarjeta. El movimiento pasa SIEMPRE por `moveLeadToStage` —es la
 * única puerta de `lead.stage_id` (guardarraíl en
 * `tests/unit/stage-history-guard.test.ts`)— y con `source: "sistema"`: lo
 * provocó un webhook, no una persona ni el cerebro.
 *
 * El monto y la moneda se leen de la ficha que `guardarContextoDeOrden` acaba
 * de escribir, y viajan en el MISMO update que la etapa (`extra`), para que la
 * tarjeta no enseñe un trato ganado sin su valor ni un instante.
 */

/** Estados de orden que cuentan como venta cerrada. */
const ESTADOS_GANADOS = new Set([
    "paid",
    "confirmed",
    "partially_paid",
    "shipped",
    "delivered",
]);

export async function sincronizarPipelineDeOrden(input: {
    organizationId: string;
    contactId: string;
    orderStatus: string;
}): Promise<void> {
    const ganada = ESTADOS_GANADOS.has(input.orderStatus);
    const perdida = input.orderStatus === "cancelled";
    if (!ganada && !perdida) return;

    const db = getDb();

    const leadRows = await db
        .select()
        .from(schema.lead)
        .where(
            scoped(
                schema.lead.organizationId,
                input.organizationId,
                eq(schema.lead.contactId, input.contactId)
            )
        )
        .limit(1);
    const lead = leadRows[0];
    // Sin lead no hay nada que mover: si la ingesta del mensaje aún no lo creó,
    // el siguiente evento lo encontrará.
    if (!lead) return;

    const anchorRows = await db
        .select({ id: schema.pipelineStage.id })
        .from(schema.pipelineStage)
        .where(
            scoped(
                schema.pipelineStage.organizationId,
                input.organizationId,
                eq(schema.pipelineStage.kind, ganada ? "won" : "lost")
            )
        )
        .limit(1);
    const anchor = anchorRows[0];
    // Un pipeline sin ancla ganada/perdida no es un error: se degrada en
    // silencio y la tarjeta se queda donde estaba.
    if (!anchor) return;

    // Ya está donde corresponde: no se reescribe el evento ni se toca nada.
    if (lead.stageId === anchor.id) return;

    const contactRows = await db
        .select({ ficha: schema.contact.ficha })
        .from(schema.contact)
        .where(
            scoped(
                schema.contact.organizationId,
                input.organizationId,
                eq(schema.contact.id, input.contactId)
            )
        )
        .limit(1);
    const ficha = (contactRows[0]?.ficha ?? {}) as Record<string, unknown>;

    const total = ficha.ml_order_total;
    const currency = ficha.ml_order_currency;
    const orderId = ficha.ml_order_id;
    const extra: Record<string, unknown> = {};
    if (typeof total === "number" && Number.isFinite(total)) {
        // ML manda el monto en unidades mayores (float) y el lead lo guarda en
        // centavos enteros.
        extra.amountCents = Math.round(total * 100);
        if (typeof currency === "string" && currency) extra.currency = currency;
    }

    await moveLeadToStage({
        organizationId: input.organizationId,
        leadId: lead.id,
        toStageId: anchor.id,
        source: "sistema",
        extra,
        // Al entrar a la etapa perdida el motivo no se puede inventar pero
        // tampoco puede faltar: se registra lo que de verdad pasó.
        lossReason: perdida ? "otro" : null,
        lossNote: perdida
            ? `Orden cancelada en Mercado Libre (#${typeof orderId === "string" ? orderId : input.contactId})`
            : null,
    });
}
