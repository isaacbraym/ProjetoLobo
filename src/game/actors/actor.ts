import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { G, type Physics } from '../../engine/physics/physics';
import type { CharacterModel } from '../characters/character';
import type { AttackDef } from '../data/schemas';

export type Team = 'player' | 'enemy' | 'civilian';

export interface HitInfo {
  attacker: Actor;
  attack: AttackDef;
  damage: number;
  /** direção do golpe no plano (unitária, do atacante para o alvo) */
  dirX: number;
  dirZ: number;
  heavy: boolean;
}

let nextId = 1;

/** Ator físico-lógico: posição, rumo, vida, poise, cápsula cinemática. Representação visual = CharacterModel. */
export class Actor {
  readonly id = nextId++;
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  yaw = 0;
  prevYaw = 0;
  /** velocidade planar desejada/atual (m/s) */
  readonly vel = new THREE.Vector3();
  radius = 0.34;
  height = 1.8;
  hp: number;
  poise: number;
  alive = true;
  invulnerable = 0;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  /** empurrão externo (knockback) que decai */
  readonly push = new THREE.Vector3();
  private static kcc: RAPIER.KinematicCharacterController | null = null;
  private tmpMove = { x: 0, y: 0, z: 0 };

  constructor(
    readonly team: Team,
    readonly model: CharacterModel,
    protected physics: Physics,
    public maxHp: number,
    public maxPoise: number,
    spawn: THREE.Vector3,
  ) {
    this.hp = maxHp;
    this.poise = maxPoise;
    this.pos.copy(spawn);
    this.prevPos.copy(spawn);
    const R = physics.R;
    if (!Actor.kcc) {
      Actor.kcc = physics.world.createCharacterController(0.02);
      Actor.kcc.setSlideEnabled(true);
      Actor.kcc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
      Actor.kcc.enableAutostep(0.3, 0.2, false);
      Actor.kcc.enableSnapToGround(0.3);
    }
    this.body = physics.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y + 0.9, spawn.z));
    const grp = team === 'player' ? G.player : G.enemy;
    this.collider = physics.world.createCollider(R.ColliderDesc.capsule(0.55, this.radius).setCollisionGroups(grp), this.body);
  }

  get forwardX(): number {
    return Math.sin(this.yaw);
  }
  get forwardZ(): number {
    return Math.cos(this.yaw);
  }

  /** Move com colisão (paredes, móveis, outros atores). dx/dz em metros neste passo. */
  move(dx: number, dz: number, dt: number): void {
    dx += this.push.x * dt;
    dz += this.push.z * dt;
    const decay = Math.pow(0.0008, dt);
    this.push.multiplyScalar(decay);
    const kcc = Actor.kcc!;
    this.tmpMove.x = dx;
    this.tmpMove.y = -0.01; // mantém no chão
    this.tmpMove.z = dz;
    kcc.computeColliderMovement(this.collider, this.tmpMove, undefined, undefined, (c) => c !== this.collider);
    const m = kcc.computedMovement();
    const t = this.body.translation();
    const nx = t.x + m.x;
    const nz = t.z + m.z;
    const ny = Math.max(0.9, t.y + m.y);
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    this.pos.set(nx, ny - 0.9, nz);
  }

  /** Teleporte sem colisão (spawn, debug). */
  teleport(p: THREE.Vector3): void {
    this.pos.copy(p);
    this.prevPos.copy(p);
    this.body.setTranslation({ x: p.x, y: p.y + 0.9, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + 0.9, z: p.z });
  }

  beginStep(): void {
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
  }

  /** Interpola transformação visual entre passos fixos. */
  syncVisual(alpha: number): void {
    const r = this.model.root;
    r.position.lerpVectors(this.prevPos, this.pos, alpha);
    let dy = this.yaw - this.prevYaw;
    if (dy > Math.PI) dy -= Math.PI * 2;
    if (dy < -Math.PI) dy += Math.PI * 2;
    r.rotation.y = this.prevYaw + dy * alpha;
  }

  distanceTo(o: Actor): number {
    return Math.hypot(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
  }

  /** Ângulo (rad) entre a frente deste ator e a direção até `o`. */
  angleTo(o: Actor): number {
    const dx = o.pos.x - this.pos.x;
    const dz = o.pos.z - this.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    const dot = (dx * this.forwardX + dz * this.forwardZ) / l;
    return Math.acos(Math.max(-1, Math.min(1, dot)));
  }

  yawTo(o: Actor): number {
    return Math.atan2(o.pos.x - this.pos.x, o.pos.z - this.pos.z);
  }

  /** Remove a cápsula (morte → ragdoll assume). */
  disableCollision(): void {
    this.collider.setEnabled(false);
  }

  dispose(): void {
    this.physics.world.removeRigidBody(this.body);
  }
}
