import * as THREE from 'three';
import type { Actor, HitInfo } from '../actors/actor';
import type { Fighter } from '../combat/fighter';
import type { CombatSystem } from '../combat/combatSystem';
import type { Input, ButtonAction } from '../../engine/input/input';
import type { ThirdPersonCamera } from '../../presentation/camera/thirdPersonCamera';
import type { AttackDef } from '../data/schemas';
import { attacksData } from '../data/gameData';
import { clamp, damp, dampAngle, easeOutCubic } from '../../core/math';
import { rngs } from '../../core/rng';
import { events } from '../../core/events';
import { audio } from '../../engine/audio/audio';

type PState = 'move' | 'attack' | 'dodge' | 'hit' | 'dead' | 'cine';

const RUN = 4.0;
const SPRINT = 6.2;
const WALK = 1.6;

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();

/** Controlador do Márcio: locomoção, free-flow, cadeia de combos, esquiva, dano. */
export class Player implements Fighter {
  readonly kind = 'player' as const;
  state: PState = 'move';
  stateTime = 0;
  lives = 3;
  private attack: AttackDef | null = null;
  lastAttackId = '';
  private hitDone = false;
  private lightStep = 0;
  private lastLightVariant = '';
  private sinceAttack = 99;
  private target: Fighter | null = null;
  private warpFrom = new THREE.Vector3();
  private dodgeDir = new THREE.Vector3();
  private dodgeDone = 0;
  private stun = 0;
  /** Esquiva perfeita ativa (janela em que golpes recebidos viram contra-ataque). */
  dodgeIFrames = 0;
  perfectWindow = 0;
  moveSpeed = 0;
  /** Multiplicadores externos (lobisomem). */
  damageMul = 1;
  speedMul = 1;
  damageTakenMul = 1;
  /** Pedido de transformação (o jogo decide se pode). */
  onWolfRequest: (() => boolean) | null = null;
  /** Interação contextual (finalização, pegar arma…). */
  onInteract: (() => boolean) | null = null;
  /** Bot de teste pode dirigir no lugar do jogador. */
  autopilot: ((p: Player) => { mx: number; my: number; press?: ButtonAction; sprint?: boolean }) | null = null;

  constructor(
    readonly actor: Actor,
    private combat: CombatSystem,
  ) {}

  get alive(): boolean {
    return this.actor.alive;
  }
  get staggered(): boolean {
    return false;
  }
  get inCombatAction(): boolean {
    return this.state === 'attack' || this.state === 'dodge';
  }
  get currentTarget(): Fighter | null {
    return this.target;
  }

  private setState(s: PState): void {
    this.state = s;
    this.stateTime = 0;
  }

  update(dt: number, input: Input, cam: ThirdPersonCamera): void {
    this.stateTime += dt;
    this.sinceAttack += dt;
    this.dodgeIFrames = Math.max(0, this.dodgeIFrames - dt);
    this.perfectWindow = Math.max(0, this.perfectWindow - dt);
    const a = this.actor;
    a.invulnerable = Math.max(0, a.invulnerable - dt);
    if (this.state === 'dead' || this.state === 'cine') return;

    // direção desejada relativa à câmera
    let mx = input.moveX;
    let my = input.moveY;
    let sprint = input.isHeld('sprint');
    if (this.autopilot) {
      const ap = this.autopilot(this);
      mx = ap.mx;
      my = ap.my;
      sprint = !!ap.sprint;
      if (ap.press) input.press(ap.press), input.release(ap.press);
    }
    cam.forward(_f);
    cam.right(_r);
    const dirX = _f.x * my + _r.x * mx;
    const dirZ = _f.z * my + _r.z * mx;
    const mag = clamp(Math.hypot(mx, my), 0, 1);

    switch (this.state) {
      case 'move':
        this.updateMove(dt, dirX, dirZ, mag, sprint);
        this.tryActions(input, dirX, dirZ, mag);
        break;
      case 'attack':
        this.updateAttack(dt, input, dirX, dirZ, mag);
        break;
      case 'dodge':
        this.updateDodge(dt, input, dirX, dirZ, mag);
        break;
      case 'hit':
        this.stun -= dt;
        a.move(0, 0, dt);
        this.moveSpeed = damp(this.moveSpeed, 0, 0.05, dt);
        a.model.animator.speed = 0;
        if (this.stun <= 0) this.setState('move');
        break;
    }
  }

  private updateMove(dt: number, dx: number, dz: number, mag: number, sprint: boolean): void {
    const a = this.actor;
    let target = 0;
    if (mag > 0.05) target = (mag < 0.55 ? WALK + (RUN - WALK) * (mag / 0.55) * 0.5 : sprint ? SPRINT : RUN) * this.speedMul;
    this.moveSpeed = damp(this.moveSpeed, target, target > this.moveSpeed ? 0.09 : 0.06, dt);
    if (mag > 0.05) {
      const l = Math.hypot(dx, dz) || 1;
      const yaw = Math.atan2(dx / l, dz / l);
      a.yaw = dampAngle(a.yaw, yaw, 0.045, dt);
    }
    // anda na direção em que está virado (curvas naturais)
    a.move(Math.sin(a.yaw) * this.moveSpeed * dt, Math.cos(a.yaw) * this.moveSpeed * dt, dt);
    a.model.animator.speed = this.moveSpeed;
  }

