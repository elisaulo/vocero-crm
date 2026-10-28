"use client";

import { useState } from "react";
import { Volume2, VolumeX, Play } from "lucide-react";
import {
  NOTIFICATION_SOUNDS,
  type NotificationSoundId,
} from "@/lib/notification-sound";
import { useNotificationSound } from "@/components/use-notification-sound";
import { cn } from "@/lib/utils";

export function NotificationSoundPicker() {
  const { soundId, setSoundId, preview } = useNotificationSound();
  const [previewing, setPreviewing] = useState<NotificationSoundId | null>(null);

  function handlePreview(id: NotificationSoundId) {
    setPreviewing(id);
    preview(id);
    setTimeout(() => setPreviewing(null), 900);
  }

  return (
    <div className="space-y-3">
      {NOTIFICATION_SOUNDS.map((sound) => {
        const isSelected = soundId === sound.id;
        return (
          <div
            key={sound.id}
            role="radio"
            aria-checked={isSelected}
            tabIndex={0}
            onClick={() => setSoundId(sound.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSoundId(sound.id);
              }
            }}
            className={cn(
              "flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition-all",
              isSelected
                ? "border-brand bg-brand-tint text-brand-text shadow-sm"
                : "border-border bg-background hover:border-border-strong hover:bg-subtle"
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  isSelected ? "bg-brand text-brand-fg" : "bg-secondary text-text-2"
                )}
              >
                {sound.src ? (
                  <Volume2 className="h-4 w-4" strokeWidth={1.7} />
                ) : (
                  <VolumeX className="h-4 w-4" strokeWidth={1.7} />
                )}
              </div>
              <div>
                <p className="text-sm font-medium">{sound.label}</p>
                {sound.id === "campanilla" && (
                  <p className="text-xs text-text-3">Predeterminado</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {sound.src && (
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
        );
      })}
    </div>
  );
}
