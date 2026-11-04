/**
 * Catálogo de sonidos de notificación disponibles para el usuario.
 * Los archivos viven en `public/sounds/`.
 *
 * v2.7.6 — además de los cinco tonos del catálogo, el usuario puede subir
 * su propio archivo de audio desde el dispositivo (máx. 2 MB). El archivo
 * se guarda como Data URL (Base64) en localStorage y se reproduce con
 * `new Audio(dataUrl).play()`: nunca sale del navegador.
 */
export type NotificationSoundId =
  | "campanilla"
  | "beep"
  | "burbuja"
  | "suave"
  | "ninguno"
  | "personalizado";

export type NotificationSound = {
  id: NotificationSoundId;
  label: string;
  /** Ruta pública al archivo de audio. `null` para "ninguno" y "personalizado". */
  src: string | null;
};

export const NOTIFICATION_SOUNDS: NotificationSound[] = [
  { id: "campanilla", label: "Campanilla", src: "/sounds/campanilla.wav" },
  { id: "beep", label: "Beep", src: "/sounds/beep.wav" },
  { id: "burbuja", label: "Burbuja", src: "/sounds/burbuja.wav" },
  { id: "suave", label: "Tono suave", src: "/sounds/suave.wav" },
  { id: "ninguno", label: "Sin sonido", src: null },
  { id: "personalizado", label: "Personalizado (archivo de tu dispositivo)", src: null },
];

export const DEFAULT_SOUND_ID: NotificationSoundId = "campanilla";
const STORAGE_KEY = "vocero:notificationSound";

/** Tope del archivo personalizado: 2 MB (el Data URL puede crecer ~33 %). */
export const CUSTOM_SOUND_MAX_BYTES = 2 * 1024 * 1024;

/** Claves de localStorage del audio personalizado (v2.7.6). */
export const CUSTOM_SOUND_DATA_KEY = "jombe_custom_sound_data";
export const CUSTOM_SOUND_NAME_KEY = "jombe_custom_sound_name";

/** Lee la preferencia guardada en localStorage (o el default). */
export function getSavedSoundId(): NotificationSoundId {
  if (typeof window === "undefined") return DEFAULT_SOUND_ID;
  const v = window.localStorage.getItem(STORAGE_KEY);
  const found = NOTIFICATION_SOUNDS.find((s) => s.id === v);
  return found ? found.id : DEFAULT_SOUND_ID;
}

/** Guarda la preferencia en localStorage. */
export function saveSoundId(id: NotificationSoundId): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, id);
}

/**
 * Devuelve el Data URL del audio personalizado guardado, o `null` si no hay
 * ninguno (o si el navegador no lo soporta).
 */
export function getCustomSoundDataUrl(): string | null {
  if (typeof window === "undefined") return null;
  const data = window.localStorage.getItem(CUSTOM_SOUND_DATA_KEY);
  if (!data || !data.startsWith("data:audio/")) return null;
  return data;
}

/** Devuelve el nombre del archivo personalizado guardado, o `null`. */
export function getCustomSoundName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(CUSTOM_SOUND_NAME_KEY);
}

/**
 * Guarda el audio personalizado (Data URL + nombre del archivo). Lanzar
 * antes de guardar si el Data URL excede el tope de 2 MB.
 */
export function saveCustomSound(dataUrl: string, fileName: string): void {
  if (typeof window === "undefined") return;
  const bytes = Math.ceil(((dataUrl.length - (dataUrl.indexOf(",") + 1)) * 3) / 4);
  if (bytes > CUSTOM_SOUND_MAX_BYTES) {
    throw new Error("El archivo supera el máximo de 2 MB");
  }
  window.localStorage.setItem(CUSTOM_SOUND_DATA_KEY, dataUrl);
  window.localStorage.setItem(CUSTOM_SOUND_NAME_KEY, fileName);
}

/** Borra el audio personalizado guardado. */
export function clearCustomSound(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CUSTOM_SOUND_DATA_KEY);
  window.localStorage.removeItem(CUSTOM_SOUND_NAME_KEY);
}

/**
 * ¿El id dado es el sonido personalizado? Acepta `"custom"` por si una
 * versión anterior u otro cliente lo guardó así.
 */
export function esSonidoPersonalizado(id: string | null | undefined): boolean {
  return id === "personalizado" || id === "custom";
}
