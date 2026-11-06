import type { Metadata } from "next";
import styles from "../landing.module.css";

export const metadata: Metadata = {
    title: "Legal",
    description: "Licencia y términos de Jombe CRM.",
};

export default function LegalPage() {
    return (
        <section className="mx-auto max-w-2xl px-5 py-24">
            <h1 className="text-3xl font-semibold sm:text-4xl">Legal</h1>
            <div className={`${styles.glass} mt-8 space-y-5 rounded-2xl p-7 text-sm`} style={{ color: "var(--l-text-2)" }}>
                <p>
                    Jombe CRM es software de código abierto distribuido bajo la{" "}
                    <a
                        href="https://github.com/elisaulo/jombe-crm/blob/main/LICENSE"
                        className="underline"
                        target="_blank"
                        rel="noreferrer"
                    >
                        licencia MIT
                    </a>
                    . Puedes usarlo, modificarlo y distribuirlo libremente, sin garantía
                    de ningún tipo.
                </p>
                <p>
                    Cada instalación de Jombe es independiente y self-hosted: los datos
                    de tu negocio (conversaciones, contactos, credenciales) quedan en tu
                    propio servidor y bajo tu propia responsabilidad como operador.
                </p>
                <p>
                    El uso de WhatsApp Cloud API está sujeto a los términos de Meta
                    Platforms, Inc. El uso de cualquier proveedor de IA que conectes
                    está sujeto a los términos de ese proveedor.
                </p>
            </div>
        </section>
    );
}
