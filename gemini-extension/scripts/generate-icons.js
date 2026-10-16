/**
 * generate-icons.js
 *
 * Generates simple PNG icon files for the extension using the Canvas API.
 * Run with: node generate-icons.js
 * Requires: npm install canvas  (or use the pre-built SVG approach below)
 *
 * This script writes icons/icon{16,32,48,128}.png
 */

const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const sizes = [16, 32, 48, 128];
const outDir = path.join(__dirname, "icons");
fs.mkdirSync(outDir, { recursive: true });

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext("2d");

  // Background – purple gradient approximated as a flat colour for simplicity
  const bg = ctx.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, "#8b5cf6");
  bg.addColorStop(1, "#06b6d4");

  // Rounded-rect background
  const r = size * 0.2;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.arcTo(size, 0, size, r, r);
  ctx.lineTo(size, size - r);
  ctx.arcTo(size, size, size - r, size, r);
  ctx.lineTo(r, size);
  ctx.arcTo(0, size, 0, size - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
  ctx.fillStyle = bg;
  ctx.fill();

  // Letter "G" centred
  ctx.fillStyle  = "#ffffff";
  ctx.font       = `bold ${Math.round(size * 0.55)}px sans-serif`;
  ctx.textAlign  = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("G", size / 2, size / 2 + size * 0.03);

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(path.join(outDir, `icon${size}.png`), buffer);
  console.log(`Written icon${size}.png`);
}

console.log("Icons generated.");
