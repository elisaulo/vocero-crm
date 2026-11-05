import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { chatJson } from "@/lib/ai";
import { mlFetch } from "@/lib/mercadolibre/client";
import {
    ML_QUESTION_MAX_CHARS,
    mejorFaq,
    modoDe,
    recortarRespuesta,
    type MlQaMode,
    type MlQuestionStatus,
} from "@/lib/mercadolibre/qa";
import { getMlCredentialsByOrg } from "@/server/mercadolibre/credentials";

/**
 * 067 — Preguntas de las publicaciones de Mercado Libre.
 *
 * No es tráfico de bandeja: no hay conversación, no hay ventana y no hay
 * `message`. Vive en su propia tabla (`ml_question`) y su propia pantalla.
 *
 * El flujo de una pregunta nueva:
 *
 *  1. Llega el topic `questions` con un `resource` (`/questions/{id}`).
 *  2. Se busca la pregunta en ML con `mlFetch` y se guarda (idempotente por
 *     `ml_question_id`).
 *  3. Según el modo de la conexión (`ml_credentials.qa_mode`):
 *     - `off`: se queda `unanswered` y espera a una persona.
 *     - `copiloto`: la IA escribe un borrador (`draft`) y queda `drafted`.
 *     - `automatico`: primero se busca una FAQ aprendida; si la hay, se
 *       publica tal cual (sin inventar). Si no, la IA redacta y se publica.
 *
 * Publicar SIEMPRE pasa por `publicarRespuesta`, que es la única puerta que
 * habla con `POST /answers` de ML y la única que escribe `answer`/`answered_at`.
 */

/* ------------------------------------------------------------------ *
 * La forma que devuelve ML
 * ------------------------------------------------------------------ */

type MlQuestionPayload = {
    id: number | string;
    text?: string | null;
    status?: string | null;
    date_created?: string | null;
    item_id?: string | null;
    from?: { id?: number | string | null } | null;
    answer?: { text?: string | null; date_created?: string | null } | null;
};

/** El título de la publicación, para que la pantalla diga sobre qué preguntan. */
type MlItem = { id?: string; title?: string | null };

/* ------------------------------------------------------------------ *
 * Lectura y escritura de la tabla
 * ------------------------------------------------------------------ */

export type MlQuestionRow = typeof schema.mlQuestion.$inferSelect;

export type MlQuestionDto = {
    id: string;
    mlQuestionId: string;
    itemId: string | null;
    itemTitle: string | null;
    buyerIdentity: string | null;
    question: string;
    answer: string | null;
    draft: string | null;
    status: MlQuestionStatus;
    source: "humano" | "ia" | "faq" | null;
    askedAt: string;
    answeredAt: string | null;
};

export function serializeQuestion(row: MlQuestionRow): MlQuestionDto {
    return {
        id: row.id,
        mlQuestionId: row.mlQuestionId,
        itemId: row.itemId,
        itemTitle: row.itemTitle,
        buyerIdentity: row.buyerIdentity,
        question: row.question,
        answer: row.answer,
        draft: row.draft,
        status: row.status as MlQuestionStatus,
        source: row.source as MlQuestionDto["source"],
        askedAt: row.askedAt.toISOString(),
        answeredAt: row.answeredAt ? row.answeredAt.toISOString() : null,
    };
}

/** Las preguntas de la organización, lo más reciente primero. */
export async function listarPreguntas(
    organizationId: string,
    opts: { status?: MlQuestionStatus; limit?: number } = {}
): Promise<MlQuestionDto[]> {
    const where = opts.status
        ? and(
            scoped(schema.mlQuestion.organizationId, organizationId),
            eq(schema.mlQuestion.status, opts.status)
        )
        : scoped(schema.mlQuestion.organizationId, organizationId);

    const rows = await getDb()
        .select()
        .from(schema.mlQuestion)
        .where(where)
        .orderBy(desc(schema.mlQuestion.askedAt))
        .limit(opts.limit ?? 100);

    return rows.map(serializeQuestion);
}

