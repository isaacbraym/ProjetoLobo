import * as THREE from 'three';
import type { Actor, HitInfo } from '../actors/actor';
import type { Fighter } from '../combat/fighter';
import type { CombatSystem } from '../combat/combatSystem';
import type { ArchetypeDef, AttackDef, DifficultyDef } from '../data/schemas';
import { attacksData } from '../data/gameData';
import { damp, dampAngle } from '../../core/math';
import { rngs } from '../../core/rng';
import { events } from '../../core/events';

export type EState = 'idle' | 'approach' | 'windup' | 'attack' | 'recover' | 'hit' | 'stagger' | 'down' | 'getup' | 'dead';

/** Antes da briga (inimigos posicionados no andar, DEC-0017). */
export type PreBehavior = 'guard' | 'talk' | 'sit' | 'villainGuard' | 'patrol' | 'idle';
export interface PreState {
  kind: PreBehavior;
  home: THREE.Vector3;
  homeYaw: number;
  path: THREE.Vector3[];
  pathIdx: number;
  wait: number;
  groupId: string;
  room: string;
}

const PRE_CLIP: Record<PreBehavior, string> = { guard: 'idle', talk: 'talk', sit: 'sitIdle', villainGuard: 'villainGuard', patrol: 'idle', idle: 'idle' };

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
  /** Comportamento antes da briga; null = já nasce na briga (cena de teste). */
  pre: PreState | null = null;
  /** Fora da vista e distraído: não simula nem anima (sala longe). */
  sleeping = false;
  /** Controlado por cinemática (a IA não mexe). */
  scripted = false;
  /** Escondido por cinemática (aparece depois). */
  hidden = false;
  /** Já percebeu o Márcio (inimigos posicionados começam distraídos). */
  aware = true;
  private alertIn = -1;
  /** Navegação entre salas (o andar devolve o próximo ponto: porta ou o próprio destino). */
  steer: ((fx: number, fz: number, tx: number, tz: number, out: THREE.Vector3) => void) | null = null;
  private steerOut = new THREE.Vector3();
  /** Linha livre entre dois pontos (paredes/móveis altos bloqueiam). Injetado no andar; nulo no sandbox. */
  los: ((ax: number, az: number, bx: number, bz: number) => boolean) | null = null;
  private losAcc = 0;
  private slotClear = true;
  private playerClear = true;

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
    return this.state === 'stagger' || this.state === 'down';
  }
  get attacking(): boolean {
    return this.state === 'windup' || this.state === 'attack';
  }

  private setState(s: EState): void {
    this.state = s;
    this.stateTime = 0;
  }

  /** Começa distraído com um comportamento (guarda, conversa, sentado, vigiando reféns, patrulha). */
  setPre(pre: PreState): void {
    this.pre = pre;
    this.aware = false;
    this.engaged = false;
    this.actor.yaw = pre.homeYaw;
    this.actor.model.animator.setLocoSet({ idle: PRE_CLIP[pre.kind] }, true);
  }

  /** Percebeu o Márcio (ou foi avisado pelo grupo): reage depois de `delay` s. */
  alert(delay = 0): void {
    if (this.aware || this.alertIn >= 0 || !this.actor.alive) return;
    this.alertIn = delay;
  }

  get alerting(): boolean {
    return this.alertIn >= 0;
  }

  private becomeAware(): void {
    this.aware = true;
    this.engaged = true;
    this.alertIn = -1;
    this.actor.model.animator.setLocoSet({ idle: 'idleCombat' });
    this.cooldown = Math.max(this.cooldown, rngs.ai.range(0.4, 1.0));
    this.setState('approach');
  }

  private updateUnaware(dt: number, player: Fighter): void {
    const a = this.actor;
    const pre = this.pre!;
    if (this.alertIn >= 0) {
      // reação: vira para o Márcio e entra na briga
      this.alertIn -= dt;
      a.yaw = dampAngle(a.yaw, a.yawTo(player.actor), 0.08, dt);
      if (pre.kind !== 'sit') a.move(0, 0, dt);
      if (this.alertIn < 0) this.becomeAware();
      return;
    }
    a.model.animator.strafe = 0;
    if (pre.kind === 'patrol' && pre.path.length > 1) {
      if (pre.wait > 0) {
        pre.wait -= dt;
        this.moveSpeed = damp(this.moveSpeed, 0, 0.1, dt);
      } else {
        const wp = pre.path[pre.pathIdx]!;
        const dx = wp.x - a.pos.x, dz = wp.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.35) {
          pre.pathIdx = (pre.pathIdx + 1) % pre.path.length;
          pre.wait = rngs.ai.range(1.0, 2.6);
        } else {
          this.moveSpeed = damp(this.moveSpeed, this.def.walk * 0.85, 0.15, dt);
          a.yaw = dampAngle(a.yaw, Math.atan2(dx, dz), 0.12, dt);
        }
      }
      a.move(Math.sin(a.yaw) * this.moveSpeed * dt, Math.cos(a.yaw) * this.moveSpeed * dt, dt);
      a.model.animator.speed = this.moveSpeed;
      return;
    }
    a.model.animator.speed = 0;
    a.yaw = dampAngle(a.yaw, pre.homeYaw, 0.3, dt);
    if (pre.kind !== 'sit') a.move(0, 0, dt);
  }

  update(dt: number, player: Fighter): void {
    this.stateTime += dt;
    this.lastHitTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const a = this.actor;
    if (!a.alive || this.scripted) return;
    if (!this.aware && this.state !== 'hit' && this.state !== 'stagger' && this.state !== 'down' && this.state !== 'getup') {
      this.updateUnaware(dt, player);
      return;
    }
    const p = player.actor;
    const dist = a.distanceTo(p);
    if (!this.engaged && this.pre === null && (dist < 14 || this.lastHitTime < 1)) this.engaged = true;

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
          act.setShotSpeed(this.attack!.speed);
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
        a.model.animator.strafe = 0;
        if (this.stun <= 0) this.setState('approach');
        break;
      case 'down':
        // caído: escorrega com o impulso, fica no chão um tempo e levanta
        this.stun -= dt;
        a.move(0, 0, dt);
        a.model.animator.speed = 0;
        if (this.stun <= 0) {
          const anim = a.model.animator;
          if (anim.has('getup')) {
            // Getting Up do Mixamo: o levantar de fato vai de ~2,2 s a ~6,6 s do clipe
            anim.play('getup', { speed: 1.6, start: 2.2, end: 6.6, fade: 0.3 });
            this.stun = (6.6 - 2.2) / 1.6 - 0.1;
            this.setState('getup');
          } else this.setState('approach');
        }
        break;
      case 'getup':
        this.stun -= dt;
        a.move(0, 0, dt);
        if (this.stun <= 0) {
          a.model.animator.stopShot(0.3);
          this.setState('approach');
        }
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
      // linha de visada (a 5 Hz): slot atrás de balcão/parede vira "persegue o Márcio pela navmesh"; sem ataque através de móvel
      this.losAcc += 0.1;
      if (this.los && this.losAcc >= 0.2) {
        this.losAcc = 0;
        this.slotClear = this.los(p.pos.x, p.pos.z, this.slot.x, this.slot.z);
        this.playerClear = this.los(a.pos.x, a.pos.z, p.pos.x, p.pos.z);
      }
      if (this.hasToken && this.cooldown <= 0 && dist < 2.6 && player.alive && this.playerClear) {
        this.beginAttack();
        return;
      }
      if (rngs.ai.chance(0.03)) this.strafeDir *= -1;
    }
    // vai até o slot (pelas portas, se estiver em outra sala); perto do slot, circula olhando para o Márcio
    let gx = this.slot.x, gz = this.slot.z;
    if (!this.slotClear || !this.playerClear) {
      gx = p.pos.x;
      gz = p.pos.z;
    }
    if (this.steer) {
      this.steer(a.pos.x, a.pos.z, gx, gz, this.steerOut);
      gx = this.steerOut.x;
      gz = this.steerOut.z;
    }
    let tx = gx - a.pos.x;
    let tz = gz - a.pos.z;
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
      speed = this.def.walk * 0.9;
    }
    this.moveSpeed = damp(this.moveSpeed, speed, 0.1, dt);
    a.move(tx * this.moveSpeed * dt, tz * this.moveSpeed * dt, dt);
    // olha para o Márcio quando perto; senão para onde anda
    const faceYaw = dist < 7 ? a.yawTo(p) : Math.atan2(tx, tz);
    a.yaw = dampAngle(a.yaw, faceYaw, 0.08, dt);
    a.model.animator.speed = this.moveSpeed;
    // componente lateral do movimento em relação à frente → strafe
    const lat = tx * Math.cos(a.yaw) - tz * Math.sin(a.yaw);
    a.model.animator.strafe = dist < 7 ? -lat : 0;
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
    if (!this.aware) {
      // pego de surpresa: entra na briga já (sem tempo de reação)
      this.aware = true;
      this.alertIn = -1;
      a.model.animator.setLocoSet({ idle: 'idleCombat' }, true);
    }
    a.hp = Math.max(0, a.hp - info.damage);
    a.yaw = Math.atan2(-info.dirX, -info.dirZ);
    // empurrão dividido pela massa do arquétipo (corpos pesados recuam pouco)
    const kb = info.attack.knockback / (this.def.mass ?? 1);
    if (a.hp <= 0) {
      a.alive = false;
      this.hasToken = false;
      this.telegraphAmount = 0;
      a.push.set(info.dirX * kb * 1.3, 0, info.dirZ * kb * 1.3);
      this.setState('dead');
      events.emit('Killed', { victimId: a.id, killerId: info.attacker.id, archetype: this.archetypeId, tier: this.def.tier });
      return true;
    }
    a.poise -= info.attack.poise;
    const react = info.attack.react;
    const heavyReact = react === 'knockdown' || react === 'launch';
    // golpe pesado ou poise zerado → stagger; golpe leve em Heavy com poise sobrando não interrompe ataque
    if (heavyReact && a.model.animator.has('knockdown')) {
      // derrubado de verdade: cai, fica no chão, levanta (Mixamo Knocked Down / Getting Up)
      a.poise = this.def.poise;
      this.stun = 1.6;
      a.push.set(info.dirX * kb * 1.7, 0, info.dirZ * kb * 1.7);
      a.model.animator.play('knockdown', { speed: 1.3, start: 0.2, end: 2.4, fade: 0.06, hold: true });
      this.cancelAttack();
      this.setState('down');
    } else if (a.poise <= 0 || heavyReact) {
      a.poise = this.def.poise;
      this.stun = heavyReact ? 0.95 : 0.75;
      a.push.set(info.dirX * kb * 1.4, 0, info.dirZ * kb * 1.4);
      a.model.animator.play('hitBig', { speed: 1.25, start: 0, end: 1.15, fade: 0.06 });
      this.cancelAttack();
      this.setState('stagger');
    } else if (this.state === 'attack' && this.def.poise >= 60 && !info.heavy) {
      // super-armor do Heavy: só leva o flash/dano
      a.push.set(info.dirX * kb * 0.25, 0, info.dirZ * kb * 0.25);
    } else {
      this.stun = 0.34;
      a.push.set(info.dirX * kb * 0.9, 0, info.dirZ * kb * 0.9);
      a.model.animator.play(react === 'head' ? 'hitHead' : 'hitChest', { speed: 1.15, start: 0.05, end: 0.75, fade: 0.04, fadeOut: 0.25 });
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
