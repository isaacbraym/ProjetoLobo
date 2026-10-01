import * as THREE from 'three';
import { rngs } from '../../core/rng';

/** Manchas de sangue no chão em pool (InstancedMesh por variante). Recicla a mais antiga quando enche. */
export class FloorDecals {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private cursor = 0;
  private count = 0;
  private readonly per: number;
  private tmp = new THREE.Object3D();
  private yJitter = 0;

  constructor(private max: number) {
    const variants = 4;
    this.per = Math.ceil(max / variants);
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let v = 0; v < variants; v++) {
      const mat = new THREE.MeshStandardMaterial({
        map: splatTexture(v),
        transparent: true,
        depthWrite: false,
        roughness: 0.15,
        metalness: 0,
        color: 0xffffff,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      const m = new THREE.InstancedMesh(geo, mat, this.per);
      m.count = 0;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.renderOrder = 1;
      this.meshes.push(m);
      this.group.add(m);
    }
  }

  add(x: number, z: number, size: number, y = 0): void {
    const r = rngs.vfx;
    const slot = this.cursor;
    this.cursor = (this.cursor + 1) % (this.per * this.meshes.length);
    const mi = slot % this.meshes.length;
    const ii = Math.floor(slot / this.meshes.length);
    const mesh = this.meshes[mi]!;
    this.yJitter = (this.yJitter + 1) % 64;
    this.tmp.position.set(x, y + 0.004 + this.yJitter * 0.00005, z);
    this.tmp.rotation.set(0, r.range(0, Math.PI * 2), 0);
    const s = Math.max(0.08, size) * r.range(0.8, 1.25);
    this.tmp.scale.set(s, 1, s * r.range(0.7, 1.3));
    this.tmp.updateMatrix();
    mesh.setMatrixAt(ii, this.tmp.matrix);
    mesh.count = Math.max(mesh.count, ii + 1);
    mesh.instanceMatrix.needsUpdate = true;
    this.count = Math.min(this.max, this.count + 1);
  }
}

function splatTexture(variant: number): THREE.CanvasTexture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  let seed = 17 + variant * 31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.translate(s / 2, s / 2);
  const blob = (x: number, y: number, r: number, a: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(70,2,6,${a})`);
    g.addColorStop(0.7, `rgba(95,4,10,${a * 0.9})`);
    g.addColorStop(1, 'rgba(60,0,4,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  blob(0, 0, 30 + rnd() * 12, 0.95);
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 18 + rnd() * 34;
    blob(Math.cos(a) * d, Math.sin(a) * d, 3 + rnd() * 9, 0.9);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