export async function getPregunta(
    organizationId: string,
    id: string
): Promise<MlQuestionRow | null> {
    const rows = await getDb()
        .select()
        .from(schema.mlQuestion)
        .where(
            and(
                scoped(schema.mlQuestion.organizationId, organizationId),
                eq(schema.mlQuestion.id, id)
            )
        )
        .limit(1);
    return rows[0] ?? null;
}

/** Cuántas preguntas esperan respuesta: el número del menú. */
export async function contarPendientes(organizationId: string): Promise<number> {
    const rows = await getDb()
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.mlQuestion)
        .where(
            and(
                scoped(schema.mlQuestion.organizationId, organizationId),
                sql`${schema.mlQuestion.status} in ('unanswered', 'drafted')`
            )
        );
    return rows[0]?.n ?? 0;
}

/* ------------------------------------------------------------------ *
 * Las FAQ aprendidas
 * ------------------------------------------------------------------ */

export type MlFaqRow = typeof schema.mlFaq.$inferSelect;

export type MlFaqDto = {
    id: string;
    question: string;
    answer: string;
    keywords: string | null;
    hits: number;
};

export function serializeFaq(row: MlFaqRow): MlFaqDto {
    return {
        id: row.id,
        question: row.question,
        answer: row.answer,
        keywords: row.keywords,
        hits: row.hits,
    };
}

export async function listarFaqs(organizationId: string): Promise<MlFaqDto[]> {
    const rows = await getDb()
        .select()
        .from(schema.mlFaq)
        .where(scoped(schema.mlFaq.organizationId, organizationId))
        .orderBy(desc(schema.mlFaq.hits), asc(schema.mlFaq.createdAt));
    return rows.map(serializeFaq);
}

export class MlFaqError extends Error {
    constructor(
        readonly code: "not_found" | "invalid",
        message: string
    ) {
        super(message);
        this.name = "MlFaqError";
    }
}

export async function crearFaq(input: {
    organizationId: string;
    question: string;
    answer: string;
    keywords?: string | null;
}): Promise<MlFaqDto> {
    const question = input.question.trim();
    const answer = input.answer.trim();
    if (!question || !answer) {
        throw new MlFaqError("invalid", "La pregunta y la respuesta son obligatorias");
    }
    const [row] = await getDb()
        .insert(schema.mlFaq)
        .values({
            id: newId("mlFaq"),
            organizationId: input.organizationId,
            question,
            answer,
            keywords: input.keywords?.trim() || null,
        })
        .returning();
    return serializeFaq(row!);
}

export async function editarFaq(input: {
    organizationId: string;
    id: string;
    question?: string;
    answer?: string;
    keywords?: string | null;
}): Promise<MlFaqDto> {
    const patch: Partial<typeof schema.mlFaq.$inferInsert> = {
        updatedAt: new Date(),
    };
    if (input.question !== undefined) {
        const q = input.question.trim();
        if (!q) throw new MlFaqError("invalid", "La pregunta no puede quedar vacía");
        patch.question = q;
    }
    if (input.answer !== undefined) {
        const a = input.answer.trim();
        if (!a) throw new MlFaqError("invalid", "La respuesta no puede quedar vacía");
        patch.answer = a;
    }
    if (input.keywords !== undefined) {
        patch.keywords = input.keywords?.trim() || null;
    }

    const [row] = await getDb()
        .update(schema.mlFaq)
        .set(patch)
        .where(
            and(
                scoped(schema.mlFaq.organizationId, input.organizationId),
                eq(schema.mlFaq.id, input.id)
            )
        )
        .returning();
    if (!row) throw new MlFaqError("not_found", "Esa respuesta aprendida no existe");
    return serializeFaq(row);
}

export async function borrarFaq(
    organizationId: string,
    id: string
): Promise<void> {
    await getDb()
        .delete(schema.mlFaq)
        .where(
            and(
                scoped(schema.mlFaq.organizationId, organizationId),
                eq(schema.mlFaq.id, id)
            )
        );
}

/* ------------------------------------------------------------------ *
 * La IA: redactar una respuesta
 * ------------------------------------------------------------------ */

const Borrador = z.object({
    respuesta: z.string(),
});

