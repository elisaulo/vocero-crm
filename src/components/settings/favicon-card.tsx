"use client";

import { JOMBE_LOGO_FULL } from "@/lib/brand";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function FaviconCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo del negocio</CardTitle>
        <CardDescription>
          El logo de Jombe es una imagen oficial fija. No se genera ni se cambia desde aquí.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border bg-subtle p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={JOMBE_LOGO_FULL}
            alt="Logo de Jombe"
            className="mx-auto h-16 w-auto object-contain"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Fijo para todas las cuentas. El nombre, el favicon y el icono de la app se derivan de
          esta imagen y no se editan.
        </p>
      </CardContent>
    </Card>
  );
}
