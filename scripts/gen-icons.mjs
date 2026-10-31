#!/usr/bin/env node
/**
 * Genera los activos de imagen de Vocero CRM desde SVG usando Sharp.
 * Ejecutar: node scripts/gen-icons.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Carga Sharp dinámicamente (ya es dependencia de Next.js)
let sharp;
try {
  const mod = await import("sharp");
  sharp = mod.default;
} catch {
  console.error("Sharp no encontrado. Instálalo: pnpm add -D sharp");
  process.exit(1);
}

const iconSvg = readFileSync(join(root, "public/vocero-icon.svg"));
const markSvg = readFileSync(join(root, "public/vocero-mark.svg"));

async function gen(svgBuf, outPath, size) {
  await sharp(svgBuf)
    .resize(size, size)
    .png()
    .toFile(outPath);
  console.log(`✅ ${outPath} (${size}x${size})`);
}

// Ícono de app (con fondo #0F172A)
await gen(iconSvg, join(root, "public/icons/icon-192.png"), 192);
await gen(iconSvg, join(root, "public/icons/icon-512.png"), 512);
await gen(iconSvg, join(root, "public/icons/apple-touch-icon.png"), 180);

// favicon.ico — 32x32 PNG (browsers modernos aceptan PNG como favicon)
await gen(iconSvg, join(root, "public/favicon-32.png"), 32);
await gen(iconSvg, join(root, "public/favicon-16.png"), 16);

// ICO multi-size usando el PNG de 32px (renombramos el 32px como ICO)
// Next.js sirve /favicon.ico desde public/; usamos el PNG de 32px renombrado.
const buf32 = readFileSync(join(root, "public/favicon-32.png"));
writeFileSync(join(root, "public/favicon.ico"), buf32);
console.log("✅ public/favicon.ico (32x32 PNG-in-ICO)");

console.log("\n🎉 Todos los activos generados correctamente.");
