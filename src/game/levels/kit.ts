import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Kit de construção do nível: primitivas com UV em METROS (projeção por eixo dominante da normal, em espaço de mundo,
 * então texturas emendam entre peças) e lotes que mesclam tudo por material (uma draw call por material por sala).
 */
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

export function mat4(x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

/** Reescreve a UV pela projeção do eixo dominante da normal (em metros). */
export function metricUv(g: THREE.BufferGeometry): void {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny >= nx && ny >= nz) (uv[i * 2] = x), (uv[i * 2 + 1] = z);
    else if (nx >= nz) (uv[i * 2] = z), (uv[i * 2 + 1] = y);
    else (uv[i * 2] = x), (uv[i * 2 + 1] = y);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

const boxCache = new Map<string, THREE.BufferGeometry>();
export function box(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = `${w}|${h}|${d}`;
  let g = boxCache.get(k);
  if (!g) boxCache.set(k, (g = new THREE.BoxGeometry(w, h, d)));
  return g;
}
export function cyl(rt: number, rb: number, h: number, seg = 14, open = false): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
}

/** Lote de geometria estática: acumula peças por material e mescla no fim. */
export class Batch {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  tris = 0;

  add(mat: string, geo: THREE.BufferGeometry, m: THREE.Matrix4, worldUv = true): void {
    let g = geo.clone().applyMatrix4(m);
    if (g.index) g = g.toNonIndexed();
    if (worldUv) metricUv(g);
    // padroniza atributos (merge exige o mesmo conjunto)
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
    this.tris += g.getAttribute('position').count / 3;
  }

  /** Mescla e adiciona ao grupo. `shadow(mat)` diz se aquele material projeta sombra. */
  build(group: THREE.Group, getMat: (key: string) => THREE.Material, shadow: (key: string) => boolean): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [key, list] of this.parts) {
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, getMat(key));
      mesh.name = key;
      mesh.castShadow = shadow(key);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      out.push(mesh);
      for (const g of list) g.dispose();
    }
    this.parts.clear();
    return out;
  }
}
