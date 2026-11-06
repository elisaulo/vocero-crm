import type { Metadata } from "next";
import { CTAS, URL_APP } from "../contenido";
import styles from "../landing.module.css";

export const metadata: Metadata = {
    title: "Precios",
    description: "Jombe CRM es open source (MIT): se instala en tu propio servidor, sin cuota de licencia.",
};

export default function PreciosPage() {
    return (
        <section className="mx-auto max-w-3xl px-5 py-24 text-center">
            <h1 className="text-3xl font-semibold sm:text-4xl">Precios</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm" style={{ color: "var(--l-text-2)" }}>
                Jombe es código abierto bajo licencia MIT. No hay cuota de licencia: tú
                pones el servidor y los servicios que uses (WhatsApp Cloud API, el
                proveedor de IA que elijas). El costo es el de tu propia infraestructura.
            </p>
            <div className={`${styles.glass} mx-auto mt-10 max-w-sm rounded-2xl p-8`}>
                <p className="text-sm font-medium" style={{ color: "var(--l-text-2)" }}>
                    Self-hosted
                </p>
                <p className="mt-2 text-4xl font-semibold">$0</p>
                <p className="mt-1 text-sm" style={{ color: "var(--l-text-3)" }}>
                    de licencia, para siempre
                </p>
                <a
                    href={URL_APP + CTAS.probar.href}
                    className="mt-7 inline-block w-full rounded-xl px-6 py-3 text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{ background: "var(--l-emerald)", color: "var(--l-emerald-ink)" }}
                >
                    {CTAS.probar.label}
                </a>
            </div>
        </section>
    );
}