/**
 * Le pide a la IA un borrador de respuesta para una pregunta de publicación.
 *
 * Devuelve `null` si no hay IA configurada o si el modelo no dio nada usable:
 * una pregunta sin borrador es mejor que una pregunta con una respuesta
 * inventada. El prompt es deliberadamente corto y sin conocimiento del negocio
 * — el conocimiento vive en las FAQ y en el perfil del agente, y aquí solo se
 * pide una respuesta breve y honesta.
 */
async function redactarBorrador(input: {
    organizationId: string;
    question: string;
    itemTitle: string | null;
}): Promise<string | null> {
    const system = [
        "Eres el vendedor de una tienda en Mercado Libre. Respondes UNA pregunta de un comprador sobre una publicación.",
        "Reglas:",
        "- Responde en español, breve (2 a 4 frases), cordial y concreto.",
        "- NO inventes datos que no conoces (precio, stock, plazos, garantías). Si no sabes, dilo y ofrece confirmarlo.",
        "- No prometas nada que no puedas cumplir.",
        'Responde ÚNICAMENTE un objeto JSON: {"respuesta":"..."}',
    ].join("\n");

    const user = [
        input.itemTitle ? `PUBLICACIÓN: ${input.itemTitle}` : "PUBLICACIÓN: (sin título)",
        `PREGUNTA DEL COMPRADOR: ${input.question}`,
        "Redacta la respuesta.",
    ].join("\n\n");

    const result = await chatJson(
        Borrador,
        [
            { role: "system", content: system },
            { role: "user", content: user },
        ],
        { organizationId: input.organizationId }
    );
    if (!result.ok) return null;
    return recortarRespuesta(result.data.respuesta);
}

/* ------------------------------------------------------------------ *
 * Publicar en ML
 * ------------------------------------------------------------------ */

/**
 * La ÚNICA puerta que publica una respuesta en ML.
 *
 * Escribe `answer`, `answered_at`, `status = answered` y `source`. Si ML
 * rechaza la publicación, la pregunta se queda como estaba: no se marca como
 * respondida algo que el comprador no puede leer.
 */
async function publicarRespuesta(input: {
    organizationId: string;
    row: MlQuestionRow;
    texto: string;
    source: "humano" | "ia" | "faq";
}): Promise<MlQuestionRow> {
    const texto = recortarRespuesta(input.texto);
    if (!texto) {
        throw new MlFaqError("invalid", "La respuesta está vacía");
    }

    await mlFetch(input.organizationId, `/answers`, {
        method: "POST",
        body: JSON.stringify({
            question_id: Number(input.row.mlQuestionId),
            text: texto,
        }),
    });

    const [row] = await getDb()
        .update(schema.mlQuestion)
        .set({
            answer: texto,
            draft: null,
            status: "answered",
            source: input.source,
            answeredAt: new Date(),
            updatedAt: new Date(),
        })
        .where(
            and(
                scoped(schema.mlQuestion.organizationId, input.organizationId),
                eq(schema.mlQuestion.id, input.row.id)
            )
        )
        .returning();
    return row!;
}

/** Una persona responde desde la pantalla. */
export async function responderPregunta(input: {
    organizationId: string;
    id: string;
    texto: string;
}): Promise<MlQuestionDto> {
    const row = await getPregunta(input.organizationId, input.id);
    if (!row) throw new MlFaqError("not_found", "Esa pregunta no existe");
    const actualizada = await publicarRespuesta({
        organizationId: input.organizationId,
        row,
        texto: input.texto,
        source: "humano",
    });
    return serializeQuestion(actualizada);
}

/** Aprobar el borrador de la IA tal cual (modo Copiloto). */
export async function aprobarBorrador(input: {
    organizationId: string;
    id: string;
}): Promise<MlQuestionDto> {
    const row = await getPregunta(input.organizationId, input.id);
    if (!row) throw new MlFaqError("not_found", "Esa pregunta no existe");
    if (!row.draft) {
        throw new MlFaqError("invalid", "Esa pregunta no tiene borrador que aprobar");
    }
    const actualizada = await publicarRespuesta({
        organizationId: input.organizationId,
        row,
        texto: row.draft,
        source: "ia",
    });
    return serializeQuestion(actualizada);
}

