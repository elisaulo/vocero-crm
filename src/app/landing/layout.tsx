import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { CTAS, LANDING_NAV, PRODUCTO, URL_APP } from "./contenido";
import styles from "./landing.module.css";

/**
 * Tarea 3 (rebranding a jombe.app) — La landing pública (`jombe.app` y
 * `www.jombe.app`). El middleware reescribe `/`, `/precios`, `/features`,
 * `/blog` y `/legal` a `/landing/...`, así que estas páginas son las mismas
 * para los dos hosts y no hay rutas duplicadas.
 *
 * Va siempre en oscuro, a diferencia del CRM: el §2 del plan pide Dark Mode +
 * Glassmorphism + acentos esmeralda y fucsia. Por eso no usa `data-theme` ni
 * los tokens de `globals.css`, sino los suyos (`landing.module.css`).
 *
 * El `body` del layout raíz es `h-dvh overflow-hidden` (la app no scrollea
 * fuera de sus paneles). La landing escapa de esa caja con `fixed inset-0` y
 * su propio scroll: así no hay que tocar el layout del CRM.
 */
export const metadata: Metadata = {
    // El dominio de la landing es de marca, no el de la app (`APP_BASE_URL`
    // apunta a `crm.jombe.app`): la canónica es la raíz.
    metadataBase: new URL("https://jombe.app"),
    title: {
        default: `${DEFAULT_BRANDING.name} — ${PRODUCTO}`,
        template: `%s · ${DEFAULT_BRANDING.name}`,
    },
    description:
        "CRM de WhatsApp con agente de IA, pipeline kanban y un Laboratorio que evalúa a tu agente antes de que hable con clientes reales.",
    alternates: { canonical: "/" },
    openGraph: {
        type: "website",
        url: "https://jombe.app",
        siteName: DEFAULT_BRANDING.name,
        title: `${DEFAULT_BRANDING.name} — ${PRODUCTO}`,
        description:
            "CRM de WhatsApp con agente de IA, pipeline kanban y Laboratorio de auto-evaluación.",
    },
    robots: { index: true, follow: true },
};

export default function LandingLayout({
    children,
}: Readonly<{ children: React.ReactNode }>) {
    return (
        <div
            className={`${styles.landing} fixed inset-0 overflow-y-auto overflow-x-hidden`}
            style={{ background: "var(--l-bg)", color: "var(--l-text)" }}
        >
            <header className="sticky top-0 z-20 border-b border-[color:var(--l-border)] bg-[color:var(--l-bg)]/70 backdrop-blur-xl">
                <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
                    <Link href="/" className="flex items-center gap-2.5">
                        <span
                            className="grid h-8 w-8 place-items-center rounded-lg text-sm font-semibold"
                            style={{
                                background:
                                    "linear-gradient(135deg, var(--l-emerald), var(--l-fuchsia))",
                                color: "var(--l-emerald-ink)",
                            }}
                            aria-hidden
                        >
                            {DEFAULT_BRANDING.name.slice(0, 1)}
                        </span>
                        <span className="text-[15px] font-semibold tracking-tight">
                            {DEFAULT_BRANDING.name}
                        </span>
                    </Link>

                    <nav className="hidden items-center gap-7 text-sm md:flex">
                        {LANDING_NAV.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="text-[color:var(--l-text-2)] transition-colors hover:text-[color:var(--l-text)]"
                            >
                                {item.label}
                            </Link>
                        ))}
                    </nav>

                    <div className="flex items-center gap-2">
                        <a
                            href={URL_APP + CTAS.entrar.href}
                            className="rounded-lg px-3 py-2 text-sm text-[color:var(--l-text-2)] transition-colors hover:text-[color:var(--l-text)]"
                        >
                            {CTAS.entrar.label}
                        </a>
                        <a
                            href={URL_APP + CTAS.probar.href}
                            className="rounded-lg px-3.5 py-2 text-sm font-medium transition-opacity hover:opacity-90"
                            style={{
                                background: "var(--l-emerald)",
                                color: "var(--l-emerald-ink)",
                            }}
                        >
                            {CTAS.probar.label}
                        </a>
                    </div>
                </div>
            </header>

            <main>{children}</main>

            <footer className="mt-24 border-t border-[color:var(--l-border)]">
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[color:var(--l-text-3)]">
                        {DEFAULT_BRANDING.name} — {PRODUCTO}. Código abierto (MIT), instalable
                        en tu propio servidor.
                    </p>
                    <nav className="flex flex-wrap items-center gap-5">
                        {LANDING_NAV.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="text-[color:var(--l-text-3)] transition-colors hover:text-[color:var(--l-text)]"
                            >
                                {item.label}
                            </Link>
                        ))}
                        <a
                            href={URL_APP + "/login"}
                            className="text-[color:var(--l-text-3)] transition-colors hover:text-[color:var(--l-text)]"
                        >
                            Entrar
                        </a>
                    </nav>
                </div>
            </footer>
        </div>
    );
}
