import { mlFetch } from "@/lib/mercadolibre/client";
import { getMlCredentialsByOrg } from "@/server/mercadolibre/credentials";

/**
 * 068 — Publicaciones y stock.
 *
 * Las publicaciones NO se guardan en la base: viven en Mercado Libre y son la
 * fuente de la verdad. Este módulo las lee y las escribe contra la API, y
 * devuelve DTOs planos para que la pantalla no sepa de la forma cruda de ML.
 *
 * Todo pasa por `mlFetch`, que ya resuelve el token, el refresco y el 401.
 */

/** Lo que la pantalla necesita de una publicación. */
export type MlItemDto = {
    id: string;
    title: string;
    /** Precio en la moneda de la publicación, tal como lo da ML. */
    price: number;
    currencyId: string | null;
    availableQuantity: number | null;
    soldQuantity: number | null;
    /** active, paused, closed… tal como lo dice ML. */
    status: string;
    /** true si la publicación está pausada o cerrada: no se vende. */
    pausada: boolean;
    /** URL de la foto principal, si la hay. */
    thumbnail: string | null;
    permalink: string | null;
    /** SKU del vendedor, si lo puso. */
    sellerSku: string | null;
    /** Tipo de publicación: gold_special, gold_pro, free… */
    listingTypeId: string | null;
};

/** La forma cruda que devuelve `/items` y `/items/{id}` (solo lo que usamos). */
type MlItemPayload = {
    id?: string;
    title?: string | null;
    price?: number | null;
    currency_id?: string | null;
    available_quantity?: number | null;
    sold_quantity?: number | null;
    status?: string | null;
    thumbnail?: string | null;
    permalink?: string | null;
    seller_sku?: string | null;
    seller_custom_field?: string | null;
    listing_type_id?: string | null;
};

/** La forma de la respuesta multiget: `[{ code, body }]`. */
type MlMultiGetEntry = { code?: number; body?: MlItemPayload | null };

/** La forma de `/users/{id}/items/search`. */
type MlSearchPayload = {
    results?: string[] | null;
    paging?: { total?: number | null; limit?: number | null; offset?: number | null } | null;
};

/** Estados de ML en los que la publicación no se está vendiendo. */
const ESTADOS_PAUSADOS = new Set(["paused", "closed", "under_review", "inactive"]);

/**
 * Una publicación cruda → DTO. Puro y exportado para poder probarlo sin red.
 * Tolera campos ausentes: ML no siempre manda todo.
 */
export function serializeItem(raw: MlItemPayload): MlItemDto | null {
    if (!raw || typeof raw.id !== "string" || !raw.id) return null;
    const status = typeof raw.status === "string" ? raw.status : "unknown";
    return {
        id: raw.id,
        title: typeof raw.title === "string" && raw.title ? raw.title : raw.id,
        price: typeof raw.price === "number" && Number.isFinite(raw.price) ? raw.price : 0,
        currencyId: typeof raw.currency_id === "string" ? raw.currency_id : null,
        availableQuantity:
            typeof raw.available_quantity === "number" && Number.isFinite(raw.available_quantity)
                ? raw.available_quantity
                : null,
        soldQuantity:
            typeof raw.sold_quantity === "number" && Number.isFinite(raw.sold_quantity)
                ? raw.sold_quantity
                : null,
        status,
        pausada: ESTADOS_PAUSADOS.has(status),
        thumbnail: typeof raw.thumbnail === "string" && raw.thumbnail ? raw.thumbnail : null,
        permalink: typeof raw.permalink === "string" && raw.permalink ? raw.permalink : null,
        sellerSku:
            (typeof raw.seller_sku === "string" && raw.seller_sku) ||
            (typeof raw.seller_custom_field === "string" && raw.seller_custom_field) ||
            null,
        listingTypeId: typeof raw.listing_type_id === "string" ? raw.listing_type_id : null,
    };
}

/**
 * Los ids de las publicaciones del vendedor, paginados.
 * `/users/{id}/items/search` devuelve solo ids; los detalles van aparte.
 */
export async function idsDePublicaciones(
    organizationId: string,
    opts: { limit?: number; offset?: number } = {}
): Promise<{ ids: string[]; total: number }> {
    const creds = await getMlCredentialsByOrg(organizationId);
    if (!creds) return { ids: [], total: 0 };
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const offset = Math.max(opts.offset ?? 0, 0);
    const payload = (await mlFetch(
        organizationId,
        `/users/${creds.mlUserId}/items/search?limit=${limit}&offset=${offset}`
    )) as MlSearchPayload | null;
    const ids = Array.isArray(payload?.results)
        ? payload!.results!.filter((id): id is string => typeof id === "string" && id.length > 0)
        : [];
    const total =
        typeof payload?.paging?.total === "number" && Number.isFinite(payload.paging.total)
            ? payload.paging.total
            : ids.length;
    return { ids, total };
}

