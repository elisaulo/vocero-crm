import { Suspense } from "react";
import { MercadolibreClient } from "@/components/settings/mercadolibre-client";

export const dynamic = "force-dynamic";

export default function MercadolibreSettingsPage() {
    return (
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
            <MercadolibreClient />
        </Suspense>
    );
}
