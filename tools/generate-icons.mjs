// 生成原创蓝色胖鱼应用图标（PNG + ICO），仅依赖 Node 内置模块。
// 用法: node tools/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "src-tauri", "icons");
mkdirSync(outDir, { recursive: true });

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- 小鱼绘制（4x 超采样抗锯齿）----------
function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), c.length > 7 ? parseInt(c.slice(7, 9), 16) : 255];
}
const BODY = hex("#4A9DFF"), BODY_DARK = hex("#2E7FE0"), BODY_LIGHT = hex("#66B5FF");
const BELLY = hex("#D9EFFF"), INK = hex("#1F3D5C"), BLUSH = hex("#FFB3C1");
const BUBBLE = hex("#A9D8FF");

function inEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx, dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}
function inTriangle(px, py, [x1, y1, x2, y2, x3, y3]) {
  const d1 = (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  const d2 = (px - x3) * (y2 - y3) - (x2 - x3) * (py - y3);
  const d3 = (px - x1) * (y3 - y1) - (x3 - x1) * (py - y1);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}
function sampleColor(x, y) {
  // 背景
  let c = [0, 0, 0, 0];
  // 尾巴（朝右的鱼，尾巴在左）
  if (inTriangle(x, y, [40, 128, 12, 92, 12, 164])) c = BODY_DARK;
  // 背鳍
  if (inTriangle(x, y, [80, 30, 118, 22, 112, 44])) c = hex("#3E8FE8");
  // 身体
  if (inEllipse(x, y, 118, 128, 84, 66)) {
    const t = Math.min(Math.max((y - 62) / 132, 0), 1);
    const top = BODY_LIGHT.map((v, i) => v), bot = BODY_DARK.map((v, i) => v);
    c = [0, 1, 2].map((i) => Math.round(top[i] + (bot[i] - top[i]) * t));
    c.push(255);
  }
  // 肚皮（限制在身体内）
  if (inEllipse(x, y, 124, 162, 56, 30) && inEllipse(x, y, 118, 128, 84, 66)) c = BELLY;
  // 侧鳍
  {
    const cx = 112, cy = 152, rx = 20, ry = 11;
    const dx = (x - cx) * Math.cos(-0.3) + (y - cy) * Math.sin(-0.3);
    const dy = -(x - cx) * Math.sin(-0.3) + (y - cy) * Math.cos(-0.3);
    if ((dx / rx) ** 2 + (dy / ry) ** 2 <= 1 && inEllipse(x, y, 118, 128, 84, 66)) c = BODY_DARK;
  }
  // 腮红
  if (inEllipse(x, y, 156, 142, 10, 6) && inEllipse(x, y, 118, 128, 84, 66)) c = BLUSH;
  // 眼睛
  if ((x - 146) ** 2 + (y - 102) ** 2 <= 8 ** 2) c = INK;
  if ((x - 149.5) ** 2 + (y - 99) ** 2 <= 2.8 ** 2) c = [255, 255, 255, 255];
  // 嘴巴（微笑弧）
  {
    const dx = x - 182, dy = y - 116;
    const d2 = dx * dx + dy * dy;
    if (d2 >= 8 ** 2 && d2 <= 11 ** 2 && dy < -2) c = INK;
  }
  // 气泡（描边圆）
  {
    const dx = x - 214, dy = y - 66;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= 7 && d <= 9.6) c = BUBBLE;
  }
  {
    const dx = x - 230, dy = y - 38;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= 4 && d <= 6) c = BUBBLE;
  }
  return c;
}

function drawFish(size) {
  const buf = Buffer.alloc(size * size * 4);
  const S = 256; // 逻辑画布
  const SS = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const lx = ((px + (sx + 0.5) / SS) / size) * S;
          const ly = ((py + (sy + 0.5) / SS) / size) * S;
          const [cr, cg, cb, ca] = sampleColor(lx, ly);
          r += cr * ca; g += cg * ca; b += cb * ca; a += ca;
        }
      }
      const idx = (py * size + px) * 4;
      if (a > 0) {
        buf[idx] = Math.round(r / a);
        buf[idx + 1] = Math.round(g / a);
        buf[idx + 2] = Math.round(b / a);
        buf[idx + 3] = Math.round(a / (SS * SS));
      }
    }
  }
  return buf;
}

function makeIcon(size) {
  return encodePng(size, size, drawFish(size));
}

// PNG 输出
const png32 = makeIcon(32);
const png128 = makeIcon(128);
const png256 = makeIcon(256);
writeFileSync(join(outDir, "32x32.png"), png32);
writeFileSync(join(outDir, "128x128.png"), png128);
writeFileSync(join(outDir, "128x128@2x.png"), png256);
writeFileSync(join(outDir, "icon.png"), png256);

// ICO（内嵌 PNG，Windows Vista+ 支持）
function makeIco(png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = 0; // 256 => 0
  entry[1] = 0;
  entry[2] = 0; // palette
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(22, 12); // data offset
  return Buffer.concat([header, entry, png]);
}
writeFileSync(join(outDir, "icon.ico"), makeIco(png256));
console.log("icons written to", outDir);