import * as THREE from 'three';
import { Rng } from '../../core/rng';
import type { Batch } from './kit';
import { box, cyl, mat4 } from './kit';
import { LevelAtlas, drawArt, drawSign, type UvRect } from './atlas';
import { createNewsScreen } from './screens';

/**
 * Biblioteca de props do andar, modelados por código (caixas/cilindros com materiais da paleta). Coordenadas locais:
 * y para cima a partir do chão, frente do prop = +z local; `ry` gira o prop. Peças estáticas vão para o lote da sala
 * (mesclado por material); telas animadas, luzes piscando e barreiras de arena viram objetos dinâmicos.
 */
export interface PropCtx {
  batch: Batch;
  atlas: LevelAtlas;
  base: THREE.Matrix4;
  ry: number;
  p: Record<string, unknown>;
  rng: Rng;
  roomHeight: number;
  /** caixa de colisão em coordenadas locais (centro e tamanho total) */
  collide(w: number, h: number, d: number, x: number, y: number, z: number, ry?: number): void;
  /** objeto separado (animado) já no espaço local do prop */
  dyn(obj: THREE.Object3D): void;
  tick(fn: (dt: number, t: number) => void): void;
  /** expõe algo para o jogo (ex.: barreiras da arena) */
  expose(key: string, value: unknown): void;
  getMat(key: string): THREE.Material;
}

type PropFn = (c: PropCtx) => void;

// ---------- auxiliares de desenho ----------
const B = (c: PropCtx, mat: string, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) =>
  c.batch.add(mat, box(w, h, d), new THREE.Matrix4().multiplyMatrices(c.base, mat4(x, y, z, ry, rx, rz)));
const G = (c: PropCtx, mat: string, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1, worldUv = true) =>
  c.batch.add(mat, g, new THREE.Matrix4().multiplyMatrices(c.base, mat4(x, y, z, ry, rx, rz, sx, sy, sz)), worldUv);
const Q = (c: PropCtx, mat: 'atlasGlow' | 'atlasLit' | 'atlasDecal', w: number, h: number, uv: UvRect, x: number, y: number, z: number, ry = 0, rx = 0) =>
  G(c, LevelAtlas.key(mat, uv), LevelAtlas.quad(w, h, uv), x, y, z, ry, rx, 0, 1, 1, 1, false);
const num = (c: PropCtx, k: string, d: number) => (typeof c.p[k] === 'number' ? (c.p[k] as number) : d);
const str = (c: PropCtx, k: string, d: string) => (typeof c.p[k] === 'string' ? (c.p[k] as string) : d);

const ico = new THREE.IcosahedronGeometry(1, 1);
const disc = (r: number, seg = 16) => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);

function bush(c: PropCtx, x: number, y: number, z: number, s: number) {
  G(c, 'foliage', ico, x, y, z, c.rng.next() * 3, 0, 0, s, s * 1.25, s);
  G(c, 'foliageDark', ico, x + s * 0.35, y + s * 0.35, z - s * 0.2, c.rng.next() * 3, 0, 0, s * 0.6, s * 0.7, s * 0.6);
}

function chairOffice(c: PropCtx, x: number, z: number, ry: number) {
  const m = (lx: number, ly: number, lz: number) => {
    const cs = Math.cos(ry), sn = Math.sin(ry);
    return [x + lx * cs + lz * sn, ly, z - lx * sn + lz * cs] as const;
  };
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const [px, , pz] = m(Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15);
    B(c, 'plasticBlack', 0.05, 0.04, 0.3, px, 0.06, pz, a + ry);
  }
  B(c, 'chrome', 0.05, 0.4, 0.05, x, 0.28, z);
  const s = m(0, 0.5, 0);
  B(c, 'fabricGrey', 0.5, 0.08, 0.5, s[0], 0.5, s[2], ry);
  const bk = m(0, 0.82, -0.23);
  B(c, 'fabricGrey', 0.46, 0.55, 0.06, bk[0], 0.84, bk[2], ry, -0.12);
  for (const sx of [-0.25, 0.25]) {
    const ar = m(sx, 0.66, 0);
    B(c, 'plasticBlack', 0.05, 0.05, 0.3, ar[0], 0.68, ar[2], ry);
  }
}

function chairCafe(c: PropCtx, x: number, z: number, ry: number, toppled = false) {
  const local = new THREE.Matrix4().multiplyMatrices(c.base, mat4(x, toppled ? 0.24 : 0, z, ry, toppled ? 1.45 : 0));
  const add = (mat: string, w: number, h: number, d: number, lx: number, ly: number, lz: number, rx = 0) =>
    c.batch.add(mat, box(w, h, d), new THREE.Matrix4().multiplyMatrices(local, mat4(lx, ly, lz, 0, rx)));
  for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]] as const) add('metalDark', 0.03, 0.45, 0.03, lx, 0.225, lz);
  add('woodLight', 0.44, 0.04, 0.42, 0, 0.47, 0);
  add('metalDark', 0.03, 0.42, 0.03, -0.18, 0.68, -0.19);
  add('metalDark', 0.03, 0.42, 0.03, 0.18, 0.68, -0.19);
  add('woodLight', 0.42, 0.16, 0.03, 0, 0.8, -0.2, -0.1);
}

function monitor(c: PropCtx, x: number, y: number, z: number, ry = 0, w = 0.55, glow = 'screenBlue') {
  B(c, 'plasticBlack', 0.18, 0.02, 0.14, x, y, z, ry);
  B(c, 'plasticBlack', 0.04, 0.22, 0.03, x, y + 0.12, z - 0.03, ry);
  B(c, 'plasticBlack', w, w * 0.6, 0.03, x, y + 0.2 + w * 0.3, z, ry);
  const cs = Math.cos(ry), sn = Math.sin(ry);
  G(c, glow, new THREE.PlaneGeometry(w * 0.92, w * 0.52), x + sn * 0.017, y + 0.2 + w * 0.3, z + cs * 0.017, ry);
}

function papersOn(c: PropCtx, x: number, y: number, z: number, n: number, spread = 0.25) {
  for (let i = 0; i < n; i++) B(c, 'paper', 0.21, 0.002, 0.297, x + (c.rng.next() - 0.5) * spread, y + i * 0.002, z + (c.rng.next() - 0.5) * spread, c.rng.next() * 3);
}

function cup(c: PropCtx, x: number, y: number, z: number) {
  G(c, 'plasticWhite', cyl(0.04, 0.032, 0.11, 10), x, y + 0.055, z);
  G(c, 'c:#5a3a22:0.6', cyl(0.042, 0.042, 0.012, 10), x, y + 0.112, z);
}

