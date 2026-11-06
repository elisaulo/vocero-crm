import type { Metadata } from "next";
import { CARACTERISTICAS, CTAS, PRODUCTO, URL_APP } from "./contenido";
import styles from "./landing.module.css";

export const metadata: Metadata = {
    title: "Jombe CRM",
    description:
        "CRM de WhatsApp open source y self-hosted: bandeja en tiempo real, pipeline kanban y un agente de IA que puedes evaluar antes de que hable con tus clientes.",
};

export default function LandingHome() {
    return (
        <>
            <section className={`${styles.aurora} relative overflow-hidden`}>
                <div className={`${styles["grid-lines"]} absolute inset-0`} aria-hidden />
                <div className="relative mx-auto flex max-w-4xl flex-col items-center px-5 pb-28 pt-24 text-center sm:pt-32">
                    <span
                        className={`${styles.glass} mb-7 rounded-full px-4 py-1.5 text-xs font-medium`}
                        style={{ color: "var(--l-text-2)" }}
                    >
                        Open source · MIT · self-hosted
                    </span>
                    <h1
                        className={`${styles["gradient-ink"]} text-4xl font-semibold leading-tight tracking-tight sm:text-6xl`}
                    >
                        El CRM de WhatsApp que instalas en tu propio servidor
                    </h1>
                    <p
                        className="mt-6 max-w-2xl text-balance text-base sm:text-lg"
                        style={{ color: "var(--l-text-2)" }}
                    >
                        {PRODUCTO}: bandeja en tiempo real, pipeline kanban, el perfil de tu
                        agente y un Laboratorio donde lo pones a prueba antes de hablar con
                        clientes reales.
                    </p>
                    <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
                        <a
                            href={URL_APP + CTAS.probar.href}
                            className="rounded-xl px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                            style={{ background: "var(--l-emerald)", color: "var(--l-emerald-ink)" }}
                        >
                            {CTAS.probar.label}
                        </a>
                        <a
                            href={URL_APP + CTAS.entrar.href}
                            className={`${styles.glass} ${styles["glass-hover"]} rounded-xl px-6 py-3 text-sm font-semibold`}
                        >
                            {CTAS.entrar.label}
                        </a>
                    </div>
                </div>
            </section>

            <section className="mx-auto max-w-6xl px-5 pb-28">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {CARACTERISTICAS.map((item) => (
                        <div
                            key={item.titulo}
                            className={`${styles.glass} ${styles["glass-hover"]} rounded-2xl p-6`}
                        >
                            <h3 className="text-base font-semibold" style={{ color: "var(--l-text)" }}>
                                {item.titulo}
                            </h3>
                            <p className="mt-2 text-sm" style={{ color: "var(--l-text-2)" }}>
                                {item.texto}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            <section className="mx-auto max-w-3xl px-5 pb-28 text-center">
                <div className={`${styles.glass} rounded-3xl px-8 py-14`}>
                    <h2 className="text-2xl font-semibold sm:text-3xl">
                        Empieza con tu negocio en minutos
                    </h2>
                    <p className="mx-auto mt-3 max-w-lg text-sm" style={{ color: "var(--l-text-2)" }}>
                        Crea tu organización, conecta tu número de WhatsApp y ten tu
                        bandeja lista hoy mismo.
                    </p>
                    <a
                        href={URL_APP + CTAS.probar.href}
                        className="mt-7 inline-block rounded-xl px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                        style={{ background: "var(--l-emerald)", color: "var(--l-emerald-ink)" }}
                    >
                        {CTAS.probar.label}
                    </a>
                </div>
            </section>
        </>
    );
}
