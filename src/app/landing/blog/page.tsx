import type { Metadata } from "next";
import styles from "../landing.module.css";

export const metadata: Metadata = {
    title: "Blog",
    description: "Novedades y notas de versión de Jombe CRM.",
};

export default function BlogPage() {
    return (
        <section className="mx-auto max-w-3xl px-5 py-24">
            <h1 className="text-3xl font-semibold sm:text-4xl">Blog</h1>
            <p className="mt-4 text-sm" style={{ color: "var(--l-text-2)" }}>
                Pronto vas a encontrar aquí las novedades del proyecto. Mientras tanto,
                el historial completo de versiones vive en el{" "}
                <a
                    href="https://github.com/elisaulo/jombe-crm/blob/main/CHANGELOG.md"
                    className="underline"
                    target="_blank"
                    rel="noreferrer"
                >
                    CHANGELOG
                </a>
                .
            </p>
            <div className={`${styles.glass} mt-10 rounded-2xl p-6 text-sm`} style={{ color: "var(--l-text-3)" }}>
                Todavía no hay entradas publicadas.
            </div>
        </section>
    );
}
