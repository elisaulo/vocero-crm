/**
 * Marca del CRM.
 *
 * El logo de Jombe es una imagen estática e inmutable generada a partir del
 * logo oficial (scripts/gen-jombe-assets.mjs): nunca se dibuja con SVG a mano
 * ni se renderiza el nombre como texto HTML.
 */
export const JOMBE_LOGO_FULL = "/jombe-logo-full.png";
export const JOMBE_ICON = "/jombe-icon-192.png";
export const JOMBE_ICON_512 = "/jombe-icon-512.png";
export const JOMBE_ICON_32 = "/jombe-icon-32.png";

export const BRAND_MARK_BODY = "M2.5 4C4.5 9.5 7.5 16.5 11 19.2C12.5 20.3 12 20 12 20";
export const BRAND_MARK_TAIL = "M12 20C12 20 13.5 17.5 16 13.5C18 10 19.5 7 20 5.5M17.5 8.5C18 7.2 18.8 6.5 19.5 7.1C20.2 7.7 20.8 6.5 21.5 5.8";
export const BRAND_MARK_STROKE = 2.8;
export const BRAND_CYAN = "#00c6f5";
export const BRAND_CYAN_ON_TILE = "#3fdcff";

export function isVoceroName(name: string): boolean {
  return name.trim().toLowerCase() === "vocero";
}

export function isJombeName(name: string): boolean {
  return name.trim().toLowerCase() === "jombe";
}
