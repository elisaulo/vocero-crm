import { Bell, Smartphone } from "lucide-react";
import { NotificationSoundPicker } from "@/components/settings/notification-sound-picker";

export default function PreferenciasPage() {
  return (
    <div className="mx-auto max-w-xl space-y-10 p-6">

      {/* ── Sonido de notificación ── */}
      <section>
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
            <Bell className="h-5 w-5" strokeWidth={1.7} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Sonido de notificación
            </h2>
            <p className="mt-0.5 text-sm text-text-2">
              Se reproduce cada vez que llega un mensaje nuevo de un cliente.
              La preferencia se guarda en este dispositivo.
            </p>
          </div>
        </div>
        <NotificationSoundPicker />
      </section>

      {/* ── Instalar como app ── */}
      <section>
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
            <Smartphone className="h-5 w-5" strokeWidth={1.7} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Instalar como aplicación
            </h2>
            <p className="mt-0.5 text-sm text-text-2">
              Puedes instalar el CRM como una app en tu computadora o
              Android para abrirla sin el navegador.
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-subtle p-4 text-sm text-text-2 space-y-2">
          <p>
            <span className="font-semibold text-foreground">En Chrome o Edge (PC):</span>{" "}
            haz clic en el ícono de instalación{" "}
            <span className="rounded bg-background px-1.5 py-0.5 font-mono text-xs border border-border">⊕</span>{" "}
            en la barra de direcciones, luego en «Instalar».
          </p>
          <p>
            <span className="font-semibold text-foreground">En Android (Chrome):</span>{" "}
            toca el menú{" "}
            <span className="rounded bg-background px-1.5 py-0.5 font-mono text-xs border border-border">⋮</span>{" "}
            y selecciona «Agregar a pantalla de inicio».
          </p>
          <p className="text-xs text-text-3 pt-1">
            Una vez instalada, se abre como ventana independiente y aparece en
            el lanzador de aplicaciones.
          </p>
        </div>
      </section>

    </div>
  );
}
