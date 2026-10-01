/**
 * Textura do rosto para o jogo (ASSET_PIPELINE §3, F1/F7/F9): foto inteira na resolução nativa →
 *   RGB: foto com delighting leve na pele (divide a luz de baixa frequência) e fundo/roupa preenchidos por
 *        difusão (push-pull) a partir do cabelo/pele vizinhos — a projeção nunca pega parede branca;
 *   A:   "pelo" (cabelo pela segmentação do MediaPipe + barba/bigode por cor na metade de baixo do rosto) — usado como
 *        alfa das cascas de cabelo e barba no runtime.
 * Saída SEM extensão (DEC-0015): public/assets/characters/marcio_f (PNG; o navegador detecta pelo conteúdo).
 *
 * Uso: npx tsx tools/face/texture.ts <foto> <analise.json> <saida> <relatorio.json>
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { FaceResult } from './analyze';

const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LIPS_OUTER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function blur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const r = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) s += k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i]! /= s;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += src[y * w + Math.min(w - 1, Math.max(0, x + i))]! * k[i + r]!;
      tmp[y * w + x] = a;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]! * k[i + r]!;
      out[y * w + x] = a;
    }
  return out;
}

/** Preenche onde peso≈0 com a média ponderada da vizinhança em várias escalas (push-pull). */
function pushPull(ch: Float32Array[], wgt: Float32Array, w: number, h: number): void {
  type Lvl = { w: number; h: number; c: Float32Array[]; a: Float32Array };
  const levels: Lvl[] = [{ w, h, c: ch.map((c) => c.map((v, i) => v * wgt[i]!)), a: wgt.slice() }];
  while (levels[levels.length - 1]!.w > 2) {
    const L = levels[levels.length - 1]!;
    const nw = Math.ceil(L.w / 2);
    const nh = Math.ceil(L.h / 2);
    const c = ch.map(() => new Float32Array(nw * nh));
    const a = new Float32Array(nw * nh);
    for (let y = 0; y < L.h; y++)
      for (let x = 0; x < L.w; x++) {
        const i = y * L.w + x;
        const j = (y >> 1) * nw + (x >> 1);
        a[j]! += L.a[i]!;
        for (let k = 0; k < c.length; k++) c[k]![j]! += L.c[k]![i]!;
      }
    levels.push({ w: nw, h: nh, c, a });
  }
  // pull: cor normalizada por nível; onde o peso fino é < 1, completa com a cor do nível mais grosso
  const top = levels[levels.length - 1]!;
  let norm = top.c.map((c) => c.map((v, i) => (top.a[i]! > 1e-6 ? v / top.a[i]! : 0)));
  for (let l = levels.length - 2; l >= 0; l--) {
    const L = levels[l]!;
    const U = levels[l + 1]!;
    const next = L.c.map(() => new Float32Array(L.w * L.h));
    for (let y = 0; y < L.h; y++)
      for (let x = 0; x < L.w; x++) {
        const i = y * L.w + x;
        // bilinear no nível grosso (centro do pixel fino em coordenadas do grosso)
        const sx = Math.max(0, Math.min(U.w - 1, (x + 0.5) / 2 - 0.5));
        const sy = Math.max(0, Math.min(U.h - 1, (y + 0.5) / 2 - 0.5));
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const x1 = Math.min(U.w - 1, x0 + 1), y1 = Math.min(U.h - 1, y0 + 1);
        const fx = sx - x0, fy = sy - y0;
        const a = L.a[i]!;
        const t = Math.min(1, a);
        for (let k = 0; k < L.c.length; k++) {
          const n = norm[k]!;
          const up = (n[y0 * U.w + x0]! * (1 - fx) + n[y0 * U.w + x1]! * fx) * (1 - fy) + (n[y1 * U.w + x0]! * (1 - fx) + n[y1 * U.w + x1]! * fx) * fy;
          next[k]![i] = (a > 1e-6 ? t * (L.c[k]![i]! / a) : 0) + (1 - t) * up;
        }
      }
    norm = next;
  }
  for (let k = 0; k < ch.length; k++) ch[k]!.set(norm[k]!);
}

