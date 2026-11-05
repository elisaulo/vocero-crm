import {
  CalendarDays,
  ChartColumn,
  FlaskConical,
  Inbox,
  Kanban,
  ListChecks,
  MessageCircleQuestion,
  Package,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { canConfigure } from "@/lib/auth/roles";

/**
 * #87 — El modelo del menú, separado del componente que lo pinta.
 *
 * Qué entradas existen lo deciden dos cosas que el nav de cliente no puede
 * leer solo: las banderas de la instancia (`AGENDA`, `CHANNELS`, `ATRIBUCION`,
 * que bajan por prop desde el servidor) y el rol de quien mira. Tenerlo aquí,
 * sin React, deja que una prueba unitaria afirme qué aparece y qué no sin
 * dibujar nada.
 */

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Muestra el contador de no leídos (solo la Bandeja). */
  badge?: boolean;
};

export type NavGroup = {
  /** Encabezado pequeño; sin él, el grupo es una entrada suelta. */
  title?: string;
  items: NavItem[];
};

/** La única entrada que va abajo, separada del resto. */
export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Ajustes",
  icon: Settings,
};

/**
 * Grupos de la barra lateral, en el orden en que se leen: lo que se atiende
 * cada día, lo que configura al agente y, al final, cómo va el negocio.
 */
export function appNavGroups({
  agenda = false,
  mercadolibre = false,
  role,
}: {
  /** 015 — "Citas" solo existe si esta instancia encendió la agenda. */
  agenda?: boolean;
  /** 067/068/069 — "Preguntas", "Publicaciones" y "Tendencias" solo existen con una cuenta de Mercado Libre conectada. */
  mercadolibre?: boolean;
  /** #86 — La guía de inicio solo para quien puede configurar. */
  role?: string | null;
}): NavGroup[] {
  const trabajo: NavItem[] = [
    { href: "/inbox", label: "Bandeja", icon: Inbox, badge: true },
    { href: "/pipeline", label: "Pipeline", icon: Kanban },
    { href: "/contacts", label: "Contactos", icon: Users },
  ];
  // Citas va después de Contactos: es el paso siguiente de un trato, no una
  // sección aparte.
  if (agenda) trabajo.push({ href: "/bookings", label: "Citas", icon: CalendarDays });
  // 067 — Las preguntas de las publicaciones se atienden como la bandeja: es
  // trabajo del día, no configuración.
  if (mercadolibre) {
    trabajo.push({ href: "/preguntas", label: "Preguntas", icon: MessageCircleQuestion });
    // 068 — Las publicaciones y su stock se revisan desde aquí, junto a las
    // preguntas: es el mismo trabajo de mercado, sin entrar a Ajustes.
    trabajo.push({ href: "/publicaciones", label: "Publicaciones", icon: Package });
    // 069 — Las tendencias del sitio, con su análisis de IA, también son
    // trabajo de mercado: qué se busca y qué conviene publicar.
    trabajo.push({ href: "/tendencias", label: "Tendencias", icon: TrendingUp });
  }

  const agente: NavItem[] = [];
  // Un miembro del equipo no puede hacer ninguno de los pasos de la guía.
  if (canConfigure(role)) {
    agente.push({ href: "/onboarding", label: "Guía de inicio", icon: ListChecks });
  }
  agente.push(
    { href: "/agent", label: "Agente", icon: Sparkles },
    { href: "/lab", label: "Laboratorio", icon: FlaskConical }
  );

  return [
    { title: "Trabajo", items: trabajo },
    { title: "Agente", items: agente },
    // 019 — Se mide al final: primero se atiende y se organiza.
    { items: [{ href: "/results", label: "Resultados", icon: ChartColumn }] },
  ];
}

export type SettingsLink = { href: string; label: string };

export type SettingsSection = {
  title: string;
  links: SettingsLink[];
};

/**
 * Ajustes en tres secciones: por dónde entran los mensajes, qué hace el agente
 * con ellos y lo que es del negocio. Una pestaña por canal no escala; una
 * sección por canal, sí: cada canal nuevo cae en "Canales" sin tocar el resto.
 *
 * Instagram no tiene pantalla propia todavía: sus credenciales se guardan
 * por API (`/api/settings/instagram`). Cuando la tenga, va aquí tras
 * `CHANNELS`, igual que Messenger.
 */
export function settingsSections({
  agenda = false,
  atribucion = false,
  instagram = false,
  messenger = false,
  tiktok = false,
}: {
  agenda?: boolean;
  atribucion?: boolean;
  instagram?: boolean;
  messenger?: boolean;
  tiktok?: boolean;
}): SettingsSection[] {
  // Canales: siempre visibles — las rutas existen aunque la bandera CHANNELS
  // no esté activa. El operador puede ver la pantalla y entender qué falta.
  void instagram; void messenger; void tiktok;
  const canales: SettingsLink[] = [
    { href: "/settings/channels", label: "Estado" },
    { href: "/settings/whatsapp", label: "WhatsApp" },
    { href: "/settings/instagram", label: "Instagram" },
    { href: "/settings/messenger", label: "Messenger" },
    { href: "/settings/tiktok", label: "TikTok" },
  ];

  const agente: SettingsLink[] = [{ href: "/settings/ai", label: "IA" }];
  // Agenda: siempre visible (la ruta existe).
  void agenda;
  agente.push({ href: "/settings/calendar", label: "Agenda" });

  const negocio: SettingsLink[] = [
    { href: "/settings/branding", label: "Marca" },
    // 067 — Mercado Libre no es un canal: es la cuenta vendedora. Va en
    // "Negocio" porque de ella salen las ventas que hay que atender.
    { href: "/settings/mercadolibre", label: "Mercado Libre" },
    { href: "/settings/appearance", label: "Apariencia" },
    { href: "/settings/templates", label: "Plantillas" },
    { href: "/settings/quick-replies", label: "Respuestas rápidas" },
    { href: "/settings/team", label: "Equipo" },
    { href: "/settings/preferencias", label: "Preferencias" },
    // Anuncios: siempre visible (la ruta existe).
    { href: "/settings/ads", label: "Anuncios" },
  ];
  void atribucion;

  return [
    { title: "Canales", links: canales },
    { title: "Agente", links: agente },
    { title: "Negocio", links: negocio },
  ];
}

/** Activa si la ruta es la entrada o cuelga de ella (`/inbox/cv_123`). */
export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
