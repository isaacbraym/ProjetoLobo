import * as THREE from 'three';
import type { Physics } from '../../engine/physics/physics';
import { clamp, damp, dampAngle } from '../../core/math';

/**
 * Câmera 3ª pessoa: órbita com braço de mola, colisão por esfera varrida, enquadramento de grupo em combate,
 * look-ahead, FOV dinâmico e tremor por "trauma" (Perlin-ish, trauma²).
 */
export class ThirdPersonCamera {
  yaw = 0;
  pitch = 0.32;
  distance = 4.6;
  private curDist = 4.6;
  private pivot = new THREE.Vector3();
  private pivotTarget = new THREE.Vector3();
  private fovBase = 55;
  fovKick = 0;
  trauma = 0;
  /** Centro das ameaças próximas (atualizado pelo jogo) e quantidade. */
  threatCenter = new THREE.Vector3();
  threatCount = 0;
  /** Override cinematográfico (finalizações/transformação). */
  cine: { pos: THREE.Vector3; look: THREE.Vector3; fov: number; blend: number } | null = null;
  /** Próximo quadro entra direto no plano cinematográfico (corte seco, sem mistura). */
  cineSnap = false;
  private cineBlend = 0;
  private t = 0;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private desired = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private initialized = false;
  autoRecenter = true;
  /** Câmera-mira (cursor escolhe o alvo; ângulo confortável fixo, gira com o cursor na borda) ou livre (órbita). */
  mode: 'aim' | 'free' = 'free';
  /** Giro por cursor na borda da tela (rad/s), só na câmera-mira. */
  edgePan = 0;
  aimPitch = 0.6;
  aimDistance = 6.2;
  /** Altura do forro da sala atual (interiores baixos achatam o ângulo em vez de atravessar o teto). */
  ceiling = 99;
  private idleLook = 0;

  constructor(private cam: THREE.PerspectiveCamera, private physics: Physics) {}

  addTrauma(v: number): void {
    this.trauma = Math.min(1, this.trauma + v);
  }

  rotate(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -0.35, 1.1);
    if (Math.abs(dx) + Math.abs(dy) > 0.0001) this.idleLook = 0;
  }

  /** Direção "para frente" da câmera no plano. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  update(dt: number, target: THREE.Vector3, targetYaw: number, moving: boolean, inCombat: boolean): void {
    this.t += dt;
    this.idleLook += dt;
    // pivô: ombro do personagem, deslocado para o centro das ameaças em combate
    this.pivotTarget.set(target.x, target.y + 1.45, target.z);
    let distTarget = this.mode === 'aim' ? this.aimDistance : this.distance;
    if (this.mode === 'aim') {
      this.yaw += this.edgePan * dt;
      this.pitch = damp(this.pitch, this.aimPitch, 0.35, dt);
    }
    if (inCombat && this.threatCount > 0) {
      this.tmp.copy(this.threatCenter).sub(target);
      this.tmp.y = 0;
      const d = Math.min(this.tmp.length(), 6);
      if (d > 0.01) {
        // o pivô puxa para as ameaças, mas nunca atravessa parede (inimigo do outro lado de uma porta)
        this.tmp.normalize();
        let off = d * 0.28;
        const hit = this.physics.castSphere(target.x, target.y + 1.45, target.z, this.tmp.x, 0, this.tmp.z, 0.22, off + 0.3);
        if (hit !== null) off = Math.max(0, Math.min(off, hit - 0.3));
        this.pivotTarget.addScaledVector(this.tmp, off);
      }
      distTarget += Math.min(this.threatCount, 6) * 0.22 + d * 0.08;
    }
    // recentraliza atrás do personagem quando anda sem mexer a câmera
    if (this.mode === 'free' && this.autoRecenter && moving && this.idleLook > 1.2 && !inCombat) {
      this.yaw = dampAngle(this.yaw, targetYaw + Math.PI, 1.4, dt);
    }
    if (!this.initialized) {
      this.pivot.copy(this.pivotTarget);
      this.initialized = true;
    }
    this.pivot.x = damp(this.pivot.x, this.pivotTarget.x, 0.06, dt);
    this.pivot.y = damp(this.pivot.y, this.pivotTarget.y, 0.12, dt);
    this.pivot.z = damp(this.pivot.z, this.pivotTarget.z, 0.06, dt);

    // braço da câmera: em sala baixa o ângulo achata para a câmera caber abaixo do forro
    let pitch = this.pitch;
    const room = this.ceiling - 0.35 - this.pivot.y;
    if (room < Math.sin(pitch) * distTarget) pitch = Math.max(-0.05, Math.asin(Math.max(-1, Math.min(1, room / Math.max(0.5, distTarget)))));
    if (this.ceiling < 5) distTarget = Math.min(distTarget, this.mode === 'aim' ? 5.2 : 4.2);
    const cp = Math.cos(pitch);
    this.tmp2.set(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp); // direção pivô→câmera
    const hit = this.physics.castSphere(this.pivot.x, this.pivot.y, this.pivot.z, this.tmp2.x, this.tmp2.y, this.tmp2.z, 0.25, distTarget);
    const allowed = hit !== null ? Math.max(0.6, hit - 0.05) : distTarget;
    // aproxima rápido (evita atravessar parede), afasta devagar
    this.curDist = allowed < this.curDist ? damp(this.curDist, allowed, 0.02, dt) : damp(this.curDist, allowed, 0.25, dt);
    this.desired.copy(this.pivot).addScaledVector(this.tmp2, this.curDist);
    // ombro: leve deslocamento lateral para não tampar a ação
    this.right(this.tmp).multiplyScalar(0.35);
    this.desired.add(this.tmp);
    this.lookAt.copy(this.pivot).add(this.tmp);

    // cinematográfica
    const wantCine = this.cine ? 1 : 0;
    if (this.cineSnap && this.cine) {
      this.cineBlend = 1;
      this.cineSnap = false;
    }
    this.cineBlend = damp(this.cineBlend, wantCine, this.cine ? 0.05 : 0.12, dt);
    let fov = this.fovBase + this.fovKick;
    if (this.cine && this.cineBlend > 0.001) {
      this.desired.lerp(this.cine.pos, this.cineBlend);
      this.lookAt.lerp(this.cine.look, this.cineBlend);
      fov = fov + (this.cine.fov - fov) * this.cineBlend;
    }

    this.cam.position.copy(this.desired);
    this.cam.lookAt(this.lookAt);

    // trauma → tremor
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const n = (o: number) => Math.sin(this.t * 37 + o) * 0.5 + Math.sin(this.t * 71 + o * 2.3) * 0.5;
      this.cam.rotateZ(n(1) * 0.035 * s);
      this.cam.rotateX(n(4) * 0.03 * s);
      this.cam.rotateY(n(8) * 0.03 * s);
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    if (Math.abs(this.cam.fov - fov) > 0.01) {
      this.cam.fov = damp(this.cam.fov, fov, 0.08, dt);
      this.cam.updateProjectionMatrix();
    }
  }
}
