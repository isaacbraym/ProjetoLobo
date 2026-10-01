import * as THREE from 'three';
import type { Actor, HitInfo } from '../actors/actor';
import type { Fighter } from '../combat/fighter';
import type { CombatSystem } from '../combat/combatSystem';
import type { ArchetypeDef, AttackDef, DifficultyDef } from '../data/schemas';
import { attacksData } from '../data/gameData';
import { damp, dampAngle } from '../../core/math';
import { rngs } from '../../core/rng';
import { events } from '../../core/events';

export type EState = 'idle' | 'approach' | 'windup' | 'attack' | 'recover' | 'hit' | 'stagger' | 'dead';

/**
 * Inimigo genérico dirigido por arquétipo (dados). Decide a 10 Hz; move a 60 Hz.
 * Só ataca com ficha do CombatDirector, sempre com telegrafia.
 */
export class Enemy implements Fighter {
  readonly kind = 'enemy' as const;
  state: EState = 'idle';
  stateTime = 0;
  /** Ficha de ataque concedida pelo diretor. */
  hasToken = false;
  /** Posição-alvo no anel (definida pelo diretor). */
  readonly slot = new THREE.Vector3();
  slotRadius = 4;
  cooldown = 0;
  lastHitTime = 99;
  private attack: AttackDef | null = null;
  private hitDone = false;
  private telegraph = 0;
  private stun = 0;
  private decideAcc = rngs.ai.range(0, 0.1);
  private moveSpeed = 0;
  private strafeDir = rngs.ai.chance(0.5) ? 1 : -1;
  engaged = false;
  /** Indicador visual de telegrafia (0..1) lido pela UI. */
  telegraphAmount = 0;

  constructor(
    readonly actor: Actor,
    readonly def: ArchetypeDef,
    readonly archetypeId: string,
    private combat: CombatSystem,
    private diff: DifficultyDef,
  ) {
    this.cooldown = rngs.ai.range(0.3, 1.2);
  }

  get alive(): boolean {
    return this.actor.alive;
  }
  get staggered(): boolean {
    return this.state === 'stagger';
  }
  get attacking(): boolean {
    return this.state === 'windup' || this.state === 'attack';
  }

  private setState(s: EState): void {
    this.state = s;
    this.stateTime = 0;
  }

  update(dt: number, player: Fighter): void {
    this.stateTime += dt;
    this.lastHitTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const a = this.actor;
    if (!a.alive) return;
    const p = player.actor;
    const dist = a.distanceTo(p);
    if (!this.engaged && (dist < 14 || this.lastHitTime < 1)) this.engaged = true;

    switch (this.state) {
      case 'idle':
        a.model.animator.speed = 0;
        a.move(0, 0, dt);
        if (this.engaged) this.setState('approach');
        break;
      case 'approach':
        this.updateApproach(dt, player, dist);
        break;
      case 'windup': {
        a.yaw = dampAngle(a.yaw, a.yawTo(p), 0.06, dt);
        a.move(0, 0, dt);
        this.telegraph -= dt;
        this.telegraphAmount = Math.min(1, this.telegraphAmount + dt * 6);
        if (this.telegraph <= 0) {
          const act = a.model.animator;
          act.play(this.attack!.clip, { speed: this.attack!.speed, start: this.attack!.start, end: this.attack!.end, fade: 0.05 });
          this.setState('attack');
        }
        break;
      }
      case 'attack': {
        const def = this.attack!;
        const t = a.model.animator.shotTime;
        this.telegraphAmount = Math.max(0, this.telegraphAmount - dt * 4);
        if (t < def.hitAt) {
          a.yaw = dampAngle(a.yaw, a.yawTo(p), 0.12, dt);
          const gap = dist - def.range * 0.8;
          const step = gap > 0 ? Math.min(gap, def.warp * dt * 2) : 0;
          a.move(Math.sin(a.yaw) * step, Math.cos(a.yaw) * step, dt);
        } else a.move(0, 0, dt);
        if (!this.hitDone && t >= def.hitAt) {
          this.hitDone = true;
          this.combat.resolve(this, def);
        }
        if (t >= def.end - 0.01 || !a.model.animator.busy) {
          this.cooldown = this.diff.cooldown * rngs.ai.range(0.8, 1.3) / (0.6 + this.def.aggression * 0.8);
          this.setState('recover');
        }
        break;
      }
      case 'recover':
        a.move(0, 0, dt);
        a.model.animator.speed = 0;
        if (this.stateTime > 0.25) this.setState('approach');
        break;
      case 'hit':
      case 'stagger':
        this.stun -= dt;
        this.telegraphAmount = 0;
        a.move(0, 0, dt);
        a.model.animator.speed = 0;
        if (this.stun <= 0) this.setState('approach');
        break;
    }
  }