/** Descartar una pregunta: no se responde y sale de lo pendiente. */
export async function descartarPregunta(input: {
    organizationId: string;
    id: string;
}): Promise<MlQuestionDto> {
    const [row] = await getDb()
        .update(schema.mlQuestion)
        .set({ status: "ignored", updatedAt: new Date() })
        .where(
            and(
                scoped(schema.mlQuestion.organizationId, input.organizationId),
                eq(schema.mlQuestion.id, input.id)
            )
        )
        .returning();
    if (!row) throw new MlFaqError("not_found", "Esa pregunta no existe");
    return serializeQuestion(row);
}

/** Pedirle a la IA un borrador nuevo (o el primero) para una pregunta. */
export async function generarBorrador(input: {
    organizationId: string;
    id: string;
}): Promise<MlQuestionDto> {
    const row = await getPregunta(input.organizationId, input.id);
    if (!row) throw new MlFaqError("not_found", "Esa pregunta no existe");

    const draft = await redactarBorrador({
        organizationId: input.organizationId,
        question: row.question,
        itemTitle: row.itemTitle,
    });
    if (!draft) {
        throw new MlFaqError(
            "invalid",
            "La IA no está configurada o no devolvió un borrador"
        );
    }

    const [actualizada] = await getDb()
        .update(schema.mlQuestion)
        .set({ draft, status: "drafted", updatedAt: new Date() })
        .where(
            and(
                scoped(schema.mlQuestion.organizationId, input.organizationId),
                eq(schema.mlQuestion.id, row.id)
            )
        )
        .returning();
    return serializeQuestion(actualizada!);
}

/* ------------------------------------------------------------------ *
 * La ingesta: topic `questions`
 * ------------------------------------------------------------------ */

/** El id de la pregunta que ML codifica en el `resource`. */
function questionIdDeResource(resource: string): string | null {
    const m = resource.match(/\/questions\/([^/?]+)/);
    return m?.[1] ?? null;
}

/** El título de la publicación, best-effort: si falla, la pregunta entra igual. */
async function tituloDeItem(
    organizationId: string,
    itemId: string | null
): Promise<string | null> {
    if (!itemId) return null;
    try {
        const item = (await mlFetch(
            organizationId,
            `/items/${itemId}?attributes=id,title`,
            { allow404: true }
        )) as MlItem | null;
        return item?.title ?? null;
    } catch {
        return null;
    }
}

/**
 * Guarda la pregunta (idempotente) y decide qué hacer según el modo.
 *
 * Devuelve la fila resultante, o `null` si no había nada que guardar.
 */
