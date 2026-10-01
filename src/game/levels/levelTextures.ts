import * as THREE from 'three';
import { Rng } from '../../core/rng';

/**
 * Texturas procedurais do andar (zero download). As UVs da geometria do nível são em METROS, então cada textura diz
 * quantos metros ela cobre (`size`) e o construtor usa repeat = 1/size.
 */
export interface TexSet {
  map: THREE.Texture;
  normal?: THREE.Texture;
  rough?: THREE.Texture;
}

const cache = new Map<string, TexSet>();

function cv(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, size: number, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / size, 1 / size);
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

/** Normal map a partir de uma altura (canvas em tons de cinza). */
function normalFrom(src: CanvasRenderingContext2D, w: number, h: number, strength: number, size: number): THREE.CanvasTexture {
  const d = src.getImageData(0, 0, w, h).data;
  const [c, ctx] = cv(w, h);
  const img = ctx.createImageData(w, h);
  const H = (x: number, y: number) => d[(((y + h) % h) * w + ((x + w) % w)) * 4]! / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let nx = (H(x - 1, y) - H(x + 1, y)) * strength;
      let ny = (H(x, y - 1) - H(x, y + 1)) * strength;
      const l = Math.hypot(nx, ny, 1);
      nx /= l;
      ny /= l;
      const i = (y * w + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / l) * 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return tex(c, size, false);
}

function noiseFill(ctx: CanvasRenderingContext2D, w: number, h: number, rng: Rng, base: [number, number, number], amp: number): void {
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const n = (rng.next() - 0.5) * amp;
    img.data[i * 4] = Math.max(0, Math.min(255, base[0] + n));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, base[1] + n));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, base[2] + n));
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function memo(key: string, make: () => TexSet): TexSet {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Azulejo/porcelanato em grade (paredes de banheiro, piso de banheiro). */
export function tiles(key: string, tile: number, color: string, grout: string, px = 64, var_ = 10): TexSet {
  return memo('tiles' + key, () => {
    const n = 4;
    const S = px * n;
    const [c, ctx] = cv(S);
    const [, hctx] = cv(S);
    const rng = new Rng(key.length * 7 + 3);
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, S, S);
    hctx.fillStyle = '#000';
    hctx.fillRect(0, 0, S, S);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const v = (rng.next() - 0.5) * var_;
        const col = new THREE.Color(color);
        ctx.fillStyle = `rgb(${col.r * 255 + v},${col.g * 255 + v},${col.b * 255 + v})`;
        ctx.fillRect(x * px + 2, y * px + 2, px - 4, px - 4);
        hctx.fillStyle = '#fff';
        hctx.fillRect(x * px + 2, y * px + 2, px - 4, px - 4);
      }
    return { map: tex(c, tile * n), normal: normalFrom(hctx, S, S, 3, tile * n) };
  });
}

/** Piso da cafeteria: granilite (terrazzo) quente com juntas de latão. */
export function terrazzo(): TexSet {
  return memo('terrazzo', () => {
    const S = 512;
    const [c, ctx] = cv(S);
    const rng = new Rng(21);
    noiseFill(ctx, S, S, rng, [196, 182, 164], 10);
    for (let i = 0; i < 2600; i++) {
      const r = 1 + rng.next() * 3.5;
      const p = rng.next();
      ctx.fillStyle = p < 0.4 ? '#7a6450' : p < 0.7 ? '#e8e0d4' : p < 0.85 ? '#9b3f2e' : '#3e3a36';
      ctx.beginPath();
      ctx.ellipse(rng.next() * S, rng.next() * S, r, r * (0.6 + rng.next() * 0.5), rng.next() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#b08a4a';
    ctx.fillRect(0, 0, S, 3);
    ctx.fillRect(0, 0, 3, S);
    return { map: tex(c, 2.4) };
  });
}

/** Forro modular 62,5 cm (salas comuns). */
export function ceilingTiles(): TexSet {
  return memo('ceil', () => {
    const S = 256;
    const [c, ctx] = cv(S);
    const rng = new Rng(5);
    noiseFill(ctx, S, S, rng, [214, 214, 210], 14);
    ctx.strokeStyle = '#8f9093';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, S, S);
    ctx.strokeRect(0, 0, S / 2, S / 2);
    ctx.strokeRect(S / 2, S / 2, S / 2, S / 2);
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = 'rgba(80,80,80,0.25)';
      ctx.fillRect(rng.next() * S, rng.next() * S, 1, 1);
    }
    return { map: tex(c, 1.25) };
  });
}

