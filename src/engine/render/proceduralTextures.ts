import * as THREE from 'three';
import { Rng } from '../../core/rng';

/** Texturas procedurais em canvas (até o pipeline de níveis do M6 trazer texturas CC0 + lightmaps). */

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat: number, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

/** Ruído de valor suave para veios de mármore/madeira. */
function valueNoise(rng: Rng, n: number): (x: number, y: number) => number {
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  const at = (x: number, y: number) => g[((y % n) + n) % n * n + (((x % n) + n) % n)]!;
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(noise: (x: number, y: number) => number, x: number, y: number, oct = 5): number {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * noise(x * f, y * f);
    f *= 2;
    a *= 0.5;
  }
  return s;
}

const cache = new Map<string, THREE.Texture>();

/** Piso de pedra polida em placas grandes (átrio corporativo). */
export function marbleFloor(repeat: number): { map: THREE.Texture; rough: THREE.Texture } {
  const key = 'marble';
  if (!cache.has(key)) {
    const size = 512;
    const [c, ctx] = canvas(size);
    const [cr, ctxr] = canvas(size);
    const img = ctx.createImageData(size, size);
    const imr = ctxr.createImageData(size, size);
    const rng = new Rng(7);
    const n = valueNoise(rng, 64);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const veins = Math.abs(Math.sin((u * 6 + v * 3 + fbm(n, u * 8, v * 8) * 4) * Math.PI));
        const vein = Math.pow(1 - veins, 10);
        const base = 0.78 + fbm(n, u * 20 + 9, v * 20) * 0.12;
        // juntas das placas (2x2 por tile)
        const gx = (u * 2) % 1;
        const gy = (v * 2) % 1;
        const grout = gx < 0.006 || gy < 0.006 ? 1 : 0;
        let l = base - vein * 0.32 - grout * 0.35;
        const i = (y * size + x) * 4;
        img.data[i] = Math.min(255, l * 236);
        img.data[i + 1] = Math.min(255, l * 228);
        img.data[i + 2] = Math.min(255, l * 218);
        img.data[i + 3] = 255;
        const r = 0.12 + vein * 0.25 + grout * 0.5 + fbm(n, u * 40, v * 40) * 0.08;
        imr.data[i] = imr.data[i + 1] = imr.data[i + 2] = Math.min(255, r * 255);
        imr.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctxr.putImageData(imr, 0, 0);
    cache.set(key, toTexture(c, 1));
    cache.set(key + 'r', toTexture(cr, 1, false));
  }
  const map = cache.get(key)!.clone();
  const rough = cache.get(key + 'r')!.clone();
  map.repeat.set(repeat, repeat);
  rough.repeat.set(repeat, repeat);
  map.needsUpdate = rough.needsUpdate = true;
  return { map, rough };
}

/** Painel de madeira escura com ripas verticais. */
export function woodPanels(repeatX: number, repeatY: number): THREE.Texture {
  const key = 'wood';
  if (!cache.has(key)) {
    const size = 512;
    const [c, ctx] = canvas(size);
    const img = ctx.createImageData(size, size);
    const rng = new Rng(11);
    const n = valueNoise(rng, 64);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const slat = Math.floor(u * 8);
        const local = (u * 8) % 1;
        const grain = Math.sin((v * 30 + fbm(n, slat * 3.1 + u * 4, v * 3) * 6) * Math.PI) * 0.5 + 0.5;
        const tone = 0.42 + (slat % 3) * 0.04 + grain * 0.12 + fbm(n, u * 30, v * 2) * 0.1;
        const gap = local < 0.04 ? 0.35 : 1;
        const i = (y * size + x) * 4;
        img.data[i] = tone * 150 * gap;
        img.data[i + 1] = tone * 98 * gap;
        img.data[i + 2] = tone * 62 * gap;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    cache.set(key, toTexture(c, 1));
  }
  const t = cache.get(key)!.clone();
  t.repeat.set(repeatX, repeatY);
  t.needsUpdate = true;
  return t;
}

/** Concreto/gesso claro para paredes e teto. */
export function plaster(repeat: number, tint = 1): THREE.Texture {
  const key = 'plaster' + tint;
  if (!cache.has(key)) {
    const size = 256;
    const [c, ctx] = canvas(size);
    const img = ctx.createImageData(size, size);
    const n = valueNoise(new Rng(5), 32);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const l = (0.82 + fbm(n, x / 18, y / 18) * 0.12) * tint;
        const i = (y * size + x) * 4;
        img.data[i] = l * 222;
        img.data[i + 1] = l * 218;
        img.data[i + 2] = l * 212;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    cache.set(key, toTexture(c, 1));
  }
  const t = cache.get(key)!.clone();
  t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}

/** Carpete de escritório (open office). */
export function carpet(repeat: number): THREE.Texture {
  const key = 'carpet';
  if (!cache.has(key)) {
    const size = 256;
    const [c, ctx] = canvas(size);
    const img = ctx.createImageData(size, size);
    const rng = new Rng(3);
    const n = valueNoise(rng, 32);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const l = 0.28 + rng.next() * 0.08 + fbm(n, x / 10, y / 10) * 0.08 + (((x >> 5) + (y >> 5)) % 2) * 0.03;
        const i = (y * size + x) * 4;
        img.data[i] = l * 120;
        img.data[i + 1] = l * 128;
        img.data[i + 2] = l * 150;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    cache.set(key, toTexture(c, 1));
  }
  const t = cache.get(key)!.clone();
  t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}

/** Placa/letreiro com texto (logo da empresa, sinalização). */
export function signTexture(text: string, sub: string, w = 1024, h = 256, color = '#f3ece4'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.font = `${Math.floor(h * 0.55)}px Anton, Impact, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h * 0.42);
  ctx.font = `700 ${Math.floor(h * 0.14)}px "Barlow Condensed", sans-serif`;
  ctx.fillStyle = '#ffb02e';
  ctx.fillText(sub.split('').join(' '), w / 2, h * 0.85);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
