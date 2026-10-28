/**
 * Catálogo de sonidos de notificación disponibles para el usuario.
 * Los archivos viven en `public/sounds/`.
 */
export type NotificationSoundId =
  | "campanilla"
  | "beep"
  | "burbuja"
  | "suave"
  | "ninguno";

export type NotificationSound = {
  id: NotificationSoundId;
  label: string;
  /** Ruta pública al archivo de audio. `null` para "ninguno". */
  src: string | null;
};

export const NOTIFICATION_SOUNDS: NotificationSound[] = [
  { id: "campanilla", label: "Campanilla", src: "/sounds/campanilla.wav" },
  { id: "beep",       label: "Beep",       src: "/sounds/beep.wav"       },
  { id: "burbuja",    label: "Burbuja",    src: "/sounds/burbuja.wav"    },
  { id: "suave",      label: "Tono suave", src: "/sounds/suave.wav"      },
  { id: "ninguno",    label: "Sin sonido", src: null                     },
];

export const DEFAULT_SOUND_ID: NotificationSoundId = "campanilla";
const STORAGE_KEY = "vocero:notificationSound";

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
