#!/usr/bin/env node
/**
 * Rasterize the master SVG icons into the PNGs the PWA manifest + iOS
 * home-screen want. Run by hand when the icon changes:
 *
 *   node scripts/build-icons.mjs
 *
 * Output:
 *   public/icon-192.png            — manifest 192×192
 *   public/icon-512.png            — manifest 512×512
 *   public/icon-maskable-512.png   — manifest 512×512, purpose=maskable
 *   public/apple-touch-icon.png    — iOS Add-to-Home, 180×180, opaque
 *
 * The SVG is the source of truth (vector, scaleable, theme-tweakable);
 * these PNGs are committed so the runtime never needs sharp at boot for
 * static asset serving.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "..", "public");

const STANDARD_SVG = await fs.readFile(path.join(PUBLIC, "icon.svg"));
const MASKABLE_SVG = await fs.readFile(path.join(PUBLIC, "icon-maskable.svg"));

async function render(svg, size, outName) {
  const out = path.join(PUBLIC, outName);
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(out);
  const stat = await fs.stat(out);
  console.log(`  ${outName} → ${(stat.size / 1024).toFixed(1)} KB`);
}

console.log("Rendering PWA / favicon PNGs from icon.svg…");
await render(STANDARD_SVG, 192, "icon-192.png");
await render(STANDARD_SVG, 512, "icon-512.png");
await render(MASKABLE_SVG, 512, "icon-maskable-512.png");
await render(STANDARD_SVG, 180, "apple-touch-icon.png");
console.log("Done.");
