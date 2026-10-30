"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, LogOut, X } from "lucide-react";
import type { Branding } from "@/lib/branding";
import type { ThemePreference } from "@/lib/theme";
import { cn, initials } from "@/lib/utils";
import { appNavGroups, isNavActive, SETTINGS_ITEM, type NavItem } from "@/lib/nav";
import { signOut } from "@/lib/auth/client";
import { useEvents } from "@/components/use-events";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandLogo } from "@/components/brand-mark";
import {
  BUILD_COMMIT,
  UNVERIFIED_COMMIT_NOTE,
  versionLabel,
  versionTitle,
  type ResolvedCommit,
} from "@/lib/version";

/**
 * Un renglón del menú, como el `side-item` del mockup de la landing: texto
 * semibold, esquinas de 9px y, activo, lavado del acento con tinta azul.
 * Exportado para la vista previa de Configuración → Marca, que pinta la barra.
 */
export function navItemClass(active: boolean) {
  return cn(
    "flex items-center gap-[10px] rounded-sm px-2.5 py-2.5 text-[13.5px] font-semibold transition-colors lg:py-2",
    // Acento sólido: dentro de `.nav-dark` es el calculado para fondo oscuro,
    // así que contrasta con la barra (≥ 3.5:1) sea cual sea el white-label.
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "bg-brand-tint text-brand-text"
      : "text-text-2 hover:bg-accent hover:text-foreground"
  );
}

