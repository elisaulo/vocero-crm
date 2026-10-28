"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSavedSoundId,
  saveSoundId,
  NOTIFICATION_SOUNDS,
  DEFAULT_SOUND_ID,
  type NotificationSoundId,
} from "@/lib/notification-sound";

/**
 * Gestión completa del sonido de notificación por usuario.
 *
 * Políticas de autoplay del navegador:
 * - Los navegadores bloquean el audio hasta que el usuario ha interactuado
 *   con la página (click, keydown, etc.).
 * - Registramos la primera interacción en `unlockedRef` para saber si podemos
 *   reproducir. Si no está desbloqueado, el sonido se omite en silencio.
 */
export function useNotificationSound() {
  const [soundId, setSoundIdState] = useState<NotificationSoundId>(
    DEFAULT_SOUND_ID
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);

  // Hidratación: lee la preferencia guardada después del montaje (evita
  // discrepancia SSR/cliente ya que localStorage no existe en el servidor).
  useEffect(() => {
    setSoundIdState(getSavedSoundId());
  }, []);

  // Desbloqueo de audio: el primer gesto del usuario libera la política.
  useEffect(() => {
    const unlock = () => { unlockedRef.current = true; };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  /** Actualiza y persiste la preferencia de sonido. */
  const setSoundId = useCallback((id: NotificationSoundId) => {
    setSoundIdState(id);
    saveSoundId(id);
  }, []);

  /**
   * Reproduce una vista previa del sonido seleccionado (o el dado).
   * Útil para el selector en Ajustes.
   */
  const preview = useCallback(
    (id?: NotificationSoundId) => {
      const target = id ?? soundId;
      const sound = NOTIFICATION_SOUNDS.find((s) => s.id === target);
      if (!sound?.src) return;
      // Para la previsualización forzamos aunque no haya interacción previa
      // porque el usuario acaba de hacer click en «Previsualizar».
      const audio = new Audio(sound.src);
      audio.volume = 0.7;
      audio.play().catch(() => {});
    },
    [soundId]
  );

  /**
   * Dispara el sonido de notificación al llegar un mensaje nuevo.
   * Respeta la política de autoplay: si el usuario no ha interactuado aún,
   * no hace nada (sin error, sin log).
   */
  const playNotification = useCallback(() => {
    if (!unlockedRef.current) return;
    const sound = NOTIFICATION_SOUNDS.find((s) => s.id === soundId);
    if (!sound?.src) return;

    // Reutiliza el elemento de audio para evitar crear un nodo nuevo por
    // cada mensaje en ráfaga.
    if (!audioRef.current || audioRef.current.src !== sound.src) {
      audioRef.current = new Audio(sound.src);
      audioRef.current.volume = 0.6;
    }
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  }, [soundId]);

  return { soundId, setSoundId, preview, playNotification };
}
