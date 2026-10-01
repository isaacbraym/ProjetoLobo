import * as THREE from 'three';
import { rngs } from '../../core/rng';

/**
 * Partículas em pool (um draw call): sangue, poeira, faíscas. Simulação simples na CPU, sem alocação por frame.
 * Gotas que tocam o chão viram decal (callback) — o sangue fica no cenário.
 */
export class Particles {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private gravity: Float32Array;
  private kind: Uint8Array;
  private cursor = 0;
  onGroundHit?: (x: number, z: number, size: number) => void;

  constructor(private max: number) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.kind = new Uint8Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -100;
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float size; attribute vec4 color; varying vec4 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vColor;
        void main() {
          vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
          if (d > 0.25) discard;
          float a = smoothstep(0.25, 0.08, d);
          gl_FragColor = vec4(vColor.rgb, vColor.a * a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number, a: number, size: number, grav: number, kind: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.col[i * 4] = r;
    this.col[i * 4 + 1] = g;
    this.col[i * 4 + 2] = b;
    this.col[i * 4 + 3] = a;
    this.size[i] = size;
    this.gravity[i] = grav;
    this.kind[i] = kind;
  }

  /** Jato de sangue na direção do golpe. */
  blood(x: number, y: number, z: number, dirX: number, dirZ: number, amount: number): void {
    const r = rngs.vfx;
    const n = Math.round(14 * amount);
    for (let k = 0; k < n; k++) {
      const sp = r.range(1.5, 5.5) * (0.6 + amount * 0.4);
      const vx = dirX * sp + r.range(-1.6, 1.6);
      const vz = dirZ * sp + r.range(-1.6, 1.6);
      const vy = r.range(0.4, 3.4);
      const dark = r.range(0.35, 0.65);
      this.spawn(x, y, z, vx, vy, vz, r.range(0.6, 1.2), dark, 0.02, 0.03, 0.95, r.range(0.025, 0.07), 9.8, 1);
    }
    // névoa
    for (let k = 0; k < 6 * amount; k++) {
      this.spawn(x, y, z, dirX * r.range(0.5, 1.5) + r.range(-0.5, 0.5), r.range(0, 0.8), dirZ * r.range(0.5, 1.5) + r.range(-0.5, 0.5), r.range(0.25, 0.45), 0.5, 0.03, 0.04, 0.5, r.range(0.12, 0.22), 1.5, 0);
    }
  }

  /** Impacto seco (soco sem crítico): lufada clara curta + respingo de suor, sem sangue nem mancha. */
  impact(x: number, y: number, z: number, dirX: number, dirZ: number, amount: number): void {
    const r = rngs.vfx;
    for (let k = 0; k < 7 * amount; k++) {
      const sp = r.range(0.6, 2.0);
      const g = r.range(0.8, 0.95);
      this.spawn(x, y, z, dirX * sp + r.range(-0.7, 0.7), r.range(-0.2, 0.8), dirZ * sp + r.range(-0.7, 0.7), r.range(0.14, 0.24), g, g * 0.96, g * 0.9, 0.45, r.range(0.07, 0.14), 0.5, 0);
    }
    for (let k = 0; k < 5 * amount; k++) {
      const sp = r.range(1.5, 3.5);
      this.spawn(x, y, z, dirX * sp + r.range(-1, 1), r.range(0.3, 1.6), dirZ * sp + r.range(-1, 1), r.range(0.25, 0.4), 0.85, 0.88, 0.9, 0.7, r.range(0.015, 0.03), 9.8, 0);
    }
  }

  dust(x: number, y: number, z: number, amount: number): void {
    const r = rngs.vfx;
    for (let k = 0; k < 10 * amount; k++) {
      const a = r.range(0, Math.PI * 2);
      const sp = r.range(0.5, 2.2);
      const g = r.range(0.45, 0.6);
      this.spawn(x, y, z, Math.cos(a) * sp, r.range(0.1, 0.9), Math.sin(a) * sp, r.range(0.5, 0.9), g, g * 0.95, g * 0.9, 0.35, r.range(0.18, 0.35), 0.4, 0);
    }
  }

  sparks(x: number, y: number, z: number): void {
    const r = rngs.vfx;
    for (let k = 0; k < 10; k++) {
      this.spawn(x, y, z, r.range(-3, 3), r.range(0.5, 3.5), r.range(-3, 3), r.range(0.2, 0.4), 4, 2.4, 0.8, 1, r.range(0.02, 0.04), 9.8, 0);
    }
  }

  update(dt: number): void {
    const p = this.pos;
    const v = this.vel;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i]! <= 0) continue;
      this.life[i]! -= dt;
      const j = i * 3;
      v[j + 1]! -= this.gravity[i]! * dt;
      v[j]! *= 1 - dt * 0.6;
      v[j + 2]! *= 1 - dt * 0.6;
      p[j]! += v[j]! * dt;
      p[j + 1]! += v[j + 1]! * dt;
      p[j + 2]! += v[j + 2]! * dt;
      if (p[j + 1]! < 0.01) {
        if (this.kind[i] === 1 && this.onGroundHit) this.onGroundHit(p[j]!, p[j + 2]!, this.size[i]! * 4);
        this.life[i] = 0;
      }
      const t = this.life[i]! / this.maxLife[i]!;
      if (this.kind[i] === 0) this.col[i * 4 + 3] = Math.min(this.col[i * 4 + 3]!, t * 0.6 + 0.0001);
      if (this.life[i]! <= 0) p[j + 1] = -100;
    }
    const g = this.points.geometry;
    g.attributes.position!.needsUpdate = true;
    g.attributes.color!.needsUpdate = true;
    g.attributes.size!.needsUpdate = true;
  }
}