/** Concreto queimado (depósito, escada). */
export function concrete(tint = '#8c8a86'): TexSet {
  return memo('concrete' + tint, () => {
    const S = 512;
    const [c, ctx] = cv(S);
    const rng = new Rng(13);
    const col = new THREE.Color(tint);
    noiseFill(ctx, S, S, rng, [col.r * 255, col.g * 255, col.b * 255], 16);
    for (let i = 0; i < 70; i++) {
      const g = ctx.createRadialGradient(rng.next() * S, rng.next() * S, 0, rng.next() * S, rng.next() * S, 30 + rng.next() * 90);
      g.addColorStop(0, `rgba(${rng.chance(0.5) ? '40,38,36' : '200,196,190'},0.08)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    }
    ctx.strokeStyle = 'rgba(30,30,30,0.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, S, S);
    return { map: tex(c, 3) };
  });
}

/** Ripado de madeira (forro da cafeteria). */
export function woodSlats(): TexSet {
  return memo('slats', () => {
    const S = 256;
    const [c, ctx] = cv(S);
    const rng = new Rng(8);
    ctx.fillStyle = '#1c140e';
    ctx.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 32) {
      const v = rng.next() * 20;
      ctx.fillStyle = `rgb(${120 + v},${78 + v * 0.7},${46 + v * 0.4})`;
      ctx.fillRect(x + 4, 0, 24, S);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(60,36,20,${0.1 + rng.next() * 0.2})`;
        ctx.fillRect(x + 4 + rng.next() * 24, rng.next() * S, 1, 8 + rng.next() * 40);
      }
    }
    return { map: tex(c, 1.2) };
  });
}

/** Piso vinílico (corredor, segurança). */
export function vinyl(): TexSet {
  return memo('vinyl', () => {
    const S = 256;
    const [c, ctx] = cv(S);
    const rng = new Rng(17);
    noiseFill(ctx, S, S, rng, [118, 120, 122], 12);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rng.chance(0.5) ? 'rgba(40,40,44,0.35)' : 'rgba(200,200,205,0.3)';
      ctx.fillRect(rng.next() * S, rng.next() * S, 1 + rng.next() * 2, 1 + rng.next() * 2);
    }
    ctx.fillStyle = 'rgba(30,30,30,0.5)';
    ctx.fillRect(0, 0, S, 1);
    ctx.fillRect(0, 0, 1, S);
    return { map: tex(c, 0.6) };
  });
}

/** Metal escovado (catracas, elevadores, inox). */
export function brushedMetal(): TexSet {
  return memo('brushed', () => {
    const S = 256;
    const [c, ctx] = cv(S);
    const rng = new Rng(2);
    ctx.fillStyle = '#9a9ca2';
    ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 1400; i++) {
      const v = 120 + rng.next() * 110;
      ctx.fillStyle = `rgba(${v},${v},${v + 4},0.25)`;
      ctx.fillRect(0, rng.next() * S, S, 1);
    }
    return { map: tex(c, 0.5) };
  });
}

/** Tecido (estofados, cadeiras de escritório). */
export function fabric(color: string): TexSet {
  return memo('fabric' + color, () => {
    const S = 128;
    const [c, ctx] = cv(S);
    const rng = new Rng(4);
    const col = new THREE.Color(color);
    noiseFill(ctx, S, S, rng, [col.r * 255, col.g * 255, col.b * 255], 18);
    ctx.globalAlpha = 0.18;
    for (let y = 0; y < S; y += 2) {
      ctx.fillStyle = y % 4 ? '#000' : '#fff';
      ctx.fillRect(0, y, S, 1);
    }
    return { map: tex(c, 0.12) };
  });
}

/** Papelão das caixas (com fita). */
export function cardboard(): TexSet {
  return memo('cardboard', () => {
    const S = 128;
    const [c, ctx] = cv(S);
    const rng = new Rng(6);
    noiseFill(ctx, S, S, rng, [168, 128, 84], 16);
    ctx.fillStyle = 'rgba(210,180,120,0.55)';
    ctx.fillRect(S * 0.42, 0, S * 0.16, S);
    return { map: tex(c, 0.6) };
  });
}

/** Painel de madeira escura (paredes do átrio). */
export function woodWall(): TexSet {
  return memo('woodWall', () => {
    const W = 512;
    const [c, ctx] = cv(W);
    const rng = new Rng(31);
    for (let x = 0; x < W; x += 128) {
      const v = rng.next() * 18;
      ctx.fillStyle = `rgb(${92 + v},${56 + v * 0.6},${34 + v * 0.4})`;
      ctx.fillRect(x, 0, 128, W);
      for (let i = 0; i < 260; i++) {
        const yy = rng.next() * W;
        ctx.strokeStyle = `rgba(${40 + rng.next() * 30},${22 + rng.next() * 18},12,${0.12 + rng.next() * 0.2})`;
        ctx.lineWidth = 1 + rng.next() * 2;
        ctx.beginPath();
        ctx.moveTo(x + 2, yy);
        ctx.bezierCurveTo(x + 40, yy + rng.next() * 10 - 5, x + 80, yy + rng.next() * 10 - 5, x + 126, yy + rng.next() * 6 - 3);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(10,6,4,0.8)';
      ctx.fillRect(x, 0, 3, W);
    }
    return { map: tex(c, 2.4) };
  });
}