// ---------- props ----------
export const PROPS: Record<string, PropFn> = {
  column(c) {
    const h = num(c, 'h', 7.2);
    B(c, 'stone', 0.9, h, 0.9, 0, h / 2, 0);
    B(c, 'stoneDark', 1.02, 0.14, 1.02, 0, 0.07, 0);
    B(c, 'ledWarm', 0.94, 0.05, 0.94, 0, 3.0, 0);
    B(c, 'metalDark', 0.94, 0.03, 0.94, 0, 3.06, 0);
    c.collide(0.95, h, 0.95, 0, h / 2, 0);
  },

  escalator(c) {
    const len = num(c, 'len', 7), rise = num(c, 'rise', 4.5);
    const L = Math.hypot(len, rise);
    const a = Math.atan2(rise, len);
    // corpo inclinado (sobe para -z)
    B(c, 'brushed', 1.1, 0.12, L, 0, rise / 2, 0, 0, a);
    for (let i = 0; i < 46; i++) {
      const t = (i + 0.5) / 46;
      B(c, 'metalDark', 1.0, 0.02, 0.05, 0, t * rise + 0.075, len / 2 - t * len, 0, a);
    }
    for (const sx of [-0.68, 0.68]) {
      B(c, 'paintWhite', 0.22, 1.0, L, sx, rise / 2 - 0.2, 0, 0, a);
      B(c, 'glass', 0.03, 0.85, L, sx, rise / 2 + 0.75, 0, 0, a);
      B(c, 'rubber', 0.1, 0.06, L + 0.3, sx, rise / 2 + 1.2, 0, 0, a);
    }
    B(c, 'paintWhite', 1.6, 0.4, L, 0, rise / 2 - 0.5, 0, 0, a);
    B(c, 'brushed', 1.3, 0.04, 1.4, 0, 0.02, len / 2 + 0.6);
    B(c, 'brushed', 1.3, 0.04, 1.2, 0, rise + 0.02, -len / 2 - 0.5);
    B(c, 'ledCool', 0.04, 0.03, L, -0.8, rise / 2 - 0.62, 0, 0, a);
    B(c, 'ledCool', 0.04, 0.03, L, 0.8, rise / 2 - 0.62, 0, 0, a);
    c.collide(1.7, 2.2, len, 0, 1.1, 0.4);
  },

  stanchions(c) {
    const len = num(c, 'len', 2.4);
    const n = len > 3 ? 3 : 2;
    const xs = Array.from({ length: n }, (_, i) => -len / 2 + (i * len) / (n - 1));
    for (const x of xs) {
      G(c, 'chrome', cyl(0.035, 0.035, 0.95, 10), x, 0.475, 0);
      G(c, 'chrome', cyl(0.17, 0.17, 0.03, 16), x, 0.015, 0);
      G(c, 'chrome', ico, x, 0.97, 0, 0, 0, 0, 0.05, 0.05, 0.05);
    }
    for (let i = 0; i < n - 1; i++) {
      const x0 = xs[i]!, x1 = xs[i + 1]!;
      const seg = 4;
      for (let k = 0; k < seg; k++) {
        const t0 = k / seg, t1 = (k + 1) / seg;
        const y0 = 0.86 - Math.sin(t0 * Math.PI) * 0.12, y1 = 0.86 - Math.sin(t1 * Math.PI) * 0.12;
        const xa = x0 + (x1 - x0) * t0, xb = x0 + (x1 - x0) * t1;
        B(c, 'velvet', Math.hypot(xb - xa, y1 - y0) + 0.01, 0.035, 0.035, (xa + xb) / 2, (y0 + y1) / 2, 0, 0, 0, Math.atan2(y1 - y0, xb - xa));
      }
    }
    const label = str(c, 'label', '');
    if (label) {
      const uv = c.atlas.alloc(512, 128, drawSign(label, '', { bg: '#111014', fg: '#ffb02e' }));
      B(c, 'metalDark', 0.62, 0.17, 0.02, 0, 0.62, 0.03);
      Q(c, 'atlasGlow', 0.6, 0.15, uv, 0, 0.62, 0.045);
    }
    c.collide(len, 1, 0.25, 0, 0.5, 0);
  },

  receptionDesk(c) {
    // frente (+z) para os visitantes; equipe atrás (−z)
    B(c, 'stoneDark', 8, 1.08, 0.9, 0, 0.54, 0);
    B(c, 'stone', 8.3, 0.06, 1.25, 0, 1.11, 0.12);
    B(c, 'stone', 8.3, 0.05, 0.4, 0, 1.2, 0.48);
    B(c, 'ledWarm', 8.0, 0.03, 0.02, 0, 0.1, 0.46);
    B(c, 'woodDark', 8, 0.04, 0.7, 0, 0.76, -0.75);
    for (const sx of [-4.1, 4.1]) B(c, 'stoneDark', 0.25, 1.08, 1.6, sx, 0.54, -0.3);
    const uv = c.atlas.alloc(1024, 200, drawSign('VÉRTICE', 'recepção', { fg: '#f3ece4' }));
    Q(c, 'atlasGlow', 2.4, 0.47, uv, 0, 0.62, 0.452);
    for (const x of [-2.6, 0, 2.6]) monitor(c, x, 0.78, -0.95, Math.PI);
    for (const x of [-2.6, 0, 2.6]) B(c, 'plasticBlack', 0.45, 0.02, 0.15, x, 0.79, -0.62);
    B(c, 'plasticBlack', 0.2, 0.08, 0.2, 1.4, 0.82, -0.6);
    papersOn(c, -1.2, 0.785, -0.7, 5);
    papersOn(c, 3.4, 1.14, 0.2, 3, 0.4);
    cup(c, 0.9, 0.78, -0.55);
    cup(c, -3.3, 1.14, 0.15);
    G(c, 'brass', cyl(0.05, 0.06, 0.05, 12), -0.6, 1.25, 0.45);
    c.collide(8.4, 1.15, 1.3, 0, 0.58, 0.05);
    c.collide(0.3, 1.1, 1.6, -4.1, 0.55, -0.3);
    c.collide(0.3, 1.1, 1.6, 4.1, 0.55, -0.3);
  },

  officeChair(c) {
    if (c.p.toppled) {
      const local = new THREE.Matrix4().multiplyMatrices(c.base, mat4(0, 0.28, 0, 0, -1.45));
      const sub: PropCtx = { ...c, base: local };
      chairOffice(sub, 0, 0, 0);
      return;
    }
    chairOffice(c, 0, 0, 0);
    c.collide(0.55, 0.9, 0.55, 0, 0.45, 0);
  },

  turnstiles(c) {
    const n = num(c, 'count', 7), gap = num(c, 'gap', 1.3);
    const flaps: THREE.Mesh[] = [];
    const glassMat = c.getMat('glass');
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * gap;
      B(c, 'brushed', 0.24, 0.98, 1.4, x, 0.49, 0);
      B(c, 'plasticBlack', 0.26, 0.03, 1.42, x, 0.995, 0);
      B(c, i % 2 ? 'ledGreen' : 'ledGreen', 0.04, 0.012, 1.1, x, 1.015, 0);
      B(c, 'plasticBlack', 0.18, 0.12, 0.02, x, 0.85, 0.72);
      B(c, 'ledRed', 0.06, 0.06, 0.005, x, 0.85, 0.732);
      c.collide(0.26, 1.0, 1.4, x, 0.5, 0);
      if (i < n - 1) {
        // abas de vidro do corredor (abertas = recolhidas ao longo do corpo); a arena fecha (giram 90°)
        for (const side of [-1, 1]) {
          const flap = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.9, 0.02), glassMat);
          flap.position.set(x + gap / 2 + side * (gap / 2 - 0.12) - (side > 0 ? 0 : 0), 0.62, 0);
          flap.userData.closedX = x + gap / 2 + side * 0.27;
          flap.userData.openX = x + gap / 2 + side * (gap / 2 - 0.14);
          flap.position.x = flap.userData.openX;
          flap.rotation.y = Math.PI / 2;
          flap.userData.side = side;
          flaps.push(flap);
          c.dyn(flap);
        }
      }
    }
    c.expose('turnstileFlaps', flaps);
  },

  glassPartition(c) {
    const len = num(c, 'len', 6);
    B(c, 'glass', len, 1.05, 0.02, 0, 0.62, 0);
    B(c, 'brushed', len, 0.08, 0.08, 0, 0.04, 0);
    B(c, 'chrome', len, 0.04, 0.05, 0, 1.16, 0);
    for (let x = -len / 2; x <= len / 2 + 0.01; x += 1.5) G(c, 'chrome', cyl(0.03, 0.03, 1.18, 8), x, 0.59, 0);
    c.collide(len, 1.2, 0.15, 0, 0.6, 0);
  },

  securityPodium(c) {
    B(c, 'stoneDark', 1.2, 1.05, 0.6, 0, 0.525, 0);
    B(c, 'stone', 1.3, 0.05, 0.75, 0, 1.075, 0.05);
    monitor(c, 0.2, 1.1, -0.1, Math.PI, 0.4);
    B(c, 'ledCool', 1.1, 0.02, 0.02, 0, 0.12, 0.31);
    const uv = c.atlas.alloc(512, 128, drawSign('CONTROLE DE ACESSO', '', { fg: '#cfe0ff' }));
    Q(c, 'atlasGlow', 1.0, 0.25, uv, 0, 0.7, 0.305);
    c.collide(1.3, 1.1, 0.75, 0, 0.55, 0);
  },

  elevatorBank(c) {
    const n = num(c, 'count', 4), sp = num(c, 'spacing', 4);
    B(c, 'stoneDark', n * sp + 1, 4.2, 0.06, 0, 2.1, 0.03);
    const floorUv = c.atlas.alloc(96, 64, (ctx, w, h) => {
      ctx.fillStyle = '#100a04';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff9a2e';
      ctx.font = `${h * 0.8}px "Barlow Condensed", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('T ▼', w / 2, h / 2);
    });
    const outUv = c.atlas.alloc(256, 340, (ctx, w, h) => {
      ctx.fillStyle = '#f4f1ea';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c8102e';
      ctx.font = `bold ${h * 0.16}px "Barlow Condensed", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('FORA DE', w / 2, h * 0.3);
      ctx.fillText('SERVIÇO', w / 2, h * 0.48);
      ctx.fillStyle = '#222';
      ctx.font = `${h * 0.07}px "Barlow Condensed", sans-serif`;
      ctx.fillText('elevadores travados', w / 2, h * 0.68);
      ctx.fillText('pela "administração"', w / 2, h * 0.78);
    });
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * sp;
      B(c, 'brushed', 0.14, 2.65, 0.12, x - 0.72, 1.325, 0.08);
      B(c, 'brushed', 0.14, 2.65, 0.12, x + 0.72, 1.325, 0.08);
      B(c, 'brushed', 1.58, 0.16, 0.12, x, 2.73, 0.08);
      B(c, 'brushed', 0.64, 2.5, 0.04, x - 0.325, 1.25, 0.08);
      B(c, 'brushed', 0.64, 2.5, 0.04, x + 0.325, 1.25, 0.08);
      B(c, 'plasticBlack', 0.012, 2.5, 0.045, x, 1.25, 0.082);
      B(c, 'screenDark', 0.5, 0.2, 0.03, x, 3.05, 0.075);
      Q(c, 'atlasGlow', 0.44, 0.16, floorUv, x, 3.05, 0.092);
      if (i % 2 === 0) Q(c, 'atlasLit', 0.42, 0.56, outUv, x - 0.32, 1.45, 0.105, 0.04);
      // painel de chamada
      B(c, 'brushed', 0.12, 0.3, 0.02, x + 1.15, 1.2, 0.07);
      G(c, 'ledWhite', cyl(0.025, 0.025, 0.01, 10), x + 1.15, 1.26, 0.085, 0, Math.PI / 2);
      G(c, 'ledAmber', cyl(0.025, 0.025, 0.01, 10), x + 1.15, 1.14, 0.085, 0, Math.PI / 2);
    }
  },

  logoSign(c) {
    const w = num(c, 'w', 9), y = num(c, 'y', 4.6);
    const uv = c.atlas.alloc(1600, 400, drawSign(str(c, 'text', 'VÉRTICE'), str(c, 'sub', ''), { fg: '#f6efe6' }));
    Q(c, 'atlasGlow', w, w / 4, uv, 0, y, 0.12);
    const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 0.3).multiplyScalar(0.5), transparent: true, opacity: 0.22, toneMapped: false, depthWrite: false });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.18, w / 3), glowMat);
    g.position.set(0, y, 0.1);
    c.dyn(g);
  },

  bench(c) {
    for (let i = 0; i < 4; i++) B(c, 'woodLight', 2.2, 0.04, 0.1, 0, 0.45, -0.18 + i * 0.12);
    for (const x of [-0.95, 0.95]) B(c, 'brushed', 0.06, 0.45, 0.46, x, 0.225, 0);
    c.collide(2.2, 0.5, 0.5, 0, 0.25, 0);
  },

  planterLong(c) {
    B(c, 'stone', 2.2, 0.6, 0.6, 0, 0.3, 0);
    B(c, 'soil', 2.1, 0.02, 0.5, 0, 0.6, 0);
    for (const x of [-0.7, 0, 0.7]) bush(c, x, 0.95, 0, 0.42);
    c.collide(2.2, 1.2, 0.6, 0, 0.6, 0);
  },

  directoryBoard(c) {
    B(c, 'stoneDark', 1.3, 2.0, 0.06, 0, 1.6, 0.03);
    const uv = c.atlas.alloc(390, 600, (ctx, w, h) => {
      ctx.fillStyle = '#121014';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffb02e';
      ctx.font = `${h * 0.08}px Anton, Impact, sans-serif`;
      ctx.fillText('ANDARES', 22, h * 0.12);
      const rows = [['9', 'Diretoria · Conselho'], ['5–8', 'Escritórios Vértice'], ['2–4', 'Open office · RH · TI'], ['T', 'Recepção · Cafeteria'], ['T', 'Auditório · Segurança']];
      ctx.font = `600 ${h * 0.045}px "Barlow Condensed", sans-serif`;
      rows.forEach(([f, t], i) => {
        ctx.fillStyle = '#f3ece4';
        ctx.fillText(f!, 22, h * (0.24 + i * 0.13));
        ctx.fillStyle = '#9b928a';
        ctx.fillText(t!, 100, h * (0.24 + i * 0.13));
      });
    });
    Q(c, 'atlasGlow', 1.17, 1.8, uv, 0, 1.6, 0.065);
  },

  sofa(c) {
    const m = str(c, 'mat', 'leatherBlack');
    B(c, m, 2.4, 0.4, 0.92, 0, 0.26, 0);
    B(c, m, 2.4, 0.55, 0.22, 0, 0.68, -0.36, 0, -0.1);
    for (const x of [-1.12, 1.12]) B(c, m, 0.2, 0.62, 0.92, x, 0.37, 0);
    for (const x of [-0.68, 0, 0.68]) B(c, m, 0.66, 0.13, 0.68, x, 0.52, 0.06);
    for (const x of [-1.1, 1.1]) for (const z of [-0.38, 0.38]) B(c, 'chrome', 0.05, 0.08, 0.05, x, 0.04, z);
    c.collide(2.45, 0.9, 0.95, 0, 0.45, 0);
  },

  armchair(c) {
    const m = 'leatherBrown';
    B(c, m, 0.9, 0.4, 0.85, 0, 0.26, 0);
    B(c, m, 0.9, 0.55, 0.2, 0, 0.68, -0.33, 0, -0.1);
    for (const x of [-0.42, 0.42]) B(c, m, 0.16, 0.6, 0.85, x, 0.36, 0);
    B(c, m, 0.6, 0.12, 0.62, 0, 0.52, 0.05);
    c.collide(0.95, 0.9, 0.9, 0, 0.45, 0);
  },

  coffeeTableGlass(c) {
    B(c, 'glassDark', 1.2, 0.02, 0.7, 0, 0.42, 0);
    for (const x of [-0.55, 0.55]) for (const z of [-0.3, 0.3]) B(c, 'chrome', 0.03, 0.41, 0.03, x, 0.205, z);
    B(c, 'chrome', 1.12, 0.02, 0.62, 0, 0.08, 0);
    for (let i = 0; i < 3; i++) B(c, i % 2 ? 'c:#c8553d:0.7' : 'c:#2b4f7a:0.7', 0.22, 0.01, 0.3, -0.3 + i * 0.05, 0.44 + i * 0.01, -0.05 + i * 0.04, 0.2 * i);
    cup(c, 0.3, 0.43, 0.1);
    c.collide(1.2, 0.45, 0.7, 0, 0.22, 0);
  },

  rug(c) {
    const w = num(c, 'w', 3), d = num(c, 'd', 2), col = str(c, 'color', '#5a2a26');
    B(c, `c:${col}:0.95`, w, 0.012, d, 0, 0.006, 0);
    B(c, 'c:#c9a46a:0.9', w - 0.3, 0.013, 0.05, 0, 0.007, d / 2 - 0.2);
    B(c, 'c:#c9a46a:0.9', w - 0.3, 0.013, 0.05, 0, 0.007, -d / 2 + 0.2);
  },

  tv(c) {
    const y = num(c, 'y', 2.4);
    const s = createNewsScreen();
    B(c, 'metalDark', 2.4, 1.38, 0.07, 0, y, 0.035);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.29), new THREE.MeshBasicMaterial({ map: s.texture, toneMapped: false }));
    scr.position.set(0, y, 0.075);
    c.dyn(scr);
    c.tick((dt) => s.update(dt));
  },

  floorLamp(c) {
    G(c, 'metalDark', cyl(0.18, 0.2, 0.03, 16), 0, 0.015, 0);
    G(c, 'brass', cyl(0.015, 0.015, 1.5, 8), 0, 0.76, 0);
    G(c, 'c:#e9dcc6:0.9', cyl(0.18, 0.24, 0.32, 16, true), 0, 1.6, 0);
    G(c, 'ledWarm', disc(0.17), 0, 1.47, 0, 0, Math.PI);
  },

  plantBig(c) {
    G(c, 'potDark', cyl(0.42, 0.33, 0.8, 16), 0, 0.4, 0);
    G(c, 'soil', disc(0.4), 0, 0.79, 0);
    for (let i = 0; i < 3; i++) B(c, 'c:#3b2a1a:0.9', 0.04, 0.7, 0.04, (c.rng.next() - 0.5) * 0.2, 1.1, (c.rng.next() - 0.5) * 0.2, 0, (c.rng.next() - 0.5) * 0.4);
    bush(c, 0, 1.45, 0, 0.62);
    bush(c, 0.25, 1.8, 0.1, 0.38);
    c.collide(0.85, 1.2, 0.85, 0, 0.6, 0);
  },

  buildingMap(c) {
    B(c, 'brushed', 0.06, 1.2, 0.06, 0, 0.6, -0.03);
    B(c, 'metalDark', 0.4, 0.03, 0.3, 0, 0.015, -0.03);
    B(c, 'metalDark', 1.1, 0.8, 0.04, 0, 1.45, 0);
    const level = c.p.level as { rooms: { name: string; rect: number[]; closed?: boolean }[]; spawn: { x: number; z: number } } | undefined;
    const uv = c.atlas.alloc(660, 480, (ctx, w, h) => {
      ctx.fillStyle = '#0f1218';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffb02e';
      ctx.font = `${h * 0.07}px Anton, Impact, sans-serif`;
      ctx.fillText('TÉRREO — VOCÊ ESTÁ AQUI', 16, h * 0.09);
      if (!level) return;
      const xs = level.rooms.flatMap((r) => [r.rect[0]!, r.rect[2]!]);
      const zs = level.rooms.flatMap((r) => [r.rect[1]!, r.rect[3]!]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      const sc = Math.min((w - 40) / (x1 - x0), (h * 0.84 - 20) / (z1 - z0));
      const ox = 20, oy = h * 0.14;
      for (const r of level.rooms) {
        const [a, b, cc, d] = r.rect as [number, number, number, number];
        ctx.fillStyle = r.closed ? '#2a1418' : '#1d2836';
        ctx.strokeStyle = '#6f87a8';
        ctx.lineWidth = 2;
        ctx.fillRect(ox + (a - x0) * sc, oy + (b - z0) * sc, (cc - a) * sc, (d - b) * sc);
        ctx.strokeRect(ox + (a - x0) * sc, oy + (b - z0) * sc, (cc - a) * sc, (d - b) * sc);
        ctx.fillStyle = '#c9d6e8';
        ctx.font = `600 ${Math.max(9, Math.min(16, (cc - a) * sc * 0.12))}px "Barlow Condensed", sans-serif`;
        ctx.fillText(r.name.toUpperCase(), ox + (a - x0) * sc + 4, oy + ((b + d) / 2 - z0) * sc);
      }
      ctx.fillStyle = '#ff2d43';
      ctx.beginPath();
      ctx.arc(ox + (level.spawn.x - x0) * sc, oy + (level.spawn.z - 1.5 - z0) * sc, 7, 0, Math.PI * 2);
      ctx.fill();
    });
    Q(c, 'atlasGlow', 1.04, 0.756, uv, 0, 1.45, 0.022);
    c.collide(0.4, 1.9, 0.3, 0, 0.95, 0);
  },

  waterCooler(c) {
    B(c, 'plasticWhite', 0.32, 0.95, 0.32, 0, 0.475, 0);
    G(c, 'glass', cyl(0.13, 0.13, 0.4, 14), 0, 1.15, 0);
    G(c, 'c:#5fa8e0:0.1', cyl(0.12, 0.12, 0.3, 14), 0, 1.1, 0);
    B(c, 'plasticRed', 0.04, 0.05, 0.04, -0.06, 0.8, 0.17);
    B(c, 'plasticBlue', 0.04, 0.05, 0.04, 0.06, 0.8, 0.17);
    c.collide(0.36, 1.3, 0.36, 0, 0.65, 0);
  },

  trashBin(c) {
    G(c, 'brushed', cyl(0.19, 0.17, 0.62, 14), 0, 0.31, 0);
    G(c, 'plasticBlack', cyl(0.2, 0.2, 0.04, 14), 0, 0.64, 0);
    c.collide(0.4, 0.66, 0.4, 0, 0.33, 0);
  },

  extinguisher(c) {
    G(c, 'plasticRed', cyl(0.085, 0.085, 0.52, 12), 0, 1.0, 0.11);
    G(c, 'plasticBlack', cyl(0.03, 0.03, 0.1, 8), 0, 1.31, 0.11);
    B(c, 'plasticBlack', 0.02, 0.35, 0.02, 0.07, 1.05, 0.2);
    B(c, 'metalDark', 0.14, 0.05, 0.08, 0, 0.92, 0.04);
    const uv = c.atlas.alloc(240, 80, drawSign('EXTINTOR', '', { bg: '#c8102e', fg: '#fff' }));
    Q(c, 'atlasLit', 0.3, 0.1, uv, 0, 1.55, 0.01);
  },

  exitSign(c) {
    const y = num(c, 'y', 3);
    B(c, 'plasticWhite', 0.5, 0.2, 0.06, 0, y, 0.03);
    const uv = c.atlas.alloc(300, 120, (ctx, w, h) => {
      ctx.fillStyle = '#0a8a3c';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#fff';
      ctx.font = `${h * 0.6}px Anton, Impact, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText('SAÍDA', w * 0.34, h * 0.55);
      ctx.fillText('←', w * 0.06, h * 0.55);
    });
    Q(c, 'atlasGlow', 0.46, 0.18, uv, 0, y, 0.065);
  },

  wallSign(c) {
    const w = num(c, 'w', 3), y = num(c, 'y', 3);
    const h = w / 4;
    B(c, 'stoneDark', w + 0.1, h + 0.06, 0.04, 0, y, 0.02);
    const uv = c.atlas.alloc(Math.min(1400, 280 * w), Math.min(350, 70 * w), drawSign(str(c, 'text', ''), str(c, 'sub', '')));
    Q(c, 'atlasGlow', w, h, uv, 0, y, 0.045);
    B(c, 'ledWarm', w * 0.8, 0.012, 0.012, 0, y - h / 2 - 0.02, 0.04);
  },

  eventStand(c) {
    const uv = c.atlas.alloc(400, 600, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#0b1a33');
      g.addColorStop(1, '#3a0d18');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffb02e';
      ctx.font = `${h * 0.075}px Anton, Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('CONVENÇÃO', w / 2, h * 0.14);
      ctx.fillText('VÉRTICE 2026', w / 2, h * 0.23);
      ctx.fillStyle = '#f3ece4';
      ctx.font = `600 ${h * 0.045}px "Barlow Condensed", sans-serif`;
      ctx.fillText('palestra de abertura', w / 2, h * 0.36);
      ctx.font = `${h * 0.1}px Anton, Impact, sans-serif`;
      ctx.fillText('CLÓVIS B.', w / 2, h * 0.52);
      ctx.font = `600 ${h * 0.04}px "Barlow Condensed", sans-serif`;
      ctx.fillStyle = '#9b928a';
      ctx.fillText('"Sorria: o futuro', w / 2, h * 0.64);
      ctx.fillText('é nosso."', w / 2, h * 0.69);
      ctx.beginPath();
      ctx.fillStyle = '#f3ece4';
      ctx.arc(w / 2, h * 0.84, h * 0.07, 0, Math.PI);
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#f3ece4';
      ctx.stroke();
    });
    B(c, 'metalDark', 0.72, 1.06, 0.03, 0, 1.0, 0, 0, -0.08);
    Q(c, 'atlasLit', 0.68, 1.02, uv, 0, 1.0, 0.02, 0, -0.08);
    B(c, 'metalDark', 0.04, 1.1, 0.04, 0, 0.55, -0.3, 0, 0.35);
    c.collide(0.75, 1.5, 0.4, 0, 0.75, -0.1);
  },

  frame(c) {
    const w = num(c, 'w', 1.4), h = num(c, 'h', 1), y = num(c, 'y', 2.2);
    B(c, 'woodDark', w + 0.1, h + 0.1, 0.04, 0, y, 0.02);
    const uv = c.atlas.alloc(w * 180, h * 180, drawArt(num(c, 'seed', 1)));
    Q(c, 'atlasLit', w, h, uv, 0, y, 0.042);
  },

  suitcase(c) {
    B(c, 'c:#1f3b5a:0.4', 0.45, 0.68, 0.26, 0, 0.36, 0);
    B(c, 'plasticBlack', 0.2, 0.03, 0.03, 0, 0.72, 0);
    for (const x of [-0.18, 0.18]) G(c, 'rubber', cyl(0.03, 0.03, 0.03, 8), x, 0.03, -0.1, 0, 0, Math.PI / 2);
    c.collide(0.45, 0.72, 0.28, 0, 0.36, 0);
  },

  backpack(c) {
    B(c, 'c:#2d3a2a:0.85', 0.34, 0.42, 0.2, 0, 0.21, 0, 0, -0.2);
    B(c, 'c:#2d3a2a:0.85', 0.28, 0.16, 0.08, 0, 0.16, 0.13, 0, -0.2);
  },

  briefcase(c) {
    if (c.p.open) {
      B(c, 'leatherBrown', 0.45, 0.06, 0.33, 0, 0.03, 0);
      B(c, 'leatherBrown', 0.45, 0.33, 0.04, 0, 0.18, -0.17, 0, 0.3);
      papersOn(c, 0.4, 0.002, 0.3, 4, 0.5);
    } else B(c, 'leatherBrown', 0.45, 0.33, 0.1, 0, 0.17, 0);
  },

  cone(c) {
    B(c, 'plasticBlack', 0.36, 0.03, 0.36, 0, 0.015, 0);
    G(c, 'plasticOrange', cyl(0.025, 0.15, 0.6, 14), 0, 0.33, 0);
    G(c, 'plasticWhite', cyl(0.08, 0.1, 0.08, 14), 0, 0.38, 0);
    c.collide(0.36, 0.6, 0.36, 0, 0.3, 0);
  },

  cautionTape(c) {
    const len = num(c, 'len', 4);
    const uv = c.atlas.alloc(1024, 48, (ctx, w, h) => {
      ctx.fillStyle = '#f5c400';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#111';
      for (let x = -h; x < w; x += h * 1.6) {
        ctx.beginPath();
        ctx.moveTo(x, h);
        ctx.lineTo(x + h * 0.6, 0);
        ctx.lineTo(x + h * 1.2, 0);
        ctx.lineTo(x + h * 0.6, h);
        ctx.fill();
      }
      ctx.fillStyle = '#111';
      ctx.font = `bold ${h * 0.6}px "Barlow Condensed", sans-serif`;
    });
    for (const k of [0, 1]) {
      const sag = 0.06;
      Q(c, 'atlasLit', len / 2 + 0.02, 0.07, uv, (k ? 1 : -1) * len / 4, 0.62 - sag / 2, 0, 0, 0);
      Q(c, 'atlasLit', len / 2 + 0.02, 0.07, uv, (k ? 1 : -1) * len / 4, 0.62 - sag / 2, 0, Math.PI, 0);
    }
  },

  emergencyLight(c) {
    const y = num(c, 'y', 1.2);
    B(c, 'plasticBlack', 0.16, 0.06, 0.16, 0, y, 0);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.08, 0.06).multiplyScalar(2.6), toneMapped: false }));
    beacon.position.set(0, y + 0.09, 0);
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.05), transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.8, 16, 1, true).rotateZ(Math.PI / 2).translate(0.9, 0, 0), beamMat);
    beam.position.set(0, y + 0.09, 0);
    c.dyn(beacon);
    c.dyn(beam);
    c.tick((dt, t) => {
      beam.rotation.y = t * 4.2;
      beacon.material.color.setRGB(1, 0.08, 0.06).multiplyScalar(1.6 + Math.max(0, Math.sin(t * 8.4)) * 1.6);
    });
  },

  cctvWall(c) {
    const cols = num(c, 'cols', 4), rows = num(c, 'rows', 3);
    const mw = 0.56, mh = 0.34;
    const W = cols * mw + 0.1, H = rows * mh + 0.1;
    B(c, 'metalDark', W + 0.1, H + 0.1, 0.12, 0, 1.75, 0.06);
    const cv = document.createElement('canvas');
    cv.width = 128 * cols;
    cv.height = 80 * rows;
    const ctx = cv.getContext('2d')!;
    const texture = new THREE.CanvasTexture(cv);
    texture.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(cols * mw, rows * mh), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) }));
    scr.position.set(0, 1.75, 0.125);
    c.dyn(scr);
    const rng = new Rng(77);
    const scenes = Array.from({ length: cols * rows }, () => Array.from({ length: 5 }, () => [rng.next(), rng.next(), rng.next() * 0.4 + 0.1, rng.next() * 0.5 + 0.2]));
    let acc = 1;
    let t0 = 0;
    const draw = (t: number) => {
      for (let i = 0; i < cols * rows; i++) {
        const x = (i % cols) * 128, y = Math.floor(i / cols) * 80;
        const dead = i === 5 || i === 9;
        ctx.fillStyle = dead ? '#0a0a0c' : '#1a2420';
        ctx.fillRect(x, y, 128, 80);
        if (dead) {
          for (let k = 0; k < 160; k++) {
            ctx.fillStyle = `rgba(200,200,200,${rng.next() * 0.5})`;
            ctx.fillRect(x + rng.next() * 128, y + rng.next() * 80, 2, 1);
          }
          ctx.fillStyle = '#ff2d43';
          ctx.font = 'bold 12px monospace';
          ctx.fillText('SEM SINAL', x + 30, y + 44);
        } else {
          for (const [a, b, w, h] of scenes[i]!) {
            ctx.fillStyle = 'rgba(140,170,150,0.35)';
            ctx.fillRect(x + a! * 110, y + 20 + b! * 40, w! * 60, h! * 40);
          }
          // vulto andando
          const px = x + ((t * 18 + i * 30) % 128);
          ctx.fillStyle = 'rgba(20,24,22,0.9)';
          ctx.fillRect(px, y + 38, 6, 22);
          ctx.fillRect(px + 1, y + 32, 4, 6);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.font = '9px monospace';
        ctx.fillText(`CAM ${String(i + 1).padStart(2, '0')}  21:4${Math.floor(t / 10) % 10}:${String(Math.floor(t) % 60).padStart(2, '0')}`, x + 4, y + 10);
        ctx.strokeStyle = '#000';
        ctx.strokeRect(x + 0.5, y + 0.5, 127, 79);
        ctx.fillStyle = `rgba(255,255,255,${0.03 + rng.next() * 0.03})`;
        ctx.fillRect(x, y + ((t * 40 + i * 13) % 80), 128, 2);
      }
      texture.needsUpdate = true;
    };
    draw(0);
    c.tick((dt) => {
      t0 += dt;
      acc += dt;
      if (acc > 0.25) {
        acc = 0;
        draw(t0);
      }
    });
  },

  officeDesk(c) {
    B(c, 'woodLight', 1.6, 0.04, 0.8, 0, 0.74, 0);
    for (const x of [-0.76, 0.76]) B(c, 'metalDark', 0.05, 0.72, 0.7, x, 0.36, 0);
    B(c, 'metalDark', 1.5, 0.4, 0.02, 0, 0.5, -0.36);
    const n = num(c, 'monitors', 1);
    for (let i = 0; i < n; i++) monitor(c, (i - (n - 1) / 2) * 0.62, 0.76, -0.22, 0, 0.52);
    B(c, 'plasticBlack', 0.44, 0.02, 0.14, 0, 0.77, 0.12);
    B(c, 'plasticBlack', 0.06, 0.02, 0.1, 0.32, 0.77, 0.14);
    cup(c, -0.6, 0.76, 0.15);
    papersOn(c, 0.55, 0.762, 0.1, 4);
    c.collide(1.6, 0.8, 0.8, 0, 0.4, 0);
  },

  cardTable(c) {
    G(c, 'woodDark', cyl(0.55, 0.55, 0.04, 20), 0, 0.72, 0);
    G(c, 'c:#1f5a32:0.95', cyl(0.5, 0.5, 0.005, 20), 0, 0.743, 0);
    G(c, 'metalDark', cyl(0.05, 0.05, 0.7, 8), 0, 0.36, 0);
    G(c, 'metalDark', cyl(0.3, 0.3, 0.03, 16), 0, 0.015, 0);
    for (let i = 0; i < 12; i++) B(c, 'paper', 0.06, 0.002, 0.09, (c.rng.next() - 0.5) * 0.6, 0.747 + i * 0.001, (c.rng.next() - 0.5) * 0.6, c.rng.next() * 3);
    for (let i = 0; i < 10; i++) G(c, i % 3 === 0 ? 'plasticRed' : i % 3 === 1 ? 'plasticBlue' : 'plasticWhite', cyl(0.02, 0.02, 0.008, 10), (c.rng.next() - 0.5) * 0.4, 0.75 + (i % 4) * 0.008, (c.rng.next() - 0.5) * 0.4);
    for (const [x, z] of [[0.25, 0.3], [-0.3, -0.2]]) G(c, 'c:#3a2410:0.2', cyl(0.03, 0.035, 0.22, 10), x!, 0.86, z!);
    c.collide(1.1, 0.75, 1.1, 0, 0.37, 0);
  },

  lockers(c) {
    const n = num(c, 'count', 4);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.42;
      B(c, 'paintGrey', 0.4, 1.9, 0.48, x, 0.95, 0.24);
      if (i === 2) {
        B(c, 'paintGrey', 0.02, 1.8, 0.38, x - 0.2 + 0.19 * Math.sin(1.1), 0.95, 0.48 + 0.19 * Math.cos(1.1), 1.1);
        B(c, 'c:#202226:0.8', 0.36, 1.8, 0.02, x, 0.95, 0.47);
        B(c, 'c:#7a1c1c:0.7', 0.3, 0.4, 0.2, x, 0.45, 0.3);
      } else {
        for (let k = 0; k < 4; k++) B(c, 'metalDark', 0.24, 0.015, 0.01, x, 1.65 - k * 0.04, 0.485);
        B(c, 'chrome', 0.03, 0.12, 0.02, x + 0.14, 1.0, 0.49);
      }
    }
    c.collide(n * 0.42, 1.9, 0.5, 0, 0.95, 0.25);
  },

  whiteboard(c) {
    const y = num(c, 'y', 1.7);
    B(c, 'brushed', 1.66, 1.06, 0.03, 0, y, 0.015);
    const uv = c.atlas.alloc(500, 320, (ctx, w, h) => {
      ctx.fillStyle = '#f4f4f0';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#1a3a8a';
      ctx.fillStyle = '#1a3a8a';
      ctx.lineWidth = 3;
      ctx.font = `${h * 0.09}px "Comic Sans MS", "Barlow Condensed", sans-serif`;
      ctx.fillText('PLANO:', 20, h * 0.14);
      ctx.fillText('1) render a recepção ✓', 20, h * 0.3);
      ctx.fillText('2) travar elevadores ✓', 20, h * 0.45);
      ctx.fillText('3) cofre no 9º andar', 20, h * 0.6);
      ctx.fillStyle = '#c8102e';
      ctx.fillText('4) e se aparecer um tiozão??', 20, h * 0.78);
      ctx.strokeStyle = '#c8102e';
      ctx.beginPath();
      ctx.ellipse(w * 0.7, h * 0.76, w * 0.3, h * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    Q(c, 'atlasLit', 1.6, 1.0, uv, 0, y, 0.032);
    B(c, 'brushed', 1.4, 0.03, 0.08, 0, y - 0.56, 0.05);
  },

  coffeeMaker(c) {
    B(c, 'woodLight', 0.9, 0.9, 0.45, 0, 0.45, 0);
    B(c, 'plasticBlack', 0.25, 0.35, 0.25, -0.2, 1.075, 0);
    G(c, 'glassDark', cyl(0.07, 0.08, 0.16, 12), -0.2, 0.98, 0.06);
    for (let i = 0; i < 3; i++) cup(c, 0.12 + i * 0.1, 0.9, 0.08);
    c.collide(0.9, 1.2, 0.45, 0, 0.6, 0);
  },

  cafeCounter(c) {
    const len = num(c, 'len', 7);
    B(c, 'woodDark', len, 1.0, 0.75, 0, 0.5, 0);
    for (let x = -len / 2 + 0.1; x < len / 2; x += 0.12) B(c, 'woodLight', 0.06, 0.92, 0.02, x, 0.5, 0.385);
    B(c, 'stone', len + 0.1, 0.05, 0.85, 0, 1.025, 0.02);
    // vitrine de doces
    B(c, 'glass', 1.4, 0.4, 0.55, -len / 2 + 1.2, 1.25, 0);
    for (let i = 0; i < 8; i++) G(c, i % 2 ? 'c:#d9a441:0.7' : 'c:#b5651d:0.7', ico, -len / 2 + 0.65 + (i % 4) * 0.33, 1.1, -0.12 + Math.floor(i / 4) * 0.22, 0, 0, 0, 0.06, 0.05, 0.06);
    // máquina de espresso
    B(c, 'chrome', 0.7, 0.45, 0.45, 0.6, 1.275, -0.1);
    B(c, 'plasticBlack', 0.6, 0.06, 0.3, 0.6, 1.08, 0.06);
    for (const x of [0.4, 0.8]) G(c, 'metalDark', cyl(0.035, 0.035, 0.12, 8), x, 1.15, 0.12);
    G(c, 'plasticWhite', cyl(0.05, 0.04, 0.3, 10), 1.2, 1.2, -0.15);
    B(c, 'plasticBlack', 0.4, 0.25, 0.3, len / 2 - 0.6, 1.17, 0);
    for (let i = 0; i < 5; i++) cup(c, -0.4 + i * 0.12, 1.05, 0.25);
    // balcão de trás (contra a parede)
    B(c, 'paintWhite', len, 0.9, 0.6, 0, 0.45, -1.05);
    B(c, 'stone', len, 0.04, 0.62, 0, 0.92, -1.05);
    B(c, 'brushed', 0.8, 1.9, 0.62, len / 2 - 0.5, 0.95, -1.05);
    for (let i = 0; i < 12; i++) G(c, i % 3 ? 'c:#7a1c1c:0.2' : 'c:#2c5a2c:0.2', cyl(0.035, 0.035, 0.28, 8), -len / 2 + 0.5 + i * 0.22, 1.08, -1.15);
    for (let k = 0; k < 2; k++) B(c, 'woodDark', len * 0.7, 0.03, 0.25, -len * 0.12, 1.6 + k * 0.4, -1.22);
    c.collide(len, 1.05, 0.85, 0, 0.52, 0);
    c.collide(len, 1.0, 0.62, 0, 0.5, -1.05);
  },

  menuBoard(c) {
    const y = num(c, 'y', 2.5);
    B(c, 'woodDark', 2.5, 1.3, 0.04, 0, y, 0.02);
    const uv = c.atlas.alloc(720, 360, (ctx, w, h) => {
      ctx.fillStyle = '#1c211e';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f3ece4';
      ctx.font = `${h * 0.12}px Anton, Impact, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('CARDÁPIO', w / 2, h * 0.16);
      const items = [['Café expresso', '6'], ['Pão de queijo', '5'], ['Coxinha', '7'], ['Misto quente', '12'], ['Suco de laranja', '9'], ['Café do Márcio (sem açúcar)', '0']];
      ctx.font = `500 ${h * 0.065}px "Barlow Condensed", sans-serif`;
      items.forEach(([n, p], i) => {
        ctx.textAlign = 'left';
        ctx.fillStyle = i === items.length - 1 ? '#ffb02e' : '#e8e4da';
        ctx.fillText(n!, w * 0.08, h * (0.32 + i * 0.11));
        ctx.textAlign = 'right';
        ctx.fillText(`R$ ${p}`, w * 0.92, h * (0.32 + i * 0.11));
      });
    });
    Q(c, 'atlasLit', 2.4, 1.2, uv, 0, y, 0.042);
  },

  cafeTable(c) {
    if (c.p.toppled) {
      const local = new THREE.Matrix4().multiplyMatrices(c.base, mat4(0, 0.4, 0, 0.6, 1.5));
      c.batch.add('stone', cyl(0.42, 0.42, 0.04, 20), local);
      c.batch.add('metalDark', cyl(0.04, 0.04, 0.72, 8), new THREE.Matrix4().multiplyMatrices(local, mat4(0, -0.36, 0)));
      chairCafe(c, 0.9, 0.5, 2.0, true);
      chairCafe(c, -0.7, -0.8, -0.6, true);
      chairCafe(c, -0.9, 0.6, 1.0);
      c.collide(0.9, 0.85, 0.9, 0, 0.42, 0);
      return;
    }
    G(c, 'stone', cyl(0.42, 0.42, 0.04, 20), 0, 0.74, 0);
    G(c, 'metalDark', cyl(0.04, 0.04, 0.72, 8), 0, 0.36, 0);
    G(c, 'metalDark', cyl(0.25, 0.25, 0.03, 16), 0, 0.015, 0);
    // cadeiras em volta, viradas para o centro
    chairCafe(c, 0, 0.8, Math.PI);
    chairCafe(c, 0, -0.8, 0);
    chairCafe(c, 0.8, 0, -Math.PI / 2);
    chairCafe(c, -0.8, 0, Math.PI / 2);
    if (c.rng.next() < 0.7) cup(c, 0.12, 0.76, -0.05);
    if (c.rng.next() < 0.5) B(c, 'c:#d9a441:0.7', 0.16, 0.03, 0.16, -0.12, 0.775, 0.08);
    c.collide(0.85, 0.78, 0.85, 0, 0.39, 0);
  },

  barStool(c) {
    if (c.p.toppled) {
      const l = new THREE.Matrix4().multiplyMatrices(c.base, mat4(0, 0.18, 0, 0.8, 1.5));
      c.batch.add('metalDark', cyl(0.03, 0.03, 0.75, 8), l);
      c.batch.add('leatherBlack', cyl(0.18, 0.18, 0.07, 14), new THREE.Matrix4().multiplyMatrices(l, mat4(0, 0.4, 0)));
      return;
    }
    G(c, 'metalDark', cyl(0.2, 0.2, 0.02, 14), 0, 0.01, 0);
    G(c, 'metalDark', cyl(0.03, 0.03, 0.75, 8), 0, 0.38, 0);
    G(c, 'leatherBlack', cyl(0.18, 0.18, 0.07, 14), 0, 0.78, 0);
    c.collide(0.4, 0.8, 0.4, 0, 0.4, 0);
  },

  fluorescent(c) {
    const len = num(c, 'len', 2.4), y = c.roomHeight - 0.04;
    B(c, 'paintWhite', len, 0.06, 0.28, 0, y, 0);
    if (c.p.flicker) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.98, 0.94).multiplyScalar(2.6), toneMapped: false });
      const tube = new THREE.Mesh(new THREE.BoxGeometry(len - 0.1, 0.03, 0.12), mat);
      tube.position.set(0, y - 0.04, 0);
      c.dyn(tube);
      c.tick((_dt, t) => {
        const on = Math.sin(t * 23) + Math.sin(t * 7.1) > -0.6 || Math.sin(t * 1.3) > 0.7;
        mat.color.setRGB(1, 0.98, 0.94).multiplyScalar(on ? 2.6 : 0.15);
      });
    } else B(c, 'ledWhite', len - 0.1, 0.03, 0.12, 0, y - 0.04, 0);
  },

  cartMail(c) {
    B(c, 'brushed', 0.9, 0.04, 0.55, 0, 0.35, 0);
    B(c, 'brushed', 0.9, 0.04, 0.55, 0, 0.8, 0);
    for (const x of [-0.42, 0.42]) for (const z of [-0.25, 0.25]) B(c, 'brushed', 0.03, 0.8, 0.03, x, 0.4, z);
    for (const x of [-0.4, 0.4]) for (const z of [-0.22, 0.22]) G(c, 'rubber', cyl(0.05, 0.05, 0.04, 10), x, 0.05, z, 0, 0, Math.PI / 2);
    B(c, 'plasticBlue', 0.8, 0.28, 0.45, 0, 0.98, 0);
    for (let i = 0; i < 8; i++) B(c, 'c:#e8dcc0:0.9', 0.24, 0.005, 0.12, (c.rng.next() - 0.5) * 0.6, 1.13 + i * 0.006, (c.rng.next() - 0.5) * 0.3, c.rng.next() * 3);
    c.collide(0.95, 1.1, 0.6, 0, 0.55, 0);
  },

  boxes(c) {
    let y = 0;
    let maxW = 0;
    const n = 3 + Math.floor(c.rng.next() * 4);
    for (let i = 0; i < n; i++) {
      const w = 0.35 + c.rng.next() * 0.35, h = 0.25 + c.rng.next() * 0.3, d = 0.3 + c.rng.next() * 0.3;
      const ox = i < 3 ? (i - 1) * 0.55 : (c.rng.next() - 0.5) * 0.5;
      if (i >= 3) y = 0.45;
      B(c, 'cardboard', w, h, d, ox, (i >= 3 ? y : 0) + h / 2, (c.rng.next() - 0.5) * 0.2, (c.rng.next() - 0.5) * 0.5);
      maxW = Math.max(maxW, Math.abs(ox) + w / 2);
    }
    c.collide(maxW * 2, 0.9, 0.7, 0, 0.45, 0);
  },

  fireHose(c) {
    B(c, 'plasticRed', 0.7, 0.9, 0.22, 0, 1.2, 0.11);
    B(c, 'glass', 0.62, 0.82, 0.02, 0, 1.2, 0.225);
    G(c, 'c:#e8e0c8:0.8', new THREE.TorusGeometry(0.2, 0.05, 8, 18), 0, 1.2, 0.12);
    const uv = c.atlas.alloc(256, 80, drawSign('HIDRANTE', '', { bg: '#c8102e', fg: '#fff' }));
    Q(c, 'atlasLit', 0.5, 0.15, uv, 0, 1.78, 0.01);
  },

  mailCubbies(c) {
    const len = num(c, 'len', 4);
    B(c, 'woodLight', len, 1.9, 0.4, 0, 0.95, 0.2);
    const cols = Math.floor(len / 0.32), rows = 5;
    for (let i = 0; i <= cols; i++) B(c, 'woodDark', 0.02, 1.5, 0.38, -len / 2 + 0.05 + i * ((len - 0.1) / cols), 1.1, 0.21);
    for (let k = 0; k <= rows; k++) B(c, 'woodDark', len - 0.1, 0.02, 0.38, 0, 0.35 + k * 0.3, 0.21);
    for (let i = 0; i < cols; i++) for (let k = 0; k < rows; k++) if (c.rng.next() < 0.6) B(c, 'c:#ece4d2:0.9', 0.22, 0.12, 0.01, -len / 2 + 0.2 + i * ((len - 0.1) / cols), 0.42 + k * 0.3, 0.32, 0, -0.2);
    c.collide(len, 1.9, 0.42, 0, 0.95, 0.2);
  },

  sortingTable(c) {
    B(c, 'woodLight', 2.4, 0.05, 1.1, 0, 0.88, 0);
    for (const x of [-1.15, 1.15]) for (const z of [-0.5, 0.5]) B(c, 'metalDark', 0.05, 0.86, 0.05, x, 0.43, z);
    for (let i = 0; i < 22; i++) B(c, i % 4 ? 'c:#ece4d2:0.9' : 'c:#c9b28a:0.9', 0.24, 0.006, 0.12, (c.rng.next() - 0.5) * 2.0, 0.91 + (i % 5) * 0.006, (c.rng.next() - 0.5) * 0.9, c.rng.next() * 3);
    B(c, 'cardboard', 0.4, 0.3, 0.3, 0.8, 1.06, -0.2);
    B(c, 'brushed', 0.3, 0.06, 0.3, -0.9, 0.94, 0.2);
    c.collide(2.4, 0.95, 1.1, 0, 0.47, 0);
  },

  stalls(c) {
    const n = num(c, 'count', 3), w = num(c, 'width', 1.2);
    const d = 1.5;
    for (let i = 0; i <= n; i++) B(c, 'plasticGrey', 0.03, 1.9, d, -n * w / 2 + i * w, 1.05, d / 2);
    for (let i = 0; i < n; i++) {
      const x = -n * w / 2 + (i + 0.5) * w;
      // vaso
      B(c, 'ceramic', 0.38, 0.4, 0.5, x, 0.2, 0.35);
      B(c, 'ceramic', 0.4, 0.4, 0.15, x, 0.6, 0.08);
      // porta (a primeira entreaberta)
      if (i === 0) B(c, 'plasticGrey', 0.03, 1.7, w - 0.1, x - w / 2 + 0.05 + (w - 0.1) / 2 * Math.cos(1.0), 1.0, d + (w - 0.1) / 2 * Math.sin(1.0), Math.PI / 2 - 1.0);
      else B(c, 'plasticGrey', w - 0.08, 1.7, 0.03, x, 1.0, d);
      c.collide(0.05, 2, d, -n * w / 2 + i * w, 1, d / 2);
      if (i > 0) c.collide(w, 2, 0.05, x, 1, d);
    }
    c.collide(0.05, 2, d, n * w / 2, 1, d / 2);
  },

  sinkCounter(c) {
    const n = num(c, 'count', 2);
    const len = n * 0.8;
    B(c, 'stoneDark', len, 0.12, 0.55, 0, 0.85, 0.27);
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * 0.8;
      G(c, 'ceramic', cyl(0.2, 0.15, 0.12, 16), x, 0.86, 0.3);
      B(c, 'chrome', 0.03, 0.18, 0.03, x, 1.0, 0.08);
      B(c, 'chrome', 0.03, 0.03, 0.14, x, 1.08, 0.14);
    }
    B(c, 'mirror', len, 1.0, 0.02, 0, 1.65, 0.012);
    c.collide(len, 0.95, 0.55, 0, 0.47, 0.27);
  },

  handDryer(c) {
    const y = num(c, 'y', 1.3);
    B(c, 'plasticWhite', 0.3, 0.32, 0.18, 0, y, 0.09);
    B(c, 'chrome', 0.12, 0.04, 0.08, 0, y - 0.18, 0.12);
  },

  metalShelf(c) {
    const W = 1.8, H = 2.0, D = 0.5;
    for (const x of [-W / 2, W / 2]) for (const z of [0.02, D - 0.02]) B(c, 'paintGrey', 0.04, H, 0.04, x, H / 2, z);
    for (let k = 0; k < 4; k++) {
      const y = 0.15 + k * 0.6;
      B(c, 'paintGrey', W, 0.03, D, 0, y, D / 2);
      let x = -W / 2 + 0.1;
      while (x < W / 2 - 0.25) {
        const r = c.rng.next();
        if (r < 0.45) {
          const w = 0.25 + c.rng.next() * 0.25;
          B(c, 'cardboard', w, 0.2 + c.rng.next() * 0.2, 0.35, x + w / 2, y + 0.13, D / 2);
          x += w + 0.05;
        } else if (r < 0.7) {
          G(c, r < 0.58 ? 'plasticBlue' : 'plasticYellow', cyl(0.07, 0.08, 0.25, 10), x + 0.08, y + 0.14, D / 2);
          x += 0.2;
        } else if (r < 0.85) {
          G(c, 'c:#c0c4c8:0.4', cyl(0.12, 0.12, 0.2, 14), x + 0.12, y + 0.12, D / 2);
          x += 0.28;
        } else x += 0.25;
      }
    }
    c.collide(W, H, D, 0, H / 2, D / 2);
  },

  cleaningCart(c) {
    B(c, 'plasticYellow', 0.7, 0.45, 0.45, 0, 0.35, 0);
    G(c, 'plasticYellow', cyl(0.18, 0.15, 0.32, 14), 0.45, 0.25, 0);
    B(c, 'c:#8a6a3a:0.9', 0.03, 1.4, 0.03, 0.45, 0.85, 0, 0, 0.12);
    for (let i = 0; i < 3; i++) G(c, i ? 'plasticBlue' : 'plasticRed', cyl(0.04, 0.04, 0.22, 8), -0.2 + i * 0.12, 0.69, 0);
    c.collide(0.95, 0.9, 0.5, 0.1, 0.45, 0);
  },

  ladder(c) {
    // escada em A: pernas inclinadas em torno de x, encontram-se no topo
    for (const x of [-0.22, 0.22]) {
      B(c, 'brushed', 0.04, 1.8, 0.06, x, 0.88, -0.16, 0, -0.18);
      B(c, 'brushed', 0.04, 1.8, 0.06, x, 0.88, 0.16, 0, 0.18);
    }
    for (let k = 0; k < 5; k++) B(c, 'brushed', 0.44, 0.03, 0.08, 0, 0.3 + k * 0.32, 0.31 - k * 0.055);
    c.collide(0.55, 1.8, 0.7, 0, 0.9, 0);
  },

  stairs(c) {
    const steps = 11, rise = 0.27, run = 0.3;
    for (let i = 0; i < steps; i++) B(c, 'concrete', 1.6, rise * (i + 1), run, 0, (rise * (i + 1)) / 2, -i * run + 1.5);
    B(c, 'brushed', 0.04, 0.04, steps * run + 0.4, 0.82, 1.0 + (steps * rise) / 2, 1.5 - (steps * run) / 2, 0, Math.atan2(rise, run) * 0.98);
    c.collide(1.7, 3, steps * run, 0, 1.5, 1.5 - (steps * run) / 2 + run / 2);
  },

  debrisBarricade(c) {
    // pilha de cadeiras, mesa virada e caixas bloqueando a escada
    B(c, 'woodDark', 1.8, 0.75, 0.05, 0, 0.5, 0, 0.1, 0.3);
    for (const [x, z, r] of [[-0.6, 0.3, 0.6], [0.5, -0.3, 2.2], [0.1, 0.4, 1.4]] as const) chairCafe(c, x, z, r, true);
    B(c, 'cardboard', 0.6, 0.5, 0.5, -0.9, 0.25, -0.2, 0.3);
    B(c, 'cardboard', 0.5, 0.4, 0.5, 0.9, 0.2, 0.2, -0.2);
    const uv = c.atlas.alloc(400, 120, drawSign(str(c, 'label', 'BLOQUEADO'), 'escada interditada', { bg: '#f5c400', fg: '#111', accent: '#111' }));
    Q(c, 'atlasLit', 1.2, 0.36, uv, 0, 1.1, 0.06);
    c.collide(2.4, 1.6, 1.0, 0, 0.8, 0);
  },
};

// ---------- espalhados (scatter) ----------
export const SCATTER: Record<string, (c: PropCtx) => void> = {
  papers(c) {
    const n = 1 + Math.floor(c.rng.next() * 3);
    for (let i = 0; i < n; i++) B(c, 'paper', 0.21, 0.002, 0.297, (c.rng.next() - 0.5) * 0.3, 0.003 + i * 0.002, (c.rng.next() - 0.5) * 0.3, c.rng.next() * 6, 0, (c.rng.next() - 0.5) * 0.04);
  },
  envelopes(c) {
    B(c, 'c:#e8dcc0:0.9', 0.24, 0.004, 0.12, 0, 0.003, 0, c.rng.next() * 6);
  },
  coffeeCup(c) {
    if (c.rng.next() < 0.5) cup(c, 0, 0, 0);
    else G(c, 'plasticWhite', cyl(0.04, 0.032, 0.11, 10), 0, 0.04, 0, c.rng.next() * 6, Math.PI / 2);
  },
  badge(c) {
    B(c, 'plasticWhite', 0.055, 0.003, 0.085, 0, 0.003, 0, c.rng.next() * 6);
    B(c, 'c:#1c3a7a:0.8', 0.012, 0.002, 0.45, 0.05, 0.002, 0.2, c.rng.next() * 0.6);
  },
  glassShards(c) {
    for (let i = 0; i < 9; i++) B(c, 'glass', 0.05 + c.rng.next() * 0.1, 0.004, 0.04 + c.rng.next() * 0.08, (c.rng.next() - 0.5) * 1.2, 0.003, (c.rng.next() - 0.5) * 1.2, c.rng.next() * 6);
  },
};
