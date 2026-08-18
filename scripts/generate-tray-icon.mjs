// Generates a minimal valid 32x32 32bpp .ico file (a filled circle) with no
// external image libraries — just hand-built ICO/BMP binary structure.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, "..", "assets", "tray-icon.ico");

const SIZE = 32;
const CENTER = SIZE / 2 - 0.5;
const RADIUS = SIZE / 2 - 2;

// BGRA, purple circle on transparent background
const R = 0x7c, G = 0x5c, B = 0xf0;

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const dx = x - CENTER;
    const dy = y - CENTER;
    const inside = Math.sqrt(dx * dx + dy * dy) <= RADIUS;
    // BMP rows in ICO are bottom-up
    const row = SIZE - 1 - y;
    const idx = (row * SIZE + x) * 4;
    if (inside) {
      pixels[idx] = B;
      pixels[idx + 1] = G;
      pixels[idx + 2] = R;
      pixels[idx + 3] = 0xff;
    }
  }
}

// AND mask: 1bpp, rows padded to 4-byte boundary, all zero (fully opaque via alpha)
const maskRowBytes = Math.ceil(SIZE / 8 / 4) * 4;
const andMask = Buffer.alloc(maskRowBytes * SIZE, 0);

const bmpHeader = Buffer.alloc(40);
bmpHeader.writeUInt32LE(40, 0); // header size
bmpHeader.writeInt32LE(SIZE, 4); // width
bmpHeader.writeInt32LE(SIZE * 2, 8); // height (XOR+AND combined, per ICO spec)
bmpHeader.writeUInt16LE(1, 12); // planes
bmpHeader.writeUInt16LE(32, 14); // bit count
bmpHeader.writeUInt32LE(0, 16); // compression = BI_RGB
bmpHeader.writeUInt32LE(pixels.length + andMask.length, 20); // image size

const imageData = Buffer.concat([bmpHeader, pixels, andMask]);

const iconDir = Buffer.alloc(6);
iconDir.writeUInt16LE(0, 0); // reserved
iconDir.writeUInt16LE(1, 2); // type = icon
iconDir.writeUInt16LE(1, 4); // count

const entry = Buffer.alloc(16);
entry.writeUInt8(SIZE, 0); // width
entry.writeUInt8(SIZE, 1); // height
entry.writeUInt8(0, 2); // color count
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bit count
entry.writeUInt32LE(imageData.length, 8); // bytes in resource
entry.writeUInt32LE(6 + 16, 12); // offset

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, Buffer.concat([iconDir, entry, imageData]));
console.log("Written:", OUT_PATH);
