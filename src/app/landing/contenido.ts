/**
 * Tarea 3 (rebranding a jombe.app) — Contenido y enlaces de la landing.
 *
 * `URL_APP` es la única puerta a `crm.jombe.app` desde la landing: en
 * desarrollo cae a `/app` (la ruta local del CRM, sin host separado) para que
 * los enlaces del header y del footer sigan funcionando sin DNS ni hosts
 * locales configurados. En producción, `NEXT_PUBLIC_APP_URL` la fija; si
 * falta, `https://crm.jombe.app` es el valor conocido del dominio real.
 */
export const URL_APP =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.NODE_ENV === "production" ? "https://crm.jombe.app" : "");

export const PRODUCTO = "CRM de WhatsApp open source y self-hosted";

export const LANDING_NAV: ReadonlyArray<{ href: string; label: string }> = [
    { href: "/features", label: "Funciones" },
    { href: "/precios", label: "Precios" },
    { href: "/blog", label: "Blog" },
    { href: "/legal", label: "Legal" },
];

export const CTAS = {
    entrar: { href: "/login", label: "Entrar" },
    probar: { href: "/register", label: "Empezar gratis" },
} as const;

export const CARACTERISTICAS: ReadonlyArray<{
    titulo: string;
    texto: string;
}> = [
        {
            titulo: "Bandeja en tiempo real",
            texto:
                "Una conversación de WhatsApp por tarjeta, con eventos en vivo y sin colas: lo que entra se ve al instante.",
        },
        {
            titulo: "Pipeline kanban",
            texto:
                "Mueve cada lead por sus etapas, con bitácora e historial completo de cada cambio.",
        },
        {
            titulo: "Tu agente al lado",
            texto:
                "Conecta el cerebro de IA que prefieras por un contrato abierto (`/api/bot/*`); sin él, sigue siendo un CRM de bandeja manual.",
        },
        {
            titulo: "Laboratorio de auto-evaluación",
            texto:
                "Clientes simulados ponen a prueba a tu agente, con un juez que lo evalúa antes de que hable con alguien real.",
        },
        {
            titulo: "100% self-hosted",
            texto:
                "Tu instancia, tu base de datos, tus credenciales. Ningún dato de tus clientes sale de tu servidor.",
        },
        {
            titulo: "Open source (MIT)",
            texto:
                "Código auditable y sin ataduras: lo instalas, lo modificas y lo mantienes tú.",
        },
    ];
