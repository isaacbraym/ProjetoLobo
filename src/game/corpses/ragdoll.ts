import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { G, type Physics } from '../../engine/physics/physics';
import type { CharacterModel } from '../characters/character';

/** Segmentos do ragdoll (esqueleto estilo UE). Massa total ~80 kg. */
const SEGMENTS: { bone: string; end: string; radius: number; mass: number; parent: string | null; endOffset?: number }[] = [
  { bone: 'pelvis', end: 'spine_02', radius: 0.13, mass: 14, parent: null },
  { bone: 'spine_02', end: 'neck_01', radius: 0.15, mass: 24, parent: 'pelvis' },
  { bone: 'Head', end: 'Head', radius: 0.11, mass: 5, parent: 'spine_02', endOffset: 0.2 },
  { bone: 'upperarm_l', end: 'lowerarm_l', radius: 0.055, mass: 2.6, parent: 'spine_02' },
  { bone: 'lowerarm_l', end: 'hand_l', radius: 0.048, mass: 2.0, parent: 'upperarm_l', endOffset: 0.08 },
  { bone: 'upperarm_r', end: 'lowerarm_r', radius: 0.055, mass: 2.6, parent: 'spine_02' },
  { bone: 'lowerarm_r', end: 'hand_r', radius: 0.048, mass: 2.0, parent: 'upperarm_r', endOffset: 0.08 },
  { bone: 'thigh_l', end: 'calf_l', radius: 0.085, mass: 9, parent: 'pelvis' },
  { bone: 'calf_l', end: 'foot_l', radius: 0.06, mass: 5, parent: 'thigh_l', endOffset: 0.06 },
  { bone: 'thigh_r', end: 'calf_r', radius: 0.085, mass: 9, parent: 'pelvis' },
  { bone: 'calf_r', end: 'foot_r', radius: 0.06, mass: 5, parent: 'thigh_r', endOffset: 0.06 },
];