function insidePoly(px: number, py: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function buildFaceTexture(photoPath: string, res: FaceResult) {
  const img = PNG.sync.read(readFileSync(photoPath));
  const { width: W, height: H } = img;
  const N = W * H;
  const lm = res.landmarks!;
  const seg = res.seg!;
  // confianças da segmentação (256²) → resolução da foto (bilinear)
  const up = (c: number[]) => {
    const out = new Float32Array(N);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const sx = Math.max(0, Math.min(seg.w - 1.001, ((x + 0.5) / W) * seg.w - 0.5));
        const sy = Math.max(0, Math.min(seg.h - 1.001, ((y + 0.5) / H) * seg.h - 0.5));
        const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
        const g = (xx: number, yy: number) => c[yy * seg.w + xx]! / 255;
        out[y * W + x] = (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
      }
    return out;
  };
  const [bg, hair, bodySkin, faceSkin, clothes] = [0, 1, 2, 3, 4].map((k) => up(seg.conf[k]!)) as Float32Array[];
  const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    R[i] = img.data[i * 4]! / 255;
    G[i] = img.data[i * 4 + 1]! / 255;
    B[i] = img.data[i * 4 + 2]! / 255;
  }
  // ---- barba/bigode por cor: metade de baixo do rosto, dentro do contorno expandido ----
  const cx = (lm[234]![0] + lm[454]![0]) / 2;
  const cy = (lm[1]![1] + lm[152]![1]) / 2;
  const oval = OVAL.map((i) => [cx + (lm[i]![0] - cx) * 1.12, cy + (lm[i]![1] - cy) * 1.08] as [number, number]);
  const noseBase = lm[2]![1];
  const lipPoly = LIPS_OUTER.map((i) => [lm[i]![0], lm[i]![1]] as [number, number]);
  const beard = new Float32Array(N);
  // dentro do contorno do rosto é sempre pessoa (o segmentador às vezes marca bigode escuro como "fundo")
  const inFace = new Float32Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) inFace[y * W + x] = insidePoly(x, y, oval) ? 1 : 0;
  const inFaceS = blur(inFace, W, H, 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (y < noseBase - 6 || !inFace[i]) continue;
      const r = R[i]!, g = G[i]!, b = B[i]!;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const v = mx, s = mx > 0 ? (mx - mn) / mx : 0;
      // pele: saturada e clara; barba: escura (bigode) ou acinzentada (queixo)
      // (pele da foto: v ≈ 0,6–0,85 e s ≈ 0,3–0,45; bigode marrom-escuro v ≈ 0,1–0,4; barba grisalha s < 0,15)
      let k = Math.max(smooth(0.56, 0.38, v), smooth(0.24, 0.13, s), smooth(0.62, 0.45, v) * smooth(0.36, 0.26, s));
      // lábios (dentro do contorno da boca, claros e avermelhados) não são barba
      if (v > 0.45 && s > 0.22 && r > g * 1.3 && insidePoly(x, y, lipPoly)) k *= 0.1;
      beard[i] = k;
    }
  const beardS = blur(beard, W, H, 1.2);
  // ---- pelo (alfa) e validade (pessoa: cabelo + pele) ----
  const A = new Float32Array(N);
  const valid = new Float32Array(N);
  // a máscara de cabelo do segmentador é 256² (ampliada vira degrau): perto da borda decide pela cor do pixel
  // (cabelo escuro × pele clara), longe da borda vale a segmentação
  const hairS = blur(hair, W, H, 2.5);
  for (let i = 0; i < N; i++) {
    const r = R[i]!, g = G[i]!, b = B[i]!;
    const v = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const sat = v > 0 ? (v - mn) / v : 0;
    const dark = Math.max(smooth(0.5, 0.3, v), smooth(0.22, 0.1, sat) * smooth(0.75, 0.55, v));
    const band = smooth(0.05, 0.3, hairS[i]!) * smooth(0.98, 0.75, hairS[i]!);
    const hairFine = band > 0 ? dark * band + smooth(0.35, 0.7, hairS[i]!) * (1 - band) : smooth(0.35, 0.7, hairS[i]!);
    A[i] = clamp01(Math.max(hairFine, beardS[i]!));
    valid[i] = clamp01(hair[i]! + faceSkin[i]! + bodySkin[i]! * 0.6) * (1 - clamp01(clothes[i]! + bg[i]!) * 0.9);
    valid[i] = Math.max(smooth(0.5, 0.85, valid[i]!), inFaceS[i]!);
  }
  // ---- delighting leve da pele (luz de baixa frequência) ----
  const skinW = new Float32Array(N);
  const Lum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    skinW[i] = clamp01(faceSkin[i]! * (1 - A[i]!) * valid[i]!);
    Lum[i] = 0.2126 * toLin(R[i]!) + 0.7152 * toLin(G[i]!) + 0.0722 * toLin(B[i]!);
  }
  const num = blur(Lum.map((l, i) => l * skinW[i]!), W, H, 28);
  const den = blur(skinW, W, H, 28);
  let sumL = 0, sumW = 0;
  for (let i = 0; i < N; i++) {
    sumL += Lum[i]! * skinW[i]!;
    sumW += skinW[i]!;
  }
  const meanL = sumL / sumW;
  const DELIGHT = 0.55;
  for (let i = 0; i < N; i++) {
    if (den[i]! < 0.05) continue;
    const low = num[i]! / den[i]!;
    const gain = Math.pow(meanL / Math.max(1e-4, low), DELIGHT);
    const k = clamp01(skinW[i]! * 1.4);
    const g = 1 + (Math.min(1.6, Math.max(0.6, gain)) - 1) * k;
    // ganho em linear ≈ ganho^(1/2.2) em sRGB
    const gs = Math.pow(g, 1 / 2.2);
    R[i] = clamp01(R[i]! * gs);
    G[i] = clamp01(G[i]! * gs);
    B[i] = clamp01(B[i]! * gs);
  }
  // ---- cores médias para o resto do corpo / cascas ----
  const mean = (wf: (i: number, x: number, y: number) => number) => {
    let r = 0, g = 0, b = 0, w = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const k = wf(i, x, y);
        if (k <= 0) continue;
        r += toLin(R[i]!) * k;
        g += toLin(G[i]!) * k;
        b += toLin(B[i]!) * k;
        w += k;
      }
    return [r / w, g / w, b / w].map((c) => +c.toFixed(4));
  };
  const eyeY = (lm[33]![1] + lm[263]![1]) / 2;
  const skinLin = mean((i, _x, y) => (y > eyeY + 10 && y < noseBase ? skinW[i]! : 0));
  const hairTop = mean((i, _x, y) => (y < lm[10]![1] - 40 ? hair[i]! * valid[i]! : 0));
  const hairSide = mean((i, x, y) => (y > lm[10]![1] && y < eyeY + 60 && (x < lm[234]![0] + 10 || x > lm[454]![0] - 10) ? hair[i]! * valid[i]! : 0));
  const beardChin = mean((i, _x, y) => (y > lm[17]![1] + 15 ? beardS[i]! * faceSkin[i]! : 0));
  const mustache = mean((i, _x, y) => (y > noseBase && y < lm[0]![1] ? beardS[i]! * faceSkin[i]! : 0));
  // máscara de validade (pessoa × fundo/roupa), antes do preenchimento: o build usa para não pegar cor de fundo
  const validPng = new PNG({ width: W, height: H });
  for (let i = 0; i < N; i++) {
    const v = Math.round(clamp01(valid[i]!) * 255);
    validPng.data[i * 4] = validPng.data[i * 4 + 1] = validPng.data[i * 4 + 2] = v;
    validPng.data[i * 4 + 3] = 255;
  }
  // ---- preenche fundo/roupa a partir da pessoa ----
  pushPull([R, G, B, A], valid, W, H);
  const out = new PNG({ width: W, height: H });
  for (let i = 0; i < N; i++) {
    out.data[i * 4] = Math.round(clamp01(R[i]!) * 255);
    out.data[i * 4 + 1] = Math.round(clamp01(G[i]!) * 255);
    out.data[i * 4 + 2] = Math.round(clamp01(B[i]!) * 255);
    out.data[i * 4 + 3] = Math.round(clamp01(A[i]!) * 255);
  }
  return { png: out, validPng, report: { size: [W, H], skinLin, hairTop, hairSide, beardChin, mustache, delight: DELIGHT } };
}

if (process.argv[1]?.endsWith('texture.ts')) {
  const [photo, analysis, outPath, reportPath] = process.argv.slice(2) as [string, string, string, string];
  const res = JSON.parse(readFileSync(analysis, 'utf8')) as FaceResult;
  const { png, validPng, report } = buildFaceTexture(photo, res);
  writeFileSync(reportPath.replace(/\.json$/, '_valid.png'), PNG.sync.write(validPng));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, PNG.sync.write(png, { colorType: 6 }));
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  // visualização (RGB | alfa) para conferência
  const viz = new PNG({ width: png.width * 2, height: png.height });
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * 4;
      const o = (y * viz.width + x) * 4;
      const o2 = (y * viz.width + png.width + x) * 4;
      for (let k = 0; k < 3; k++) viz.data[o + k] = png.data[i + k]!;
      for (let k = 0; k < 3; k++) viz.data[o2 + k] = png.data[i + 3]!;
      viz.data[o + 3] = viz.data[o2 + 3] = 255;
    }
  writeFileSync(reportPath.replace(/\.json$/, '_viz.png'), PNG.sync.write(viz));
  console.log(`[face-tex] → ${outPath} ${JSON.stringify(report)}`);
}