async function guardarYDecidir(input: {
    organizationId: string;
    qaMode: MlQaMode;
    payload: MlQuestionPayload;
}): Promise<MlQuestionRow | null> {
    const mlQuestionId = String(input.payload.id);
    const texto = (input.payload.text ?? "").trim().slice(0, ML_QUESTION_MAX_CHARS);
    if (!texto) return null;

    const itemId = input.payload.item_id ?? null;
    const buyerId = input.payload.from?.id;
    const askedAt = input.payload.date_created
        ? new Date(input.payload.date_created)
        : new Date();

    // Idempotencia: si ya existe, no se vuelve a procesar (el webhook puede
    // repetir la notificación). Se devuelve la fila tal cual está.
    const existentes = await getDb()
        .select()
        .from(schema.mlQuestion)
        .where(
            and(
                scoped(schema.mlQuestion.organizationId, input.organizationId),
                eq(schema.mlQuestion.mlQuestionId, mlQuestionId)
            )
        )
        .limit(1);
    if (existentes[0]) return existentes[0];

    const itemTitle = await tituloDeItem(input.organizationId, itemId);

    const [row] = await getDb()
        .insert(schema.mlQuestion)
        .values({
            id: newId("mlQuestion"),
            organizationId: input.organizationId,
            mlQuestionId,
            itemId,
            itemTitle,
            buyerIdentity: buyerId != null ? `ml:${buyerId}` : null,
            question: texto,
            status: "unanswered",
            askedAt,
        })
        .onConflictDoNothing({
            target: [schema.mlQuestion.organizationId, schema.mlQuestion.mlQuestionId],
        })
        .returning();

    // Otra entrega ganó la carrera: se lee la que quedó.
    if (!row) {
        const [ganadora] = await getDb()
            .select()
            .from(schema.mlQuestion)
            .where(
                and(
                    scoped(schema.mlQuestion.organizationId, input.organizationId),
                    eq(schema.mlQuestion.mlQuestionId, mlQuestionId)
                )
            )
            .limit(1);
        return ganadora ?? null;
    }

    if (input.qaMode === "off") return row;

    // Modo Automático: primero la FAQ aprendida. Lo que el negocio ya dijo
    // manda sobre lo que el modelo crea.
    if (input.qaMode === "automatico") {
        const faqs = await getDb()
            .select()
            .from(schema.mlFaq)
            .where(scoped(schema.mlFaq.organizationId, input.organizationId));
        const match = mejorFaq(texto, faqs);
        if (match) {
            try {
                const publicada = await publicarRespuesta({
                    organizationId: input.organizationId,
                    row,
                    texto: match.faq.answer,
                    source: "faq",
                });
                await getDb()
                    .update(schema.mlFaq)
                    .set({ hits: sql`${schema.mlFaq.hits} + 1` })
                    .where(eq(schema.mlFaq.id, match.faq.id));
                return publicada;
            } catch (err) {
                console.warn(
                    `[mercadolibre] no se pudo publicar la FAQ en la pregunta ${mlQuestionId}: ${err}`
                );
                // Cae al borrador: mejor un borrador que nada.
            }
        }
    }

    // Copiloto (o Automático sin FAQ): la IA redacta y espera aprobación.
    const draft = await redactarBorrador({
        organizationId: input.organizationId,
        question: texto,
        itemTitle,
    });
    if (!draft) return row;

    if (input.qaMode === "automatico") {
        try {
            return await publicarRespuesta({
                organizationId: input.organizationId,
                row,
                texto: draft,
                source: "ia",
            });
        } catch (err) {
            console.warn(
                `[mercadolibre] no se pudo publicar el borrador en la pregunta ${mlQuestionId}: ${err}`
            );
        }
    }

    const [conBorrador] = await getDb()
        .update(schema.mlQuestion)
        .set({ draft, status: "drafted", updatedAt: new Date() })
        .where(eq(schema.mlQuestion.id, row.id))
        .returning();
    return conBorrador ?? row;
}

/**
 * `topic = questions`: una pregunta nueva (o su cambio) en una publicación.
 *
 * ML manda el `resource` (`/questions/{id}`) y hay que ir a buscarla. Si la
 * pregunta ya está respondida en ML (por ejemplo, el vendedor contestó desde
 * la app), se refleja aquí sin volver a publicar nada.
 */
export async function procesarPregunta(input: {
    organizationId: string;
    resource: string;
}): Promise<void> {
    const questionId = questionIdDeResource(input.resource);
    if (!questionId) return;

    const creds = await getMlCredentialsByOrg(input.organizationId);
    if (!creds) return;

    const payload = (await mlFetch(
        input.organizationId,
        `/questions/${questionId}`
    )) as MlQuestionPayload | null;
    if (!payload?.id) return;

    // Ya respondida en ML: se refleja y no se toca el modo.
    if (payload.answer?.text) {
        const texto = payload.answer.text.trim();
        if (!texto) return;
        const existentes = await getDb()
            .select()
            .from(schema.mlQuestion)
            .where(
                and(
                    scoped(schema.mlQuestion.organizationId, input.organizationId),
                    eq(schema.mlQuestion.mlQuestionId, String(payload.id))
                )
            )
            .limit(1);
        if (existentes[0]) {
            if (existentes[0].status !== "answered") {
                await getDb()
                    .update(schema.mlQuestion)
                    .set({
                        answer: texto,
                        draft: null,
                        status: "answered",
                        source: "humano",
                        answeredAt: payload.answer.date_created
                            ? new Date(payload.answer.date_created)
                            : new Date(),
                        updatedAt: new Date(),
                    })
                    .where(eq(schema.mlQuestion.id, existentes[0].id));
            }
            return;
        }
    }

    await guardarYDecidir({
        organizationId: input.organizationId,
        qaMode: modoDe(creds.qaMode),
        payload,
    });
}