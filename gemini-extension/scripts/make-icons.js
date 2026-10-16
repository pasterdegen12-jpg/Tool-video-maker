/**
 * make-icons.js  –  Generate minimal PNG icons without external dependencies.
 *
 * Creates a solid purple square PNG for each required icon size.
 * Run: node scripts/make-icons.js
 */

const fs   = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZES  = [16, 32, 48, 128];
const OUT    = path.join(__dirname, "..", "icons");
fs.mkdirSync(OUT, { recursive: true });

// PNG helper — hand-rolled to avoid any dependency
function makePng(size, r, g, b) {
  // Build raw image data: RGBA rows
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte + pixels
    row[0] = 0; // None filter
    for (let x = 0; x < size; x++) {
      const i = 1 + x * 4;
      // Rounded corners: treat corner pixels as transparent
      const cx = Math.min(x, size - 1 - x);
      const cy = Math.min(y, size - 1 - y);
      const radius = Math.round(size * 0.15);
      const inCorner = cx < radius && cy < radius &&
                       (cx * cx + cy * cy) > (radius - 1) * (radius - 1);

      // Foreground "G" letter — simple pixel art for each size
      const lx = x / size;
      const ly = y / size;
      const isLetter = drawG(lx, ly);

      if (inCorner) {
        row[i] = row[i+1] = row[i+2] = 0; row[i+3] = 0;
      } else if (isLetter) {
        row[i] = 255; row[i+1] = 255; row[i+2] = 255; row[i+3] = 255;
      } else {
        // Gradient: purple to teal by x
        const t   = x / (size - 1);
        const pr  = Math.round((1-t)*139 + t*6);
        const pg  = Math.round((1-t)*92  + t*182);
        const pb  = Math.round((1-t)*246 + t*212);
        row[i] = pr; row[i+1] = pg; row[i+2] = pb; row[i+3] = 255;
      }
    }
    rows.push(row);
  }

  const rawData   = Buffer.concat(rows);
  const compressed = zlib.deflateSync(rawData, { level: 9 });

  // PNG signature + chunks
  const sig  = Buffer.from([137,80,78,71,13,10,26,10]);
  const IHDR = makeChunk("IHDR", (() => {
    const b = Buffer.alloc(13);
    b.writeUInt32BE(size,  0); // width
    b.writeUInt32BE(size,  4); // height
    b[8]  = 8;  // bit depth
    b[9]  = 6;  // RGBA
    b[10] = 0; b[11] = 0; b[12] = 0;
    return b;
  })());
  const IDAT = makeChunk("IDAT", compressed);
  const IEND = makeChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([sig, IHDR, IDAT, IEND]);
}

function makeChunk(type, data) {
  const len  = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const tBuf = Buffer.from(type, "ascii");
  const crc  = crc32(Buffer.concat([tBuf, data]));
  const cBuf = Buffer.alloc(4); cBuf.writeUInt32BE(crc >>> 0, 0);
  return Buffer.concat([len, tBuf, data, cBuf]);
}

// CRC-32 table
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF);
}

/**
 * Approximate "G" letter as pixel art in normalised [0,1] coordinates.
 * Returns true if the pixel should be white (letter ink).
 */
function drawG(x, y) {
  // Map to a 10x10 virtual grid
  const gx = Math.floor(x * 10);
  const gy = Math.floor(y * 10);

  // Simple pixel map for "G"
  const G = [
    "  XXXXXX  ",
    " XX    XX ",
    "XX        ",
    "XX        ",
    "XX  XXXXX ",
    "XX     XX ",
    "XX     XX ",
    " XX    XX ",
    "  XXXXXX  ",
    "          ",
  ];

  if (gy < 0 || gy >= G.length) return false;
  const row = G[gy] || "";
  if (gx < 0 || gx >= row.length) return false;
  return row[gx] === "X";
}

// Generate icons
for (const size of SIZES) {
  const png  = makePng(size, 139, 92, 246); // base purple (gradient applied internally)
  const file = path.join(OUT, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`✓ icon${size}.png  (${png.length} bytes)`);
}

console.log("All icons written to icons/");
