import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inPerson(x, y) {
  const dx = x - 0.5;
  if ((dx * dx) + ((y - 0.40) ** 2) <= 0.048 ** 2) return true;
  if (y >= 0.455 && y <= 0.64 && Math.abs(dx) <= 0.105 + (0.62 - Math.min(y, 0.62)) * 0.04) return true;
  if (y >= 0.61 && y <= 0.80 && dx > -0.09 && dx < -0.028) return true;
  if (y >= 0.61 && y <= 0.80 && dx > 0.028 && dx < 0.09) return true;
  return false;
}

function sample(px, py, maskable) {
  const pink = [1, 0.169, 0.451, 1];
  const black = [0, 0, 0, 1];
  const white = [1, 1, 1, 1];
  if (maskable) {
    return inPerson(px, py) ? white : pink;
  }
  const dx = px - 0.5;
  const dy = py - 0.5;
  if (inPerson(px, py) && (dx * dx + dy * dy) < 0.30 ** 2) return white;
  if (dx * dx + dy * dy <= 0.34 ** 2) return pink;
  return black;
}

function render(size, maskable) {
  const scale = 3;
  const big = size * scale;
  const acc = new Float64Array(size * size * 4);
  for (let y = 0; y < big; y += 1) {
    for (let x = 0; x < big; x += 1) {
      const [r, g, b, a] = sample((x + 0.5) / big, (y + 0.5) / big, maskable);
      const ox = Math.floor(x / scale);
      const oy = Math.floor(y / scale);
      const i = (oy * size + ox) * 4;
      acc[i] += r * a;
      acc[i + 1] += g * a;
      acc[i + 2] += b * a;
      acc[i + 3] += a;
    }
  }
  const out = Buffer.alloc(size * size * 4);
  const n = scale * scale;
  for (let i = 0; i < size * size; i += 1) {
    const a = acc[i * 4 + 3] / n;
    const o = i * 4;
    out[o + 3] = Math.round(a * 255);
    if (a > 0) {
      out[o] = Math.round((acc[o] / n / a) * 255);
      out[o + 1] = Math.round((acc[o + 1] / n / a) * 255);
      out[o + 2] = Math.round((acc[o + 2] / n / a) * 255);
    }
  }
  return encodePNG(size, size, out);
}

fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'icon-192.png'), render(192, false));
fs.writeFileSync(path.join(root, 'icon-512.png'), render(512, false));
fs.writeFileSync(path.join(root, 'icon-maskable-512.png'), render(512, true));
fs.writeFileSync(path.join(root, 'apple-touch-icon.png'), render(180, false));
console.log('icons written', root);
