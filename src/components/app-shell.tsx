"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { Branding } from "@/lib/branding";
import type { Apariencia } from "@/lib/temas";
import type { ResolvedCommit } from "@/lib/version";
import { AppNav } from "@/components/app-nav";
import { BrandLogo } from "@/components/brand-mark";
import { cn } from "@/lib/utils";
import { BandaSinConexion } from "@/components/banda-sin-conexion";
import { AtajosGlobales } from "@/components/atajos-globales";

/**
 * Cascarón de la app en dos modos:
 *
 * - Escritorio (lg+): el panel lateral es una columna sticky con h-dvh.
 *   El usuario puede colapsarlo/expandirlo con el botón de toggle (estado
 *   persistido en localStorage para sobrevivir navegaciones).
 * - Móvil/tableta: el lateral sale de la izquierda como cajón sobre un velo,
 *   y arriba queda una barra azul marino con el hamburguesa y la marca. El
 *   cajón se cierra solo al navegar (el `pathname` cambia) y con Escape.
 *
 * La altura usa `100dvh` (no `100vh`) porque en el navegador móvil la barra de
 * direcciones se encoge al hacer scroll: con `vh` el compositor de la Bandeja
 * queda debajo del borde visible.
 *
 * El scroll global está bloqueado en html+body (layout.tsx). El único elemento
 * que hace scroll vertical es el <main> de aquí abajo (overflow-y-auto).
 */
export function AppShell({
  branding,
  userName,
  role,
  apariencia,
  commit,
  agenda = false,
  kicker,
  aviso = null,
  children,
}: {
  branding: Branding;
  userName: string;
  role: string;
  apariencia: Apariencia;
  /** Commit resuelto en el servidor, con su procedencia (ver `resolveCommit`). */
  commit?: ResolvedCommit;
  /** 015 — ¿esta instancia tiene agenda? Lo decide el servidor. */
  agenda?: boolean;
  /** 028 — La etiqueta bajo el logo (`navKicker`). */
  kicker?: string;
  /**
   * Franja de aviso por encima de TODA la aplicación (#85).
   *
   * Va aquí y no dentro de una pantalla porque lo que anuncia no es de una
   * pantalla: es que el agente no puede contestar. Quien tiene ese problema
   * no está mirando Ajustes, está mirando su bandeja y preguntándose por qué
   * no responde nadie.
   */
  aviso?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const esBandeja = pathname === "/inbox" || pathname.startsWith("/inbox/");
  const [navOpen, setNavOpen] = useState(false);

  // Estado del sidebar colapsado en desktop: se persiste en localStorage para
  // que sobreviva navegaciones y recargas. Inicial false (expandido).
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Hidratación del estado desde localStorage (solo en cliente).
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sidebar-collapsed");
      if (saved === "true") setSidebarCollapsed(true);
    } catch {}
  }, []);

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("sidebar-collapsed", String(next));
      } catch {}
      return next;
    });
  }

  // Navegar = cerrar el cajón móvil. Sin esto, tocar «Pipeline» deja el velo
  // encima de la pantalla recién cargada.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navOpen]);

  return (
    // 061 · D1 — El marco: en escritorio la app son tarjetas separadas sobre
    // un fondo suave; en el teléfono la pantalla entera es la tarjeta.
    <div className="app-marco app-escala flex overflow-hidden lg:gap-[var(--hueco)] lg:p-[var(--hueco)]">
      {navOpen && (
        <button
          aria-label="Cerrar el menú"
          tabIndex={-1}
          onClick={() => setNavOpen(false)}
          className="fixed inset-0 z-40 bg-overlay lg:hidden"
        />
      )}

      <AppNav
        branding={branding}
        commit={commit}
        userName={userName}
        role={role}
        apariencia={apariencia}
        agenda={agenda}
        kicker={kicker}
        open={navOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setNavOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior: en móvil es la tira azul marino con hamburguesa.
            En desktop muestra el botón de colapso del sidebar. */}
        <header className="nav-dark flex h-12 shrink-0 items-center gap-1.5 border-b bg-subtle px-2 text-foreground lg:bg-transparent lg:border-transparent lg:text-current">
          {/* Hamburguesa — solo móvil */}
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Abrir el menú"
            aria-expanded={navOpen}
            className="rounded-md p-2 text-text-2 hover:bg-accent hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" strokeWidth={1.8} />
          </button>

          {/* Logo móvil */}
          <BrandLogo branding={branding} className="min-w-0 lg:hidden" />

          {/* Toggle colapso — solo desktop */}
          <button
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? "Expandir el menú lateral" : "Colapsar el menú lateral"}
            title={sidebarCollapsed ? "Expandir el menú lateral" : "Colapsar el menú lateral"}
            className="hidden rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground lg:flex"
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" strokeWidth={1.8} />
            ) : (
              <PanelLeftClose className="h-5 w-5" strokeWidth={1.8} />
            )}
          </button>
        </header>

        {aviso}
        {/* 056 — El tiempo real caído se ve desde cualquier pantalla. */}
        <BandaSinConexion />
        {/* 055 — Ctrl+K y «?» desde cualquier pantalla. */}
        <AtajosGlobales agenda={agenda} role={role} />

        {/* main es el único elemento autorizado a hacer scroll vertical.
            El html+body y el AppShell tienen overflow-hidden para bloquear
            cualquier scroll global que desplacería el sidebar. */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
