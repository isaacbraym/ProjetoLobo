/**
 * F11 no jogo: compara uma captura do rosto (npm run capture face → face_photo.png) com a foto de referência.
 *  - landmarks do MediaPipe nas duas → similaridade pelos pontos internos (olhos, sobrancelhas, nariz, boca) →
 *    erro médio normalizado pela distância interocular (meta ≤ 3%);
 *  - captura reamostrada no quadro da foto → SSIM em tons de cinza dentro do contorno do rosto (meta ≥ 0,80);
 *  - face_compare.png: foto | jogo alinhado | sobreposição 50%.
 * Uso: npx tsx tools/face/compare.ts <foto> <captura.png> <saida_dir>
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyzeImages } from './analyze';

const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const CORE = [
  ...[263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466],
  ...[33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  ...[276, 283, 282, 295, 285, 300, 293, 334, 296, 336, 46, 53, 52, 65, 55, 70, 63, 105, 66, 107],
  ...[1, 2, 4, 5, 6, 19, 94, 97, 98, 326, 327, 168, 197, 195, 64, 294, 48, 278, 115, 344, 220, 440, 45, 275],
  ...[61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 185, 40, 39, 37, 0, 267, 269, 270, 409],
];

type P2 = [number, number];

/** Similaridade (a, b, tx, ty): x' = a·x − b·y + tx ; y' = b·x + a·y + ty, mínimos quadrados src → dst. */
function similarity(src: P2[], dst: P2[]) {
  const n = src.length;
  let sx = 0, sy = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    sx += src[i]![0]; sy += src[i]![1]; dx += dst[i]![0]; dy += dst[i]![1];
  }
  sx /= n; sy /= n; dx /= n; dy /= n;
  let num1 = 0, num2 = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const ax = src[i]![0] - sx, ay = src[i]![1] - sy, bx = dst[i]![0] - dx, by = dst[i]![1] - dy;
    num1 += ax * bx + ay * by;
    num2 += ax * by - ay * bx;
    den += ax * ax + ay * ay;
  }
  const a = num1 / den, b = num2 / den;
  return { a, b, tx: dx - (a * sx - b * sy), ty: dy - (b * sx + a * sy) };
}

function gray(png: PNG, x: number, y: number): number {
  // bilinear, luminância sRGB simples
  const x0 = Math.max(0, Math.min(png.width - 2, Math.floor(x)));
  const y0 = Math.max(0, Math.min(png.height - 2, Math.floor(y)));
  const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0));
  const g = (xx: number, yy: number) => {
    const i = (yy * png.width + xx) * 4;
    return (0.299 * png.data[i]! + 0.587 * png.data[i + 1]! + 0.114 * png.data[i + 2]!) / 255;
  };
  return (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
}