  private tryActions(input: Input, dx: number, dz: number, mag: number): boolean {
    const act = input.consume((x) => x === 'light' || x === 'heavy' || x === 'kick' || x === 'dodge' || x === 'wolf' || x === 'interact');
    if (!act) return false;
    if (act === 'interact') {
      this.onInteract?.();
      return true;
    }
    if (act === 'wolf') {
      this.onWolfRequest?.();
      return true;
    }
    if (act === 'dodge') {
      this.startDodge(dx, dz, mag);
      return true;
    }
    this.startAttack(act, dx, dz, mag);
    return true;
  }

  private pickAttack(kind: ButtonAction): string {
    const c = attacksData.combos;
    const comboAlive = this.sinceAttack < c.comboResetSeconds;
    const wolf = this.damageMul > 1;
    if (wolf && (kind === 'light' || kind === 'kick') && c.wolfLight) {
      if (!comboAlive) this.lightStep = 0;
      const step = c.wolfLight[this.lightStep % c.wolfLight.length]!;
      this.lightStep = (this.lightStep + 1) % c.wolfLight.length;
      return step.length > 1 ? rngs.combat.weighted(step, () => 1, this.lastLightVariant) : step[0]!;
    }
    if (wolf && kind === 'heavy' && c.wolfHeavy) return c.wolfHeavy[0]![0]!;
    if (kind === 'kick' && this.state === 'dodge' && c.afterDodgeKick) return c.afterDodgeKick;
    if (kind === 'light') {
      if (!comboAlive) this.lightStep = 0;
      const step = c.light[this.lightStep % c.light.length]!;
      // variante por contexto: alvo atordoado prefere o golpe mais forte da lista
      let id = step.length > 1 ? rngs.combat.weighted(step, () => 1, this.lastLightVariant) : step[0]!;
      if (this.target?.staggered && step.includes('p_uppercut')) id = 'p_uppercut';
      this.lastLightVariant = id;
      this.lightStep = (this.lightStep + 1) % c.light.length;
      return id;
    }
    if (kind === 'heavy') {
      const id = comboAlive && this.lightStep >= 2 ? c.lightToHeavy : c.heavy[0]![0]!;
      this.lightStep = 0;
      return id;
    }
    const kicks = c.kick[0]!;
    const id = kicks.length > 1 ? rngs.combat.weighted(kicks, () => 1, this.lastKick) : kicks[0]!;
    this.lastKick = id;
    return id;
  }

  private lastKick = '';

