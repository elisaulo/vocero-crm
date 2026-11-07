/**
 * 2.8.0 — Migración liviana de localStorage y cookies del rebranding Vocero → Jombe.
 *
 * SSR-safe: todo envuelto en `typeof window !== 'undefined'`. Se ejecuta una
 * vez por llave al primer acceso, migra el valor si existe y borra la antigua.
 * No lanza: un valor corrupto o ausente simplemente no migra nada.
 *
 * Vida útil: esta lógica se elimina en v2.9 (TODO en cada función).
 */

const migrated = new Set<string>();

/**
 * Migra una llave de localStorage de `vocero.*` → `jombe.*`.
 * Llamar ANTES de leer la llave nueva.
 */
export function migrateLocalStorageKey(oldKey: string, newKey: string): void {
    // TODO: remove in v2.9
    if (typeof window === "undefined") return;
    if (migrated.has(newKey)) return;
    migrated.add(newKey);
    try {
        const old = localStorage.getItem(oldKey);
        if (old !== null) {
            localStorage.setItem(newKey, old);
            localStorage.removeItem(oldKey);
        }
    } catch {
        // localStorage bloqueado o corrupto: no migra, no lanza
    }
}

/**
 * Migra una cookie de `vocero-*` → `jombe-*`.
 * Llamar ANTES de leer la cookie nueva. Lee del `document.cookie` crudo,
 * migra con `document.cookie = ...` (sin Path ni opciones: hereda las de
 * la antigua) y borra la antigua fijando Max-Age=0.
 */
export function migrateCookie(oldName: string, newName: string): void {
    // TODO: remove in v2.9
    if (typeof window === "undefined") return;
    if (migrated.has(`cookie:${newName}`)) return;
    migrated.add(`cookie:${newName}`);
    try {
        const cookies = document.cookie.split("; ");
        const old = cookies.find((c) => c.startsWith(`${oldName}=`));
        if (old) {
            const value = old.substring(oldName.length + 1);
            // Escribe la nueva con el valor migrado (sin opciones: hereda Path=/ implícito)
            document.cookie = `${newName}=${value}; Max-Age=${60 * 60 * 24 * 365}`;
            // Borra la antigua
            document.cookie = `${oldName}=; Max-Age=0; Path=/`;
        }
    } catch {
        // document.cookie bloqueado: no migra, no lanza
    }
}