interface Part {
  bone: THREE.Bone;
  body: RAPIER.RigidBody;
  /** rotação do osso relativa ao corpo físico (constante) */
  offset: THREE.Quaternion;
}

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Ragdoll {
  readonly parts: Part[] = [];
  private joints: RAPIER.ImpulseJoint[] = [];
  private restTime = 0;
  age = 0;
  active = true;

  constructor(private physics: Physics, model: CharacterModel, impulse: THREE.Vector3, hitBone = 'spine_02') {
    const R = physics.R;
    const world = physics.world;
    model.model.updateMatrixWorld(true);
    const bodies = new Map<string, RAPIER.RigidBody>();
    for (const s of SEGMENTS) {
      const bone = model.bone(s.bone);
      if (!bone) continue;
      const start = bone.getWorldPosition(new THREE.Vector3());
      const endBone = model.bone(s.end);
      const end = endBone && s.end !== s.bone ? endBone.getWorldPosition(new THREE.Vector3()) : start.clone().add(new THREE.Vector3(0, 0.15, 0));
      const bq = bone.getWorldQuaternion(new THREE.Quaternion());
      const dir = _v.copy(end).sub(start);
      let len = dir.length();
      if (s.endOffset) len += s.endOffset;
      if (s.bone === 'Head') {
        dir.set(0, 1, 0).applyQuaternion(bq); // cabeça: segue a orientação do osso
        len = 0.22;
      }
      dir.normalize();
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(start.x, start.y, start.z)
          .setRotation({ x: bq.x, y: bq.y, z: bq.z, w: bq.w })
          .setLinearDamping(0.55)
          .setAngularDamping(2.2)
          .setCanSleep(true),
      );
      // cápsula alinhada ao segmento, no espaço local do corpo
      const inv = _q.copy(bq).invert();
      const dirLocal = _v2.copy(dir).applyQuaternion(inv);
      const colRot = new THREE.Quaternion().setFromUnitVectors(UP, dirLocal);
      const mid = dirLocal.clone().multiplyScalar(len / 2);
      const half = Math.max(0.02, len / 2 - s.radius);
      const desc = R.ColliderDesc.capsule(half, s.radius)
        .setTranslation(mid.x, mid.y, mid.z)
        .setRotation({ x: colRot.x, y: colRot.y, z: colRot.z, w: colRot.w })
        .setMass(s.mass)
        .setFriction(1.1)
        .setRestitution(0.0)
        .setCollisionGroups(G.ragdoll);
      world.createCollider(desc, body);
      // velocidade inicial: impulso do golpe (mais forte no osso atingido e no tronco)
      const k = s.bone === hitBone ? 1.4 : s.parent === null || s.bone === 'spine_02' ? 1.0 : 0.75;
      body.setLinvel({ x: impulse.x * k, y: impulse.y * k, z: impulse.z * k }, true);
      bodies.set(s.bone, body);
      this.parts.push({ bone, body, offset: new THREE.Quaternion().copy(bq).premultiply(_q2.copy(bq).invert()) });
      // junta com o pai
      if (s.parent) {
        const pb = bodies.get(s.parent);
        const pbone = model.bone(s.parent);
        if (pb && pbone) {
          const pPos = pbone.getWorldPosition(new THREE.Vector3());
          const pq = pbone.getWorldQuaternion(new THREE.Quaternion());
          const a1 = start.clone().sub(pPos).applyQuaternion(pq.clone().invert());
          const jd = R.JointData.spherical({ x: a1.x, y: a1.y, z: a1.z }, { x: 0, y: 0, z: 0 });
          const j = world.createImpulseJoint(jd, pb, body, true) as RAPIER.SphericalImpulseJoint;
          j.setContactsEnabled(false);
          // "tônus muscular": amortece a rotação relativa (evita boneco de pano mole)
          const tone = s.bone.startsWith('spine') || s.bone === 'Head' ? 6 : 2.2;
          if (typeof (j as { configureMotorVelocity?: unknown }).configureMotorVelocity === 'function') {
            for (const ax of [R.JointAxis.AngX, R.JointAxis.AngY, R.JointAxis.AngZ]) j.configureMotorVelocity(ax, 0, tone);
          } else {
            // sem motor nesta versão: o amortecimento angular do corpo faz o papel de tônus
            body.setAngularDamping(s.bone.startsWith('spine') || s.bone === 'Head' ? 5 : 3.2);
          }
          this.joints.push(j);
        }
      }
    }
  }

  /** Copia a física para os ossos (pai → filho). */
  sync(dt: number): void {
    if (!this.active) return;
    this.age += dt;
    let maxV = 0;
    for (const part of this.parts) {
      const b = part.body;
      const t = b.translation();
      const r = b.rotation();
      const v = b.linvel();
      maxV = Math.max(maxV, Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z));
      const bone = part.bone;
      const parent = bone.parent!;
      parent.updateWorldMatrix(true, false);
      // rotação: world = bodyRot (offset é identidade porque o corpo nasceu com a rotação do osso)
      _q.set(r.x, r.y, r.z, r.w);
      parent.getWorldQuaternion(_q2);
      bone.quaternion.copy(_q2.invert().multiply(_q));
      if (part === this.parts[0]) {
        _p.set(t.x, t.y, t.z);
        parent.worldToLocal(_p);
        bone.position.copy(_p);
      }
      bone.updateMatrixWorld(true);
    }
    if (maxV < 0.35) this.restTime += dt;
    else this.restTime = 0;
  }

  get settled(): boolean {
    return this.restTime > 0.6 || this.age > 6;
  }

  /** Remove a física e mantém a pose (tier T2: pose congelada, custo zero de física). */
  freeze(): void {
    if (!this.active) return;
    this.active = false;
    for (const j of this.joints) this.physics.world.removeImpulseJoint(j, true);
    for (const p of this.parts) this.physics.world.removeRigidBody(p.body);
    this.joints.length = 0;
  }

  /** Posição do tronco (para câmera/decals). */
  torsoPosition(out: THREE.Vector3): THREE.Vector3 {
    const p = this.parts[1] ?? this.parts[0];
    if (!p) return out;
    if (this.active) {
      const t = p.body.translation();
      return out.set(t.x, t.y, t.z);
    }
    return p.bone.getWorldPosition(out);
  }
}
