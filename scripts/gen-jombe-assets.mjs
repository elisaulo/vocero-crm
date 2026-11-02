#!/usr/bin/env node
/**
 * Genera los activos estáticos del logo Jombe a partir de la imagen oficial
 * `public/jombe-logo.jpg` (1024×338). Recorta los PÍXELES REALES de la imagen
 * (nada de redibujar a mano) y quita el fondo azul marino (#0e151f) con un
 * recorte por distancia de color, con des-franqueo (defringe) para que no
 * quede halo oscuro sobre fondos claros.
 *
 * Salidas en public/:
 *  - jombe-logo-full.png / .webp  → logo horizontal completo (isotipo + wordmark)
 *  - jombe-icon-512.png / -192.png / -32.png → solo el isotipo
 *  - favicon.ico → PNG de 32 dentro de un contenedor ICO
 *
 * Ejecutar: node scripts/gen-jombe-assets.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const origen = join(raiz, "public", "jombe-logo.jpg");

// Geometría medida sobre los píxeles reales (scripts/_logo-analyze.mjs):
// tinta total x148–870 / y53–277; isotipo x148–327; wordmark x359–867.
const TINTA = { x: 148, y: 53, w: 723, h: 225 };
const ISOTIPO = { x: 148, y: 53, w: 180, h: 225 };
const MARGEN = 8;

// Fondo medido: rgb(14,21,31). Umbrales de distancia (0–441).
const FONDO = { r: 14, g: 21, b: 31 };
const T0 = 22; // por debajo: transparente total
const T1 = 64; // por encima: opaco total

/** Quita el fondo y des-franquea los bordes (un-premultiplicar contra el fondo). */
function sinFondo(data, width, height, channels) {
    const out = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        const s = i * channels;
        const r = data[s], g = data[s + 1], b = data[s + 2];
        const d = Math.sqrt(
            (r - FONDO.r) ** 2 + (g - FONDO.g) ** 2 + (b - FONDO.b) ** 2
        );
        let a;
        if (d <= T0) a = 0;
        else if (d >= T1) a = 255;
        else a = Math.round(((d - T0) / (T1 - T0)) * 255);
        let or_ = r, og = g, ob = b;
        if (a > 0 && a < 255) {
            // El píxel es una mezcla de tinta y fondo: recupera la tinta.
            const al = a / 255;
            or_ = Math.min(255, Math.max(0, Math.round((r - FONDO.r * (1 - al)) / al)));
            og = Math.min(255, Math.max(0, Math.round((g - FONDO.g * (1 - al)) / al)));
            ob = Math.min(255, Math.max(0, Math.round((b - FONDO.b * (1 - al)) / al)));
        }
        const o = i * 4;
        out[o] = or_; out[o + 1] = og; out[o + 2] = ob; out[o + 3] = a;
    }
    return out;
}

async function main() {
    const { data, info } = await sharp(origen).raw().toBuffer({ resolveWithObject: true });
    const limpio = sinFondo(data, info.width, info.height, info.channels);

    // 1) Logo horizontal completo, con margen.
    const fx = TINTA.x - MARGEN, fy = TINTA.y - MARGEN;
    const fw = TINTA.w + MARGEN * 2, fh = TINTA.h + MARGEN * 2;
    const fullPng = await sharp(limpio, { raw: { width: info.width, height: info.height, channels: 4 } })
        .extract({ left: fx, top: fy, width: fw, height: fh })
        .png()
        .toBuffer();
    await sharp(fullPng).toFile(join(raiz, "public", "jombe-logo-full.png"));
    await sharp(fullPng).webp({ quality: 92 }).toFile(join(raiz, "public", "jombe-logo-full.webp"));
    console.log(`✅ public/jombe-logo-full.png + .webp (${fw}×${fh})`);

    // 2) Isotipo solo, cuadrado con el dibujo contenido (fondo transparente).
    const ix = ISOTIPO.x - MARGEN, iy = ISOTIPO.y - MARGEN;
    const iw = ISOTIPO.w + MARGEN * 2, ih = ISOTIPO.h + MARGEN * 2;
    const isoBase = await sharp(limpio, { raw: { width: info.width, height: info.height, channels: 4 } })
        .extract({ left: ix, top: iy, width: iw, height: ih })
        .png()
        .toBuffer();
    for (const size of [512, 192, 32]) {
        await sharp(isoBase)
            .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toFile(join(raiz, "public", `jombe-icon-${size}.png`));
        console.log(`✅ public/jombe-icon-${size}.png`);
    }

    // 3) favicon.ico: PNG de 32 dentro de un contenedor ICO válido.
    const png32 = readFileSync(join(raiz, "public", "jombe-icon-32.png"));
    const ico = Buffer.alloc(6 + 16 + png32.length);
    ico.writeUInt16LE(0, 0); // reservado
    ico.writeUInt16LE(1, 2); // tipo ICO
    ico.writeUInt16LE(1, 4); // 1 imagen
    ico[6] = 32; ico[7] = 32; // ancho/alto
    ico[8] = 0; ico[9] = 0; // colores
    ico[10] = 0; ico[11] = 0;
    ico.writeUInt16LE(1, 12); // planos
    ico.writeUInt16LE(32, 14); // bpp
    ico.writeUInt32LE(png32.length, 18);
    ico.writeUInt32LE(22, 22); // offset del PNG
    png32.copy(ico, 22);
    writeFileSync(join(raiz, "public", "favicon.ico"), ico);
    console.log("✅ public/favicon.ico (PNG 32×32 en ICO)");
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