  private updateApproach(dt: number, player: Fighter, dist: number): void {
    const a = this.actor;
    const p = player.actor;
    this.decideAcc += dt;
    // decisão a 10 Hz: atacar se tiver ficha, cooldown pronto e estiver no alcance
    if (this.decideAcc >= 0.1) {
      this.decideAcc = 0;
      if (this.hasToken && this.cooldown <= 0 && dist < 2.6 && player.alive) {
        this.beginAttack();
        return;
      }
      if (rngs.ai.chance(0.03)) this.strafeDir *= -1;
    }
    // vai até o slot; perto do slot, circula olhando para o Márcio
    let tx = this.slot.x - a.pos.x;
    let tz = this.slot.z - a.pos.z;
    const toSlot = Math.hypot(tx, tz);
    let speed = 0;
    if (toSlot > 0.4) {
      speed = toSlot > 4 ? this.def.speed : this.def.walk + Math.min(1, toSlot / 4) * (this.def.speed - this.def.walk) * 0.5;
      tx /= toSlot;
      tz /= toSlot;
    } else {
      // circula devagar
      const yawTo = a.yawTo(p);
      tx = Math.cos(yawTo) * this.strafeDir;
      tz = -Math.sin(yawTo) * this.strafeDir;
      speed = this.def.walk * 0.45;
    }
    this.moveSpeed = damp(this.moveSpeed, speed, 0.1, dt);
    a.move(tx * this.moveSpeed * dt, tz * this.moveSpeed * dt, dt);
    // olha para o Márcio quando perto; senão para onde anda
    const faceYaw = dist < 7 ? a.yawTo(p) : Math.atan2(tx, tz);
    a.yaw = dampAngle(a.yaw, faceYaw, 0.08, dt);
    a.model.animator.speed = this.moveSpeed;
  }

  private beginAttack(): void {
    const id = rngs.ai.pick(this.def.attackSet);
    this.attack = attacksData.attacks[id]!;
    this.hitDone = false;
    // telegrafia: congela no início do golpe por um tempo (leitura justa) — a UI mostra o indicador
    this.telegraph = this.diff.telegraph * (this.attack.heavy ? 1.3 : 1);
    this.telegraphAmount = 0;
    const anim = this.actor.model.animator;
    anim.play(this.attack.clip, { speed: 0.12, start: this.attack.start, end: this.attack.end, fade: 0.1 });
    this.setState('windup');
  }

  takeHit(info: HitInfo): boolean {
    const a = this.actor;
    if (!a.alive) return false;
    this.lastHitTime = 0;
    this.engaged = true;
    a.hp = Math.max(0, a.hp - info.damage);
    a.yaw = Math.atan2(-info.dirX, -info.dirZ);
    const kb = info.attack.knockback;
    if (a.hp <= 0) {
      a.alive = false;
      this.hasToken = false;
      this.telegraphAmount = 0;
      a.push.set(info.dirX * kb * 2.5, 0, info.dirZ * kb * 2.5);
      this.setState('dead');
      events.emit('Killed', { victimId: a.id, killerId: info.attacker.id, archetype: this.archetypeId, tier: this.def.tier });
      return true;
    }
    a.poise -= info.attack.poise;
    const react = info.attack.react;
    const heavyReact = react === 'knockdown' || react === 'launch';
    // golpe pesado ou poise zerado → stagger; golpe leve em Heavy com poise sobrando não interrompe ataque
    if (a.poise <= 0 || heavyReact) {
      a.poise = this.def.poise;
      this.stun = heavyReact ? 0.95 : 0.75;
      a.push.set(info.dirX * kb * 3.2, 0, info.dirZ * kb * 3.2);
      a.model.animator.play('hitChest', { speed: 0.55, fade: 0.04 });
      this.cancelAttack();
      this.setState('stagger');
    } else if (this.state === 'attack' && this.def.poise >= 60 && !info.heavy) {
      // super-armor do Heavy: só leva o flash/dano
      a.push.set(info.dirX * kb * 0.6, 0, info.dirZ * kb * 0.6);
    } else {
      this.stun = 0.34;
      a.push.set(info.dirX * kb * 2.4, 0, info.dirZ * kb * 2.4);
      a.model.animator.play(react === 'head' ? 'hitHead' : 'hitChest', { speed: 1.05, fade: 0.03 });
      this.cancelAttack();
      this.setState('hit');
    }
    return true;
  }

  /** Trava o inimigo (vítima de finalização). */
  freezeFor(seconds: number): void {
    this.cancelAttack();
    this.hasToken = false;
    this.stun = seconds;
    this.actor.push.set(0, 0, 0);
    this.actor.model.animator.play('hitChest', { speed: 0.35, fade: 0.05, hold: true });
    this.setState('stagger');
  }

  private cancelAttack(): void {
    if (this.attack) {
      this.attack = null;
      this.cooldown = Math.max(this.cooldown, 0.5);
    }
    this.telegraphAmount = 0;
  }
}