/**
 * Los detalles de hasta 20 publicaciones en una sola llamada (`/items?ids=`).
 * ML corta el multiget en 20; lo que sobre se pide en tandas.
 */
export async function detallesDePublicaciones(
    organizationId: string,
    ids: string[]
): Promise<MlItemDto[]> {
    const limpios = ids.filter((id) => typeof id === "string" && id.length > 0);
    if (limpios.length === 0) return [];
    const salida: MlItemDto[] = [];
    for (let i = 0; i < limpios.length; i += 20) {
        const tanda = limpios.slice(i, i + 20);
        const payload = (await mlFetch(
            organizationId,
            `/items?ids=${tanda.join(",")}`
        )) as MlMultiGetEntry[] | null;
        if (!Array.isArray(payload)) continue;
        for (const entry of payload) {
            // Un 404 dentro del multiget viene como `{ code: 404, body: {...error} }`.
            if (entry?.code !== undefined && entry.code !== 200) continue;
            const dto = serializeItem(entry?.body ?? {});
            if (dto) salida.push(dto);
        }
    }
    return salida;
}

/**
 * Las publicaciones del vendedor, ya con sus detalles.
 * Es lo que pinta la pantalla: una sola llamada de la UI.
 */
export async function listarPublicaciones(
    organizationId: string,
    opts: { limit?: number; offset?: number } = {}
): Promise<{ items: MlItemDto[]; total: number }> {
    const { ids, total } = await idsDePublicaciones(organizationId, opts);
    const items = await detallesDePublicaciones(organizationId, ids);
    return { items, total };
}

/** Una publicación por id, o `null` si no existe o no es de esta cuenta. */
export async function getPublicacion(
    organizationId: string,
    itemId: string
): Promise<MlItemDto | null> {
    if (!itemId) return null;
    const payload = (await mlFetch(organizationId, `/items/${itemId}`, {
        allow404: true,
    })) as MlItemPayload | null;
    return payload ? serializeItem(payload) : null;
}

/** Lo que se puede cambiar de una publicación desde el CRM. */
export type CambioPublicacion = {
    /** Precio en la moneda de la publicación (no centavos: ML usa decimales). */
    price?: number;
    /** Unidades disponibles. */
    availableQuantity?: number;
    /** active | paused — para pausar o reactivar. */
    status?: "active" | "paused";
};

/**
 * El cuerpo del `PUT /items/{id}`. Puro y exportado para probarlo.
 * Solo incluye lo que de verdad cambia: mandar un campo de más puede pisar
 * un valor que el vendedor puso en ML y aquí no se ve.
 */
export function cuerpoDeCambio(cambio: CambioPublicacion): Record<string, unknown> {
    const cuerpo: Record<string, unknown> = {};
    if (typeof cambio.price === "number" && Number.isFinite(cambio.price) && cambio.price >= 0) {
        cuerpo.price = cambio.price;
    }
    if (
        typeof cambio.availableQuantity === "number" &&
        Number.isFinite(cambio.availableQuantity) &&
        cambio.availableQuantity >= 0
    ) {
        cuerpo.available_quantity = Math.trunc(cambio.availableQuantity);
    }
    if (cambio.status === "active" || cambio.status === "paused") {
        cuerpo.status = cambio.status;
    }
    return cuerpo;
}

/**
 * Cambiar precio, stock o estado de una publicación.
 * Devuelve la publicación ya actualizada, o `null` si ML no la encontró.
 */
export async function actualizarPublicacion(
    organizationId: string,
    itemId: string,
    cambio: CambioPublicacion
): Promise<MlItemDto | null> {
    const cuerpo = cuerpoDeCambio(cambio);
    if (Object.keys(cuerpo).length === 0) {
        // Nada que cambiar: se devuelve la publicación tal cual, sin gastar una
        // llamada de escritura contra ML.
        return getPublicacion(organizationId, itemId);
    }
    const payload = (await mlFetch(organizationId, `/items/${itemId}`, {
        method: "PUT",
        body: JSON.stringify(cuerpo),
        allow404: true,
    })) as MlItemPayload | null;
    return payload ? serializeItem(payload) : null;
}
