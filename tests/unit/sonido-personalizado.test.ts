import { describe, expect, it, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import {
    NOTIFICATION_SOUNDS,
    CUSTOM_SOUND_MAX_BYTES,
    CUSTOM_SOUND_DATA_KEY,
    CUSTOM_SOUND_NAME_KEY,
    getCustomSoundDataUrl,
    getCustomSoundName,
    saveCustomSound,
    clearCustomSound,
    esSonidoPersonalizado,
} from "@/lib/notification-sound";

// El entorno de Vitest es node (sin DOM). Las funciones del módulo usan
// `window.localStorage` con guarda `typeof window === "undefined"`, así que
// montamos un mock mínimo de window + localStorage para que las pruebas
// puedan ejercer la lectura, escritura y borrado reales.
const store = new Map<string, string>();
const localStorageMock = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
};

beforeAll(() => {
    // @ts-expect-error — mock mínimo para pruebas en node
    globalThis.window = { localStorage: localStorageMock };
});

afterAll(() => {
    // @ts-expect-error — limpieza del mock
    delete globalThis.window;
});

describe("v2.7.6 — sonido de notificación personalizado", () => {
    beforeEach(() => {
        window.localStorage.clear();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    it("el catálogo trae la sexta opción «Personalizado (archivo de tu dispositivo)»", () => {
        const personalizado = NOTIFICATION_SOUNDS.find((s) => s.id === "personalizado");
        expect(personalizado).toBeDefined();
        expect(personalizado?.label).toBe("Personalizado (archivo de tu dispositivo)");
        // No tiene src: el audio vive en localStorage, no en public/sounds/.
        expect(personalizado?.src).toBeNull();
        // Los cinco tonos originales siguen intactos.
        expect(NOTIFICATION_SOUNDS.map((s) => s.id)).toEqual([
            "campanilla",
            "beep",
            "burbuja",
            "suave",
            "ninguno",
            "personalizado",
        ]);
    });

    it("el tope es de 2 MB", () => {
        expect(CUSTOM_SOUND_MAX_BYTES).toBe(2 * 1024 * 1024);
    });

    it("saveCustomSound guarda el Data URL y el nombre en las claves de Jombe", () => {
        const dataUrl = "data:audio/mp3;base64,AAAA";
        saveCustomSound(dataUrl, "mi-tono.mp3");
        expect(window.localStorage.getItem(CUSTOM_SOUND_DATA_KEY)).toBe(dataUrl);
        expect(window.localStorage.getItem(CUSTOM_SOUND_NAME_KEY)).toBe("mi-tono.mp3");
        expect(getCustomSoundDataUrl()).toBe(dataUrl);
        expect(getCustomSoundName()).toBe("mi-tono.mp3");
    });

    it("un Data URL que no es audio no se devuelve", () => {
        window.localStorage.setItem(CUSTOM_SOUND_DATA_KEY, "data:image/png;base64,AAAA");
        expect(getCustomSoundDataUrl()).toBeNull();
        expect(getCustomSoundDataUrl()).toBeNull();
    });

    it("sin nada guardado devuelve null", () => {
        expect(getCustomSoundDataUrl()).toBeNull();
        expect(getCustomSoundName()).toBeNull();
    });

    it("un archivo que supera 2 MB lanza y no guarda nada", () => {
        // Necesitamos que la parte base64 represente más de 2 MB de datos.
        // La fórmula de saveCustomSound: bytes_decodificados ≈ base64_len * 3 / 4.
        // Para superar CUSTOM_SOUND_MAX_BYTES debemos dar un base64 de al menos
        // ceil(CUSTOM_SOUND_MAX_BYTES * 4 / 3) + algo de margen.
        const longitudBase64 = Math.ceil((CUSTOM_SOUND_MAX_BYTES * 4) / 3) + 100;
        const grande = "data:audio/wav;base64," + "A".repeat(longitudBase64);
        expect(() => saveCustomSound(grande, "grande.wav")).toThrow(/2 MB/);
        expect(window.localStorage.getItem(CUSTOM_SOUND_DATA_KEY)).toBeNull();
        expect(window.localStorage.getItem(CUSTOM_SOUND_NAME_KEY)).toBeNull();
    });

    it("clearCustomSound borra ambas claves", () => {
        saveCustomSound("data:audio/ogg;base64,BBBB", "tono.ogg");
        clearCustomSound();
        expect(window.localStorage.getItem(CUSTOM_SOUND_DATA_KEY)).toBeNull();
        expect(window.localStorage.getItem(CUSTOM_SOUND_NAME_KEY)).toBeNull();
    });

    it("esSonidoPersonalizado acepta «personalizado» y «custom», y nada más", () => {
        expect(esSonidoPersonalizado("personalizado")).toBe(true);
        expect(esSonidoPersonalizado("custom")).toBe(true);
        expect(esSonidoPersonalizado("campanilla")).toBe(false);
        expect(esSonidoPersonalizado("ninguno")).toBe(false);
        expect(esSonidoPersonalizado(null)).toBe(false);
        expect(esSonidoPersonalizado(undefined)).toBe(false);
    });
});
