/**
 * La marca Vocero — la misma de vocerocrm.com.
 *
 * Vive aquí, sin React, porque la usan dos mundos: los componentes (el trazo
 * del panel lateral y del login) y el servidor (el favicon generado que se
 * sirve como texto). Tener el dibujo en un solo sitio es lo que garantiza que
 * la pestaña y la barra lateral enseñen la MISMA "v".
 *
 * El trazo es una "v" caligráfica fluida con remate cian. El cuerpo se pinta
 * con `currentColor` (así hereda el acento white-label); el remate es una
 * constante de marca y NO se recalcula con el acento: es lo que la hace
 * reconocible.
 */

/** Brazo izquierdo de la V + base central: se pinta con el color del contexto. */
export const BRAND_MARK_BODY =
  "M2.5 4C4.5 9.5 7.5 16.5 11 19.2C12.5 20.3 12 20 12 20";

/** Brazo derecho de la V + onda de voz: siempre en degradado cian/azul. */
export const BRAND_MARK_TAIL =
  "M12 20C12 20 13.5 17.5 16 13.5C18 10 19.5 7 20 5.5M17.5 8.5C18 7.2 18.8 6.5 19.5 7.1C20.2 7.7 20.8 6.5 21.5 5.8";

export const BRAND_MARK_STROKE = 2.8;

/** Cian sobre fondos claros (texto azul al lado). */
export const BRAND_CYAN = "#00c6f5";

/** Cian sobre el mosaico azul: un punto más claro para que no se hunda. */
export const BRAND_CYAN_ON_TILE = "#3fdcff";

/**
 * ¿Esta instancia se llama Vocero? Solo entonces se dibuja el logo: una
 * agencia que rebautizó el CRM para su cliente no debe ver la "v" de otro
 * producto en su barra lateral ni en su pestaña. El nombre por defecto es
 * "Vocero", así que una instancia sin configurar la ve de inmediato.
 */
export function isVoceroName(name: string): boolean {
  return name.trim().toLowerCase() === "vocero";
}