function insidePoly(px: number, py: number, poly: P2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!, [xj, yj] = poly[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export async function compareFace(photoPath: string, capturePath: string, outDir: string) {
  const [ph, gm] = await analyzeImages([photoPath, capturePath]);
  if (!ph!.found || !gm!.found) return { ok: false, reason: `rosto não encontrado (foto: ${ph!.found}, jogo: ${gm!.found})` };
  const P = ph!.landmarks!.map((p) => [p[0], p[1]] as P2);
  const G = gm!.landmarks!.map((p) => [p[0], p[1]] as P2);
  const T = similarity(CORE.map((i) => G[i]!), CORE.map((i) => P[i]!));
  const map = (p: P2): P2 => [T.a * p[0] - T.b * p[1] + T.tx, T.b * p[0] + T.a * p[1] + T.ty];
  const io = Math.hypot(P[33]![0] - P[263]![0], P[33]![1] - P[263]![1]);
  const errs = CORE.map((i) => {
    const q = map(G[i]!);
    return Math.hypot(q[0] - P[i]![0], q[1] - P[i]![1]);
  });
  const ovalErr = OVAL.map((i) => {
    const q = map(G[i]!);
    return Math.hypot(q[0] - P[i]![0], q[1] - P[i]![1]);
  });
  // ---- jogo reamostrado no quadro da foto (inversa da similaridade) ----
  const photo = PNG.sync.read(readFileSync(photoPath));
  const game = PNG.sync.read(readFileSync(capturePath));
  const W = photo.width, H = photo.height;
  const det = T.a * T.a + T.b * T.b;
  const inv = (x: number, y: number): P2 => {
    const u = x - T.tx, v = y - T.ty;
    return [(T.a * u + T.b * v) / det, (-T.b * u + T.a * v) / det];
  };
  const cx = P.reduce((s, p) => s + p[0], 0) / P.length, cy = P.reduce((s, p) => s + p[1], 0) / P.length;
  const hull = OVAL.map((i) => [cx + (P[i]![0] - cx) * 0.92, cy + (P[i]![1] - cy) * 0.92] as P2);
  const A = new Float32Array(W * H), B = new Float32Array(W * H), M = new Uint8Array(W * H);
  const out = new PNG({ width: W * 3, height: H });
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const [gx, gy] = inv(x, y);
      A[i] = gray(photo, x, y);
      B[i] = gx >= 0 && gy >= 0 && gx < game.width - 1 && gy < game.height - 1 ? gray(game, gx, gy) : 0;
      M[i] = insidePoly(x, y, hull) ? 1 : 0;
      const pi = i * 4;
      const gxi = Math.max(0, Math.min(game.width - 1, Math.round(gx))), gyi = Math.max(0, Math.min(game.height - 1, Math.round(gy)));
      const gi = (gyi * game.width + gxi) * 4;
      for (let k = 0; k < 3; k++) {
        out.data[(y * out.width + x) * 4 + k] = photo.data[pi + k]!;
        out.data[(y * out.width + W + x) * 4 + k] = game.data[gi + k]!;
        out.data[(y * out.width + 2 * W + x) * 4 + k] = Math.round((photo.data[pi + k]! + game.data[gi + k]!) / 2);
      }
      for (const o of [0, W, 2 * W]) out.data[(y * out.width + o + x) * 4 + 3] = 255;
    }
  // ---- SSIM (janela gaussiana σ=1,5) dentro do contorno ----
  const blur = (src: Float32Array) => {
    const r = 4, k: number[] = [];
    let s = 0;
    for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-(i * i) / 4.5);
    const kk = k.map((v) => v / s);
    const t = new Float32Array(W * H), o = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let i = -r; i <= r; i++) a += src[y * W + Math.min(W - 1, Math.max(0, x + i))]! * kk[i + r]!; t[y * W + x] = a; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let a = 0; for (let i = -r; i <= r; i++) a += t[Math.min(H - 1, Math.max(0, y + i)) * W + x]! * kk[i + r]!; o[y * W + x] = a; }
    return o;
  };
  const mA = blur(A), mB = blur(B);
  const sAA = blur(A.map((v) => v * v)), sBB = blur(B.map((v) => v * v)), sAB = blur(A.map((v, i) => v * B[i]!));
  const C1 = 0.01 ** 2, C2 = 0.03 ** 2;
  let ssim = 0, n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!M[i]) continue;
    const va = sAA[i]! - mA[i]! ** 2, vb = sBB[i]! - mB[i]! ** 2, cov = sAB[i]! - mA[i]! * mB[i]!;
    ssim += ((2 * mA[i]! * mB[i]! + C1) * (2 * cov + C2)) / ((mA[i]! ** 2 + mB[i]! ** 2 + C1) * (va + vb + C2));
    n++;
  }
  writeFileSync(resolve(outDir, 'face_compare.png'), PNG.sync.write(out));
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  const res = {
    ok: true,
    landmarkErrPct: +((100 * mean(errs)) / io).toFixed(2),
    landmarkMaxPct: +((100 * Math.max(...errs)) / io).toFixed(2),
    ovalErrPct: +((100 * mean(ovalErr)) / io).toFixed(2),
    ssim: +(ssim / n).toFixed(3),
    meta: { landmarkErrPct: 3, ssim: 0.8 },
  };
  writeFileSync(resolve(outDir, 'face_metrics.json'), JSON.stringify(res, null, 2));
  return res;
}

if (process.argv[1]?.endsWith('compare.ts')) {
  const [photo, cap, outDir] = process.argv.slice(2) as [string, string, string];
  console.log('[face-compare]', JSON.stringify(await compareFace(photo, cap, outDir)));
}
