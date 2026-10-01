import * as THREE from 'three';

/**
 * Atlas de canvas do nível: placas, quadros, mapa, cardápio, cartazes, marcas de bala e sangue desenhados em páginas de
 * 2048² (empacotamento em prateleiras; abre outra página quando enche). Por página, três materiais compartilham a
 * textura: `atlasGlow` (placa iluminada, sem luz), `atlasLit` (papel/quadro sob a luz) e `atlasDecal` (transparente).
 */
export type UvRect = [u0: number, v0: number, u1: number, v1: number, page: number];

interface Page {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  glow: THREE.MeshBasicMaterial;
  lit: THREE.MeshStandardMaterial;
  decal: THREE.MeshStandardMaterial;
}

export class LevelAtlas {
  readonly size = 2048;
  private pages: Page[] = [];
  private shelfY = 0;
  private shelfH = 0;
  private cursorX = 0;

  constructor() {
    this.newPage();
  }

  private newPage(): void {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = this.size;
    const ctx = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.flipY = false;
    const i = this.pages.length;
    this.pages.push({
      canvas,
      ctx,
      texture,
      glow: new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.02, color: new THREE.Color(1.25, 1.2, 1.15), name: `atlasGlow:${i}` }),
      lit: new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, name: `atlasLit:${i}` }),
      decal: new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 0.6, name: `atlasDecal:${i}` }),
    });
    this.shelfY = 0;
    this.shelfH = 0;
    this.cursorX = 0;
  }

  /** Material de uma página: 'atlasGlow' | 'atlasLit' | 'atlasDecal' (+ ':página'). */
  material(key: string): THREE.Material {
    const [kind, pg] = key.split(':');
    const page = this.pages[Number(pg ?? 0)] ?? this.pages[0]!;
    return kind === 'atlasGlow' ? page.glow : kind === 'atlasLit' ? page.lit : page.decal;
  }

  /** Reserva w×h px (com 2 px de margem) e desenha. Devolve o retângulo de UV (v cresce para baixo: flipY = false). */
  alloc(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void): UvRect {
    w = Math.min(this.size - 4, Math.ceil(w));
    h = Math.min(this.size - 4, Math.ceil(h));
    if (this.cursorX + w + 4 > this.size) {
      this.shelfY += this.shelfH + 4;
      this.cursorX = 0;
      this.shelfH = 0;
    }
    if (this.shelfY + h + 4 > this.size) this.newPage();
    const page = this.pages.length - 1;
    const ctx = this.pages[page]!.ctx;
    const x = this.cursorX + 2;
    const y = this.shelfY + 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    draw(ctx, w, h);
    ctx.restore();
    this.cursorX += w + 4;
    this.shelfH = Math.max(this.shelfH, h);
    const S = this.size;
    return [x / S, y / S, (x + w) / S, (y + h) / S, page];
  }

  /** Plano w×h (metros) com a UV do retângulo do atlas (frente = +z local). */
  static quad(w: number, h: number, uv: UvRect): THREE.BufferGeometry {
    const g = new THREE.PlaneGeometry(w, h);
    const a = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < a.count; i++) {
      const u = a.getX(i);
      const v = a.getY(i);
      a.setXY(i, uv[0] + u * (uv[2] - uv[0]), uv[1] + (1 - v) * (uv[3] - uv[1]));
    }
    return g;
  }

  /** Chave do material para um retângulo (a página entra na chave). */
  static key(kind: 'atlasGlow' | 'atlasLit' | 'atlasDecal', uv: UvRect): string {
    return uv[4] ? `${kind}:${uv[4]}` : kind;
  }

  get pageCount(): number {
    return this.pages.length;
  }

  finish(): void {
    for (const p of this.pages) p.texture.needsUpdate = true;
  }
}

// ---------- desenhos reutilizáveis ----------
export function drawSign(text: string, sub: string, opts: { bg?: string; fg?: string; accent?: string } = {}) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (opts.bg) {
      ctx.fillStyle = opts.bg;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = opts.fg ?? '#f3ece4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fs = Math.floor(h * (sub ? 0.5 : 0.62));
    ctx.font = `${fs}px Anton, Impact, sans-serif`;
    while (ctx.measureText(text).width > w * 0.92 && fs > 8) ctx.font = `${(fs -= 2)}px Anton, Impact, sans-serif`;
    ctx.fillText(text, w / 2, sub ? h * 0.4 : h * 0.52);
    if (sub) {
      ctx.font = `700 ${Math.floor(h * 0.17)}px "Barlow Condensed", sans-serif`;
      ctx.fillStyle = opts.accent ?? '#ffb02e';
      ctx.fillText(sub.toUpperCase().split('').join(' '), w / 2, h * 0.82);
    }
  };
}

/** Arte abstrata de corporação (quadros) a partir de uma semente. */
export function drawArt(seed: number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    let s = seed * 9301 + 49297;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const pals = [['#1d2b3a', '#c8553d', '#f2d0a4', '#28536b'], ['#2b2d42', '#8d99ae', '#edf2f4', '#ef233c'], ['#283618', '#606c38', '#fefae0', '#dda15e'], ['#22223b', '#4a4e69', '#9a8c98', '#f2e9e4']];
    const pal = pals[seed % pals.length]!;
    ctx.fillStyle = pal[0]!;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = pal[1 + Math.floor(r() * 3)]!;
      ctx.globalAlpha = 0.55 + r() * 0.45;
      if (r() < 0.5) ctx.fillRect(r() * w, r() * h, r() * w * 0.6, r() * h * 0.6);
      else {
        ctx.beginPath();
        ctx.arc(r() * w, r() * h, r() * h * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };
}

export function drawBlood(seed: number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    let s = seed * 7 + 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const x = w / 2 + (r() - 0.5) * w * 0.7;
      const y = h / 2 + (r() - 0.5) * h * 0.7;
      const rad = (r() * 0.16 + 0.02) * w;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, 'rgba(70,4,8,0.95)');
      g.addColorStop(0.7, 'rgba(95,8,12,0.85)');
      g.addColorStop(1, 'rgba(95,8,12,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    // arrastado
    ctx.strokeStyle = 'rgba(80,6,10,0.6)';
    ctx.lineWidth = w * 0.06;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.5);
    ctx.bezierCurveTo(w * 0.6, h * 0.65, w * 0.75, h * 0.7, w * 0.92, h * 0.9);
    ctx.stroke();
  };
}

export function drawBulletHole() {
  return (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w / 2);
    g.addColorStop(0, 'rgba(8,6,6,1)');
    g.addColorStop(0.22, 'rgba(20,16,14,1)');
    g.addColorStop(0.3, 'rgba(160,150,140,0.7)');
    g.addColorStop(0.55, 'rgba(60,50,45,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(30,25,22,0.6)';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + i;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * w * 0.12, cy + Math.sin(a) * h * 0.12);
      ctx.lineTo(cx + Math.cos(a) * w * (0.3 + (i % 3) * 0.06), cy + Math.sin(a) * h * (0.3 + (i % 3) * 0.06));
      ctx.stroke();
    }
  };
}
