import type { Metadata } from "next";
import { CARACTERISTICAS } from "../contenido";
import styles from "../landing.module.css";

export const metadata: Metadata = {
    title: "Funciones",
    description: "Todo lo que trae Jombe CRM: bandeja, pipeline, agente de IA y Laboratorio.",
};

export default function FeaturesPage() {
    return (
        <section className="mx-auto max-w-5xl px-5 py-24">
            <h1 className="text-3xl font-semibold sm:text-4xl">Funciones</h1>
            <p className="mt-3 max-w-2xl text-sm" style={{ color: "var(--l-text-2)" }}>
                Un CRM completo de WhatsApp, pensado para instalarse una sola vez y
                crecer con tu negocio.
            </p>
            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {CARACTERISTICAS.map((item) => (
                    <div key={item.titulo} className={`${styles.glass} rounded-2xl p-6`}>
                        <h2 className="text-base font-semibold">{item.titulo}</h2>
                        <p className="mt-2 text-sm" style={{ color: "var(--l-text-2)" }}>
                            {item.texto}
                        </p>
                    </div>
                ))}
            </div>
        </section>
    );
}