  /** Free-flow: melhor alvo no cone da direção desejada (ou da frente). */
  private chooseTarget(dx: number, dz: number, mag: number, maxDist: number): Fighter | null {
    const a = this.actor;
    let wantYaw = a.yaw;
    if (mag > 0.2) wantYaw = Math.atan2(dx, dz);
    let best: Fighter | null = null;
    let bestScore = Infinity;
    for (const f of this.combat.fighters) {
      if (f.kind === 'player' || !f.alive) continue;
      const d = a.distanceTo(f.actor);
      if (d > maxDist) continue;
      const yawTo = a.yawTo(f.actor);
      let ang = Math.abs(((yawTo - wantYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const limit = mag > 0.2 ? 1.25 : d < 2.2 ? Math.PI : 1.6;
      if (ang > limit) continue;
      const score = d * 0.55 + ang * 2.4 - (f.staggered ? 0.6 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
    }
    return best;
  }

  private startAttack(kind: ButtonAction, dx: number, dz: number, mag: number): void {
    const id = this.pickAttack(kind);
    const def = attacksData.attacks[id]!;
    this.attack = def;
    this.lastAttackId = id;
    this.hitDone = false;
    this.sinceAttack = 0;
    this.target = this.chooseTarget(dx, dz, mag, def.warp + 1);
    this.warpFrom.copy(this.actor.pos);
    const anim = this.actor.model.animator;
    anim.play(def.clip, { speed: def.speed, start: def.start, end: def.end, fade: 0.06 });
    audio.play(def.heavy ? 'whooshHeavy' : 'whoosh', 0.5);
    this.setState('attack');
  }

  private updateAttack(dt: number, input: Input, dx: number, dz: number, mag: number): void {
    const a = this.actor;
    const def = this.attack!;
    const anim = a.model.animator;
    const t = anim.shotTime;
    a.model.animator.speed = 0;
    this.moveSpeed = 0;
    // vira e avança até o alvo durante a antecipação (motion warping)
    if (this.target && this.target.alive && t < def.hitAt) {
      const ty = a.yawTo(this.target.actor);
      a.yaw = dampAngle(a.yaw, ty, 0.025, dt);
      const d = a.distanceTo(this.target.actor);
      const ideal = def.range * 0.78 + this.target.actor.radius * 0.5;
      const gap = d - ideal;
      if (gap > 0.02) {
        const remaining = Math.max(0.05, (def.hitAt - t) / def.speed);
        const step = Math.min(gap, (gap / remaining) * dt * 1.15, 14 * dt);
        a.move(Math.sin(ty) * step, Math.cos(ty) * step, dt);
      } else a.move(0, 0, dt);
    } else {
      // sem alvo: pequeno avanço no golpe
      const lunge = t < def.hitAt ? 1.2 : 0;
      a.move(Math.sin(a.yaw) * lunge * dt, Math.cos(a.yaw) * lunge * dt, dt);
    }
    if (!this.hitDone && t >= def.hitAt) {
      this.hitDone = true;
      // contra-ataque após esquiva perfeita é sempre crítico
      this.combat.resolve(this, def, this.damageMul, this.perfectWindow > 0);
    }
    // cancelamentos
    if (t >= def.cancelAt) {
      if (input.peek('dodge')) {
        input.consume((x) => x === 'dodge');
        this.startDodge(dx, dz, mag);
        return;
      }
      const next = input.consume((x) => x === 'light' || x === 'heavy' || x === 'kick');
      if (next) {
        this.startAttack(next, dx, dz, mag);
        return;
      }
    }
    if (!anim.busy || t >= def.end - 0.01) {
      this.attack = null;
      this.setState('move');
    }
  }

  private startDodge(dx: number, dz: number, mag: number): void {
    const a = this.actor;
    if (mag > 0.1) this.dodgeDir.set(dx, 0, dz).normalize();
    else this.dodgeDir.set(-Math.sin(a.yaw), 0, -Math.cos(a.yaw)); // sem direção: para trás
    a.yaw = Math.atan2(this.dodgeDir.x, this.dodgeDir.z);
    this.dodgeDone = 0;
    this.dodgeIFrames = 0.34;
    a.model.animator.play('roll', { speed: 2.1, start: 0.45, end: 1.75, fade: 0.06, fadeOut: 0.18 });
    audio.play('whoosh', 0.6);
    this.setState('dodge');
  }

  private updateDodge(dt: number, input: Input, dx: number, dz: number, mag: number): void {
    const a = this.actor;
    const dur = 0.42;
    const dist = 3.3;
    const k = Math.min(1, this.stateTime / dur);
    const want = easeOutCubic(k) * dist;
    const step = want - this.dodgeDone;
    this.dodgeDone = want;
    a.move(this.dodgeDir.x * step, this.dodgeDir.z * step, dt);
    a.model.animator.speed = 0;
    this.moveSpeed = 0;
    if (this.stateTime > 0.36) {
      const next = input.consume((x) => x === 'light' || x === 'heavy' || x === 'kick');
      if (next) {
        this.startAttack(next, dx, dz, mag);
        return;
      }
    }
    if (this.stateTime > 0.56 || !a.model.animator.busy) {
      a.model.animator.stopShot(0.15);
      this.moveSpeed = RUN * 0.6;
      this.setState('move');
    }
  }

  /** Golpe inimigo durante a esquiva = esquiva perfeita. */
  takeHit(info: HitInfo): boolean {
    const a = this.actor;
    if (!a.alive || a.invulnerable > 0 || this.state === 'cine') return false;
    if (this.dodgeIFrames > 0) {
      this.perfectWindow = 1.2;
      events.emit('PerfectDodge', { attackerId: info.attacker.id });
      return false;
    }
    a.hp = Math.max(0, a.hp - info.damage * this.damageTakenMul);
    a.push.set(info.dirX * info.attack.knockback * 2.2, 0, info.dirZ * info.attack.knockback * 2.2);
    events.emit('PlayerDamaged', { damage: info.damage, hp: a.hp });
    if (a.hp <= 0) {
      a.alive = false;
      this.setState('dead');
      return true;
    }
    this.stun = info.heavy ? 0.6 : 0.32;
    a.yaw = Math.atan2(-info.dirX, -info.dirZ);
    a.model.animator.play(info.attack.react === 'head' ? 'hitHead' : 'hitChest', { speed: info.heavy ? 0.95 : 1.2, start: 0.05, end: info.heavy ? 0.95 : 0.7, fade: 0.04, fadeOut: 0.2 });
    this.attack = null;
    this.setState('hit');
    return true;
  }

  respawn(at: THREE.Vector3): void {
    const a = this.actor;
    a.alive = true;
    a.hp = a.maxHp;
    a.invulnerable = 2;
    a.teleport(at);
    a.collider.setEnabled(true);
    this.setState('move');
  }

  setCine(on: boolean): void {
    this.setState(on ? 'cine' : 'move');
  }
}
