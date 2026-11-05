import { describe, expect, it } from "vitest";
import { cuerpoDeCambio, serializeItem } from "@/server/mercadolibre/items";

describe("068 · serializeItem: la publicación cruda se vuelve un DTO plano", () => {
    it("una publicación completa pasa tal cual, sin perder nada", () => {
        const dto = serializeItem({
            id: "MLM123",
            title: "Taladro 1/2\" 700W",
            price: 1299.9,
            currency_id: "MXN",
            available_quantity: 7,
            sold_quantity: 42,
            status: "active",
            thumbnail: "https://http2.mlstatic.com/D_NQ_NP_1.jpg",
            permalink: "https://articulo.mercadolibre.com.mx/MLM-123",
            seller_sku: "TAL-700",
            listing_type_id: "gold_special",
        });

        expect(dto).toEqual({
            id: "MLM123",
            title: "Taladro 1/2\" 700W",
            price: 1299.9,
            currencyId: "MXN",
            availableQuantity: 7,
            soldQuantity: 42,
            status: "active",
            pausada: false,
            thumbnail: "https://http2.mlstatic.com/D_NQ_NP_1.jpg",
            permalink: "https://articulo.mercadolibre.com.mx/MLM-123",
            sellerSku: "TAL-700",
            listingTypeId: "gold_special",
        });
    });

    it("sin id no hay publicación: devuelve null en vez de un DTO a medias", () => {
        expect(serializeItem({})).toBeNull();
        expect(serializeItem({ id: "" })).toBeNull();
        expect(serializeItem({ id: 123 as unknown as string })).toBeNull();
    });

    it("sin título cae al id: la lista nunca enseña una fila en blanco", () => {
        expect(serializeItem({ id: "MLM1" })!.title).toBe("MLM1");
        expect(serializeItem({ id: "MLM1", title: "" })!.title).toBe("MLM1");
        expect(serializeItem({ id: "MLM1", title: null })!.title).toBe("MLM1");
    });

    it("un precio ausente o no numérico cae a 0, nunca a NaN", () => {
        expect(serializeItem({ id: "MLM1" })!.price).toBe(0);
        expect(serializeItem({ id: "MLM1", price: null })!.price).toBe(0);
        expect(serializeItem({ id: "MLM1", price: Number.NaN })!.price).toBe(0);
        expect(serializeItem({ id: "MLM1", price: Number.POSITIVE_INFINITY })!.price).toBe(0);
    });

    it("los opcionales que faltan quedan en null, no en undefined", () => {
        const dto = serializeItem({ id: "MLM1" })!;
        expect(dto.currencyId).toBeNull();
        expect(dto.availableQuantity).toBeNull();
        expect(dto.soldQuantity).toBeNull();
        expect(dto.thumbnail).toBeNull();
        expect(dto.permalink).toBeNull();
        expect(dto.sellerSku).toBeNull();
        expect(dto.listingTypeId).toBeNull();
    });

    it("stock 0 es un dato, no una ausencia: se conserva", () => {
        expect(serializeItem({ id: "MLM1", available_quantity: 0 })!.availableQuantity).toBe(0);
        expect(serializeItem({ id: "MLM1", sold_quantity: 0 })!.soldQuantity).toBe(0);
    });

    it("pausada es true en los estados en que no se vende", () => {
        for (const status of ["paused", "closed", "under_review", "inactive"]) {
            expect(serializeItem({ id: "MLM1", status })!.pausada).toBe(true);
        }
    });

    it("pausada es false cuando la publicación está activa", () => {
        expect(serializeItem({ id: "MLM1", status: "active" })!.pausada).toBe(false);
    });

    it("un estado desconocido o ausente no se da por pausado", () => {
        expect(serializeItem({ id: "MLM1", status: "payment_required" })!.pausada).toBe(false);
        expect(serializeItem({ id: "MLM1" })!.status).toBe("unknown");
        expect(serializeItem({ id: "MLM1" })!.pausada).toBe(false);
    });

    it("el SKU cae a seller_custom_field cuando no hay seller_sku", () => {
        expect(serializeItem({ id: "MLM1", seller_custom_field: "CUSTOM-9" })!.sellerSku).toBe(
            "CUSTOM-9"
        );
        expect(
            serializeItem({ id: "MLM1", seller_sku: "SKU-1", seller_custom_field: "CUSTOM-9" })!
                .sellerSku
        ).toBe("SKU-1");
        expect(serializeItem({ id: "MLM1", seller_sku: "", seller_custom_field: "" })!.sellerSku).toBe(
            null
        );
    });
});

describe("068 · cuerpoDeCambio: solo viaja lo que de verdad cambia", () => {
    it("un cambio de precio manda solo el precio", () => {
        expect(cuerpoDeCambio({ price: 999.5 })).toEqual({ price: 999.5 });
    });

    it("un cambio de stock manda solo available_quantity", () => {
        expect(cuerpoDeCambio({ availableQuantity: 12 })).toEqual({ available_quantity: 12 });
    });

    it("pausar y reactivar mandan solo el estado", () => {
        expect(cuerpoDeCambio({ status: "paused" })).toEqual({ status: "paused" });
        expect(cuerpoDeCambio({ status: "active" })).toEqual({ status: "active" });
    });

    it("los tres a la vez viajan juntos", () => {
        expect(cuerpoDeCambio({ price: 10, availableQuantity: 3, status: "active" })).toEqual({
            price: 10,
            available_quantity: 3,
            status: "active",
        });
    });

    it("sin nada válido el cuerpo queda vacío: no se gasta una escritura", () => {
        expect(cuerpoDeCambio({})).toEqual({});
    });

    it("un precio negativo o no finito se descarta", () => {
        expect(cuerpoDeCambio({ price: -1 })).toEqual({});
        expect(cuerpoDeCambio({ price: Number.NaN })).toEqual({});
        expect(cuerpoDeCambio({ price: Number.POSITIVE_INFINITY })).toEqual({});
    });

    it("precio 0 sí es un cambio válido", () => {
        expect(cuerpoDeCambio({ price: 0 })).toEqual({ price: 0 });
    });

    it("el stock se trunca a entero: ML no acepta fracciones", () => {
        expect(cuerpoDeCambio({ availableQuantity: 4.9 })).toEqual({ available_quantity: 4 });
    });

    it("un stock negativo se descarta", () => {
        expect(cuerpoDeCambio({ availableQuantity: -2 })).toEqual({});
    });

    it("un estado fuera de active/paused no se manda", () => {
        expect(cuerpoDeCambio({ status: "closed" as unknown as "active" })).toEqual({});
    });
});