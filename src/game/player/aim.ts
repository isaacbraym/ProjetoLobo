import * as THREE from 'three';
import type { Enemy } from '../ai/enemy';
import type { AimInfo } from './player';

/** Corpo que o lobo pode comer: cadáver (posição do tronco) ou inimigo caído. */
export interface BodyRef {
  pos: THREE.Vector3;
  key: object;
  enemy?: Enemy;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ndc = new THREE.Vector2();
const _pel = new THREE.Vector3();
const _head = new THREE.Vector3();
const _p0 = new THREE.Vector2();
const _p1 = new THREE.Vector2();

/**
 * Câmera-mira (DEC-0016): o que está sob o cursor. Teste em espaço de tela (barato e estável): cada inimigo vira um
 * segmento pelve→cabeça com raio de ~32 cm projetado; corpos viram um ponto com raio de ~55 cm. Sem inimigo sob o
 * cursor, a mira é a direção do jogador até o ponto do cursor no chão.
 */
export class AimPicker {
  enemy: Enemy | null = null;
  body: BodyRef | null = null;
  readonly ground = new THREE.Vector3();
  readonly info: AimInfo = { enemy: null, dirX: 0, dirZ: 0 };

  update(cam: THREE.PerspectiveCamera, ndcX: number, ndcY: number, viewH: number, enemies: Enemy[], bodies: BodyRef[], playerPos: THREE.Vector3): AimInfo {
    const pxPerUnit = viewH / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const cx = ndcX * (viewH * cam.aspect) / 2;
    const cy = ndcY * viewH / 2;
    const toPx = (v: THREE.Vector3, out: THREE.Vector2) => {
      _a.copy(v).project(cam);
      out.set((_a.x * viewH * cam.aspect) / 2, (_a.y * viewH) / 2);
      return _a.z < 1;
    };
    const depth = (v: THREE.Vector3) => _b.copy(v).applyMatrix4(cam.matrixWorldInverse).z * -1;
    let best: Enemy | null = null;
    let bestScore = Infinity;
    for (const e of enemies) {
      if (!e.alive || e.state === 'down') continue;
      const base = e.actor.model.root.position;
      _pel.set(base.x, base.y + 0.95, base.z);
      _head.set(base.x, base.y + 1.7, base.z);
      const d = depth(_pel);
      if (d < 0.3) continue;
      if (!toPx(_pel, _p0) || !toPx(_head, _p1)) continue;
      const p0 = _p0, p1 = _p1;
      // distância do cursor ao segmento pelve→cabeça
      const sx = p1.x - p0.x, sy = p1.y - p0.y;
      const t = THREE.MathUtils.clamp(((cx - p0.x) * sx + (cy - p0.y) * sy) / Math.max(1e-6, sx * sx + sy * sy), 0, 1);
      const dist = Math.hypot(cx - (p0.x + sx * t), cy - (p0.y + sy * t));
      const r = (0.32 * pxPerUnit) / d + 6;
      if (dist > r) continue;
      const score = dist / r + d * 0.02;
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    this.enemy = best;
    let bb: BodyRef | null = null;
    let bbScore = Infinity;
    for (const b of bodies) {
      const d = depth(b.pos);
      if (d < 0.3 || !toPx(b.pos, _p0)) continue;
      const dist = Math.hypot(cx - _p0.x, cy - _p0.y);
      const r = (0.55 * pxPerUnit) / d + 8;
      if (dist > r) continue;
      if (dist / r < bbScore) {
        bbScore = dist / r;
        bb = b;
      }
    }
    this.body = bb;
    // ponto do cursor no chão (altura do jogador)
    _ndc.set(ndcX, ndcY);
    _ray.setFromCamera(_ndc, cam);
    _plane.constant = -playerPos.y;
    if (_ray.ray.intersectPlane(_plane, this.ground) === null) this.ground.copy(playerPos);
    const tx = best ? best.actor.pos.x : this.ground.x;
    const tz = best ? best.actor.pos.z : this.ground.z;
    const dx = tx - playerPos.x;
    const dz = tz - playerPos.z;
    const l = Math.hypot(dx, dz);
    this.info.enemy = best;
    this.info.dirX = l > 0.05 ? dx / l : 0;
    this.info.dirZ = l > 0.05 ? dz / l : 0;
    return this.info;
  }
}