export function AppNav({
  branding,
  userName,
  role,
  theme,
  commit,
  agenda = false,
  kicker = "CRM · WhatsApp",
  open = false,
  onClose,
  collapsed = false,
}: {
  branding: Branding;
  userName: string;
  role: string;
  theme: ThemePreference;
  /**
   * Commit resuelto en el servidor. Gana al de build porque puede venir de la
   * plataforma cuando quien construyó no lo pasó como build-arg — y en ese
   * caso llega con `verified: false`, y la insignia lo dice.
   */
  commit?: ResolvedCommit;
  /** 028 — La etiqueta bajo el logo; la decide el servidor por los canales. */
  kicker?: string;
  /**
   * 015 — ¿hay agenda en esta instancia? Viene del servidor por prop y no se
   * deduce de los datos: una instancia con la agenda encendida pero sin citas
   * todavía debe ver la entrada igual.
   */
  agenda?: boolean;
  /** Solo aplica por debajo de `lg`: en escritorio el lateral es fijo. */
  open?: boolean;
  onClose?: () => void;
  /**
   * Solo desktop (lg+): cuando es `true` el sidebar se contrae a un rail
   * estrecho mostrando solo iconos. El estado lo gestiona `AppShell`.
   */
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [unread, setUnread] = useState(0);

  async function refetchUnread() {
    const res = await fetch("/api/conversations").catch(() => null);
    if (!res?.ok) return;
    const data = (await res.json()) as {
      conversations: { unreadCount: number }[];
    };
    setUnread(data.conversations.reduce((a, c) => a + c.unreadCount, 0));
  }

  useEffect(() => {
    void refetchUnread();
  }, []);

  useEvents({
    onMessageNew: () => void refetchUnread(),
    onConversationUpdated: () => void refetchUnread(),
  });

  const version = commit ?? { commit: BUILD_COMMIT, verified: BUILD_COMMIT !== "" };
  // #87 — Qué hay en el menú y en qué grupo lo decide `appNavGroups`; aquí
  // solo se pinta.
  const groups = appNavGroups({ agenda, role });

  function renderItem(item: NavItem) {
    const active = isNavActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          navItemClass(active),
          collapsed && "lg:justify-center lg:px-0"
        )}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
      >
        <item.icon
          className={cn("h-5 w-5 shrink-0", active ? "text-brand" : "text-text-3")}
          strokeWidth={1.8}
          aria-hidden
        />
        <span className={cn("flex-1", collapsed && "lg:hidden")}>{item.label}</span>
        {item.badge && unread > 0 && (
          <span
            className={cn(
              "flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1.5 text-[10.5px] font-bold text-brand-fg",
              collapsed && "lg:absolute lg:right-0.5 lg:top-0.5 lg:h-3.5 lg:min-w-[14px] lg:px-0.5 lg:text-[8px]"
            )}
          >
            {unread}
          </span>
        )}
      </Link>
    );
  }

  return (
    <aside
      // Móvil: cajón que se desliza desde la izquierda (siempre montado, así
      // la transición corre en ambos sentidos). Escritorio: columna fija.
      // `visibility` va en la transición a propósito: al cerrar mantiene el
      // cajón visible mientras se desliza y recién entonces lo oculta, que es
      // lo que lo saca del orden de tabulación en móvil.
      className={cn(
        // `text-foreground` explícito: sin él el texto sin color propio hereda
        // el color calculado en <body> con el tema de la página, no el de
        // `.nav-dark` — texto oscuro sobre fondo oscuro se pierde.
        "nav-dark fixed inset-y-0 left-0 z-50 flex shrink-0 flex-col overflow-hidden border-r bg-subtle px-3 pb-3.5 pt-4 text-foreground transition-[transform,visibility,width] duration-200",
        // Móvil: ancho completo del cajón.
        "w-[17rem]",
        // Desktop: sticky al viewport; ancho transiciona entre expandido (w-56)
        // y colapsado (w-14 — solo iconos). overflow-hidden evita barra de scroll
        // en el aside; el nav interior la absorbe si hay más items que espacio.
        "lg:static lg:sticky lg:top-0 lg:visible lg:z-auto lg:h-dvh lg:translate-x-0 lg:overflow-hidden lg:transition-[width] lg:duration-200",
        collapsed ? "lg:w-14 lg:px-1" : "lg:w-56",
        open ? "visible translate-x-0 shadow-pop" : "invisible -translate-x-full"
      )}
    >
      {/* Marca: logo o inicial white-label. En modo colapsado solo el ícono. */}
      <div className={cn("mb-4 flex items-start gap-1.5 px-2 pt-0.5", collapsed && "lg:justify-center lg:px-0")}>
        {/* En móvil el cajón necesita su propio cierre: el velo no siempre es
            alcanzable con el pulgar. */}
        <button
          onClick={onClose}
          aria-label="Cerrar el menú"
          className="-ml-1 mt-0.5 rounded-md p-1.5 text-text-3 hover:bg-accent hover:text-foreground lg:hidden"
        >
          <X className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
        {/* En modo colapsado desktop ocultamos el texto del logo */}
        <div className={cn("min-w-0", collapsed && "lg:hidden")}>
          <BrandLogo branding={branding} />
          <span className="kicker mt-2 block">{kicker}</span>
        </div>
      </div>

      {/* Grupos con encabezado pequeño, sin letras ni colapsables: se leen
          de arriba abajo como una lista de lo que hay. Un grupo sin título
          (Resultados) es una entrada suelta separada por el espacio.
          flex-1 + min-h-0 + overflow-y-auto: el nav absorbe el espacio
          disponible y hace scroll interno si los items no caben; scrollbar-none
          lo oculta visualmente (la rueda del ratón sigue funcionando). */}
      <nav
        className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Secciones"
      >
        {groups.map((group, i) => (
          <div key={group.title ?? i} className="flex flex-col gap-0.5">
            {/* En modo colapsado los títulos de grupo desaparecen */}
            {group.title && !collapsed && (
              <span className="kicker mb-1 block px-2.5" aria-hidden>
                {group.title}
              </span>
            )}
            {group.items.map(renderItem)}
          </div>
        ))}
      </nav>

      {/* Bloque inferior: Ajustes + perfil + versión.
          shrink-0 + mt-auto: siempre pegado al fondo, sin comprimirse.
          En modo colapsado solo se muestran iconos centrados. */}
      <div className="shrink-0 mt-auto pt-3 border-t border-white/10 flex flex-col gap-0">
        {renderItem(SETTINGS_ITEM)}

        <div
          className={cn(
            "mt-1 flex items-center gap-2.5 rounded-sm px-2.5 py-2 hover:bg-accent",
            collapsed && "lg:justify-center lg:px-1"
          )}
          title={collapsed ? `${userName} · ${role === "owner" ? "Propietario" : "Equipo"}` : undefined}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-text">
            {initials(userName)}
          </span>
          <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <span className="block truncate text-[13px] font-semibold">{userName}</span>
            <span className="block truncate text-[11px] text-text-3">
              {role === "owner" ? "Propietario" : "Equipo"} · En línea
            </span>
          </span>
          <ThemeToggle initial={theme} />
          <button
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
            className={cn("rounded p-1 text-text-3 hover:text-foreground", collapsed && "lg:hidden")}
            onClick={async () => {
              await signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            <LogOut className="h-4 w-4" strokeWidth={1.7} />
          </button>
        </div>

        {/* Etiqueta de versión: oculta en modo colapsado (no hay espacio). */}
        <p
          className={cn(
            "mt-1 px-2.5 pb-1 font-mono text-[10.5px] tracking-[0.06em] text-text-2",
            collapsed && "lg:hidden"
          )}
          title={versionTitle(branding.name, version)}
        >
          {versionLabel(version.commit)}
          {version.commit && !version.verified && (
            <span className="mt-0.5 flex items-center gap-1">
              <AlertTriangle
                className="h-3 w-3 shrink-0 text-warning-text"
                strokeWidth={2}
                aria-hidden
              />
              {UNVERIFIED_COMMIT_NOTE}
            </span>
          )}
        </p>
      </div>
    </aside>
  );
}
