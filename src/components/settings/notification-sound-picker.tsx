"use client";

import { useState, useRef, useEffect } from "react";
import { Volume2, VolumeX, Play, Upload, Trash2 } from "lucide-react";
import {
  NOTIFICATION_SOUNDS,
  CUSTOM_SOUND_MAX_BYTES,
  clearCustomSound,
  getCustomSoundDataUrl,
  getCustomSoundName,
  saveCustomSound,
  type NotificationSoundId,
} from "@/lib/notification-sound";
import { useNotificationSound } from "@/components/use-notification-sound";
import { cn } from "@/lib/utils";

export function NotificationSoundPicker() {
  const { soundId, setSoundId, preview } = useNotificationSound();
  const [previewing, setPreviewing] = useState<NotificationSoundId | null>(null);
  const [customFileName, setCustomFileName] = useState<string | null>(null);
  const [customDataUrl, setCustomDataUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // v2.7.6 — Carga el audio personalizado guardado al montar (localStorage
  // no existe en el servidor, así que se lee tras la hidratación).
  useEffect(() => {
    setCustomFileName(getCustomSoundName());
    setCustomDataUrl(getCustomSoundDataUrl());
  }, []);

  function handlePreview(id: NotificationSoundId) {
    setPreviewing(id);
    preview(id);
    setTimeout(() => setPreviewing(null), 900);
  }

  /**
   * v2.7.6 — Lee el archivo seleccionado por el usuario como Data URL (Base64)
   * y lo guarda en localStorage si cabe en 2 MB.
   */
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setUploadError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validación de tipo: solo audio.
    if (!file.type.startsWith("audio/")) {
      setUploadError("El archivo debe ser de audio");
      return;
    }

    // Validación de tamaño: máximo 2 MB.
    if (file.size > CUSTOM_SOUND_MAX_BYTES) {
      setUploadError("El archivo supera el máximo de 2 MB");
      return;
    }

    // Lee el archivo como Data URL y guarda.
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const dataUrl = reader.result as string;
        saveCustomSound(dataUrl, file.name);
        setCustomFileName(file.name);
        setCustomDataUrl(dataUrl);
        setSoundId("personalizado");
        setUploadError(null);
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : "Error al guardar el archivo");
      }
    };
    reader.onerror = () => {
      setUploadError("Error al leer el archivo");
    };
    reader.readAsDataURL(file);
    // Permite volver a elegir el mismo archivo (el input no dispara change).
    e.target.value = "";
  }

  /** v2.7.6 — Olvida el audio personalizado guardado. */
  function handleClearCustom() {
    clearCustomSound();
    setCustomDataUrl(null);
    setCustomFileName(null);
    setUploadError(null);
    if (soundId === "personalizado") setSoundId("campanilla");
  }

  return (
    <div className="space-y-3">
      {NOTIFICATION_SOUNDS.map((sound) => {
        const isSelected = soundId === sound.id;
        const isPersonalizado = sound.id === "personalizado";
        // El Data URL vive en estado: se lee de localStorage al montar y al subir.
        const tieneAudio = isPersonalizado && Boolean(customDataUrl);

        return (
          <div key={sound.id}>
            <div
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              onClick={() => {
                // Si es personalizado y no hay archivo, abrir el selector.
                if (isPersonalizado && !tieneAudio) {
                  fileInputRef.current?.click();
                } else {
                  setSoundId(sound.id);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  if (isPersonalizado && !tieneAudio) {
                    fileInputRef.current?.click();
                  } else {
                    setSoundId(sound.id);
                  }
                }
              }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-all",
                isSelected
                  ? "border-brand bg-brand-tint text-brand-text shadow-sm"
                  : "border-border bg-background hover:border-border-strong hover:bg-subtle"
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    isSelected ? "bg-brand text-brand-fg" : "bg-secondary text-text-2"
                  )}
                >
                  {sound.src || tieneAudio ? (
                    <Volume2 className="h-4 w-4" strokeWidth={1.7} />
                  ) : (
                    <VolumeX className="h-4 w-4" strokeWidth={1.7} />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{sound.label}</p>
                  {sound.id === "campanilla" && (
                    <p className="text-xs text-text-3">Predeterminado</p>
                  )}
                  {isPersonalizado && (
                    <p className="truncate text-xs text-text-3">
                      {customFileName ?? "Ningún archivo cargado"}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* Botón Play para sonidos con src o con Data URL guardado */}
                {(sound.src || tieneAudio) && (
                  <button
                    type="button"
                    aria-label={`Previsualizar ${sound.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(sound.id);
                    }}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
                      previewing === sound.id
                        ? "bg-brand text-brand-fg"
                        : "bg-secondary text-text-2 hover:bg-brand-tint hover:text-brand-text"
                    )}
                  >
                    <Play className="h-3.5 w-3.5 fill-current" strokeWidth={0} />
                  </button>
                )}
                <div
                  className={cn(
                    "h-4 w-4 rounded-full border-2 transition-all",
                    isSelected
                      ? "border-brand bg-brand"
                      : "border-border-strong bg-background"
                  )}
                />
              </div>
            </div>

            {/* v2.7.6 — Acciones del audio personalizado */}
            {isPersonalizado && (
              <div className="mt-2 flex flex-wrap items-center gap-2 pl-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-text-2 transition-colors hover:border-brand hover:text-brand-text"
                >
                  <Upload className="h-3.5 w-3.5" strokeWidth={1.7} />
                  Subir audio...
                </button>
                {tieneAudio && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearCustom();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-text-2 transition-colors hover:border-danger-text hover:text-danger-text"
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                    Quitar
                  </button>
                )}
                <span className="text-[11px] text-text-3">Máx. 2 MB · mp3, wav, ogg, m4a</span>
              </div>
            )}

            {/* Input file oculto para el sonido personalizado */}
            {isPersonalizado && (
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.ogg,.m4a"
                className="hidden"
                onChange={handleFileChange}
              />
            )}

            {/* Mensaje de error de carga */}
            {isPersonalizado && uploadError && (
              <p className="mt-2 text-xs text-danger-text">{uploadError}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
