/**
 * Visualização de conferência: pontos do MediaPipe sobre a imagem (+ máscaras de segmentação lado a lado).
 * Uso: npx tsx tools/face/viz.ts <resultado.json> <saida.png> [indice]
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
import type { FaceResult } from './analyze';

export function readPng(file: string): PNG {
  return PNG.sync.read(readFileSync(file));
}

export function drawDot(png: PNG, x: number, y: number, rgb: [number, number, number], r = 1): void {
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const X = Math.round(x + dx);
      const Y = Math.round(y + dy);
      if (X < 0 || Y < 0 || X >= png.width || Y >= png.height) continue;
      const i = (Y * png.width + X) * 4;
      png.data[i] = rgb[0];
      png.data[i + 1] = rgb[1];
      png.data[i + 2] = rgb[2];
      png.data[i + 3] = 255;
    }
}

if (process.argv[1]?.endsWith('viz.ts')) {
  const [jsonPath, outPath, idx] = process.argv.slice(2);
  const raw = JSON.parse(readFileSync(jsonPath!, 'utf8')) as FaceResult | FaceResult[];
  const r = Array.isArray(raw) ? raw[Number(idx ?? 0)]! : raw;
  const src = readPng(r.file);
  const segs = r.seg ? r.seg.conf.length : 0;
  const out = new PNG({ width: src.width * (1 + (segs ? 1 : 0)), height: src.height });
  for (let y = 0; y < src.height; y++)
    for (let x = 0; x < src.width; x++) {
      const i = (y * src.width + x) * 4;
      const o = (y * out.width + x) * 4;
      for (let k = 0; k < 4; k++) out.data[o + k] = src.data[i + k]!;
    }
  for (const [n, p] of (r.landmarks ?? []).entries()) {
    const key = [33, 133, 362, 263, 1, 4, 61, 291, 13, 14, 152, 10, 234, 454, 172, 397].includes(n);
    drawDot(out, p[0], p[1], key ? [255, 30, 30] : [40, 255, 80], key ? 2 : 0);
  }
  if (r.seg) {
    // cores por classe: cabelo amarelo, pele do rosto vermelho, pele do corpo laranja, roupa azul, fundo preto
    const pal: [number, number, number][] = [[0, 0, 0], [255, 220, 0], [255, 140, 0], [220, 40, 40], [40, 90, 255], [200, 0, 200]];
    const { w, h, conf } = r.seg;
    for (let y = 0; y < src.height; y++)
      for (let x = 0; x < src.width; x++) {
        const sx = Math.min(w - 1, Math.floor((x / src.width) * w));
        const sy = Math.min(h - 1, Math.floor((y / src.height) * h));
        let best = 0;
        for (let c = 1; c < conf.length; c++) if (conf[c]![sy * w + sx]! > conf[best]![sy * w + sx]!) best = c;
        const o = (y * out.width + src.width + x) * 4;
        const i = (y * src.width + x) * 4;
        for (let k = 0; k < 3; k++) out.data[o + k] = Math.round(src.data[i + k]! * 0.35 + pal[best]![k]! * 0.65);
        out.data[o + 3] = 255;
      }
  }
  writeFileSync(outPath!, PNG.sync.write(out));
  console.log(`[viz] → ${outPath}`);
}
