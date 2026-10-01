import * as THREE from 'three';
import type { Actor, HitInfo } from './actor';
import type { Fighter } from '../combat/fighter';
import { damp, dampAngle } from '../../core/math';
import { rngs } from '../../core/rng';
import { events } from '../../core/events';

/**
 * Refém (GAME_DESIGN §8): cativo (ajoelhado/encolhido) → esperança (a briga começou perto: reza/torce) → libertado
 * (o grupo que vigiava caiu: levanta, agradece e corre para a saída — some só ao passar pela porta) → pânico se o Márcio
 * acertar (foge e se encolhe). Sem penalidade de jogo.
 */
export type HostageState = 'captive' | 'hope' | 'freed' | 'fleeing' | 'panic' | 'gone';

export class Hostage implements Fighter {
  readonly kind = 'civilian' as const;
  state: HostageState = 'captive';
  private t = 0;
  private speed = 0;
  private panicT = 0;
  readonly exit = new THREE.Vector3();
  private wp = new THREE.Vector3();
  /** navegação por portas (mesma do inimigo) */
  steer: ((fx: number, fz: number, tx: number, tz: number, out: THREE.Vector3) => void) | null = null;
  onFreed: ((h: Hostage) => void) | null = null;
  private counted = false;
  onGone: ((h: Hostage) => void) | null = null;

  constructor(
    readonly id: string,
    readonly actor: Actor,
    readonly groupId: string | null,
    pose: 'kneel' | 'scared',
    readonly label?: string,
  ) {
    actor.model.animator.setLocoSet({ idle: pose === 'kneel' ? 'hostageKneel' : 'hostageScared' }, true);
  }

  get alive(): boolean {
    return this.actor.alive && this.state !== 'gone';
  }
  get staggered(): boolean {
    return false;
  }
  get free(): boolean {
    return this.state === 'freed' || this.state === 'fleeing' || this.state === 'gone';
  }

  /** A briga começou perto: reza/torce baixinho. */
  hope(): void {
    if (this.state !== 'captive') return;
    this.state = 'hope';
    this.actor.model.animator.setLocoSet({ idle: 'hostageScared' });
  }

  /** O grupo caiu: levanta e foge pela saída. */
  release(delay = rngs.ai.range(0.5, 1.4)): void {
    this.countOnce();
    if (this.free || this.state === 'panic') return;
    this.state = 'freed';
    this.t = -delay;
  }

  /** Conta como libertado uma vez só (libertado pelo grupo, achado escondido ou fugindo em pânico). */
  private countOnce(): void {
    if (this.counted) return;
    this.counted = true;
    this.onFreed?.(this);
  }

  update(dt: number, player: Fighter): void {
    const a = this.actor;
    this.t += dt;
    a.model.animator.strafe = 0;
    switch (this.state) {
      case 'captive':
      case 'hope':
        a.model.animator.speed = 0;
        break;
      case 'freed':
        a.model.animator.speed = 0;
        // levanta e olha para o Márcio (agradece), depois corre
        if (this.t > 0 && this.t < 0.05) a.model.animator.setLocoSet({ idle: 'idle' });
        if (this.t > 0) a.yaw = dampAngle(a.yaw, a.yawTo(player.actor), 0.15, dt);
        if (this.t > 1.1) this.state = 'fleeing';
        break;
      case 'fleeing':
      case 'panic': {
        if (this.state === 'panic') {
          this.panicT -= dt;
          if (this.panicT <= 0) {
            this.state = 'fleeing';
            this.countOnce();
          }
        }
        let tx = this.exit.x, tz = this.exit.z;
        if (this.state === 'panic') {
          // foge do Márcio
          tx = a.pos.x + (a.pos.x - player.actor.pos.x) * 3;
          tz = a.pos.z + (a.pos.z - player.actor.pos.z) * 3;
        } else if (this.steer) {
          this.steer(a.pos.x, a.pos.z, tx, tz, this.wp);
          tx = this.wp.x;
          tz = this.wp.z;
        }
        const dx = tx - a.pos.x, dz = tz - a.pos.z;
        const d = Math.hypot(dx, dz);
        this.speed = damp(this.speed, this.state === 'panic' ? 4.2 : 3.4, 0.2, dt);
        if (d > 0.05) a.yaw = dampAngle(a.yaw, Math.atan2(dx, dz), 0.08, dt);
        a.move(Math.sin(a.yaw) * this.speed * dt, Math.cos(a.yaw) * this.speed * dt, dt);
        a.model.animator.speed = this.speed;
        if (this.state === 'fleeing' && Math.hypot(this.exit.x - a.pos.x, this.exit.z - a.pos.z) < 0.9) {
          this.state = 'gone';
          a.collider.setEnabled(false);
          a.model.setVisible(false);
          this.onGone?.(this);
        }
        break;
      }
      case 'gone':
        break;
    }
  }

  /** Márcio acertou um refém: pânico (sem dano real; "sem penalidade de jogo"). */
  takeHit(info: HitInfo): boolean {
    if (!this.alive) return false;
    const a = this.actor;
    a.push.set(info.dirX * 2.2, 0, info.dirZ * 2.2);
    a.model.animator.play('hitChest', { speed: 1.2, start: 0.05, end: 0.6, fade: 0.04, fadeOut: 0.2 });
    a.model.flash(0.6);
    if (!this.free || this.state === 'fleeing') {
      this.state = 'panic';
      this.panicT = 2.2;
      a.model.animator.setLocoSet({ idle: 'idle' });
    }
    events.emit('CivilianHurt', { civilianId: a.id });
    return true;
  }
}
