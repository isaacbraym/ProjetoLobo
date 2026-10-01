import * as THREE from 'three';
import type { Player } from '../player/player';
import type { Enemy } from '../ai/enemy';
import type { ThirdPersonCamera } from '../../presentation/camera/thirdPersonCamera';
import type { FixedLoop } from '../../core/loop';
import type { Particles } from '../../engine/vfx/particles';
import type { Renderer } from '../../engine/render/renderer';
import { attacksData } from '../data/gameData';
import { audio } from '../../engine/audio/audio';
import { events } from '../../core/events';
import { rngs } from '../../core/rng';

interface FinisherDef {
  id: string;
  clip: string;
  speed: number;
  start: number;
  impactAt: number;
  end: number;
  /** impulso de morte: frente (m/s) e vertical */
  fwd: number;
  up: number;
  blood: number;
  /** lado da câmera (+1 direita, −1 esquerda) e altura */
  camSide: number;
  camHeight: number;
}

const FINISHERS: FinisherDef[] = [
  { id: 'uppercut_fatal', clip: 'uppercut', speed: 0.85, start: 0.0, impactAt: 0.28, end: 0.7, fwd: 1.6, up: 5.0, blood: 2.6, camSide: 1, camHeight: 1.0 },
  { id: 'martelada', clip: 'heavySlam', speed: 1.1, start: 0.25, impactAt: 0.62, end: 1.0, fwd: 0.8, up: -3.0, blood: 2.2, camSide: -1, camHeight: 1.6 },
  { id: 'chute_voador', clip: 'kick', speed: 0.95, start: 0.0, impactAt: 0.24, end: 0.55, fwd: 6.0, up: 1.6, blood: 2.0, camSide: 1, camHeight: 1.2 },
];

/**
 * Finalizações cinematográficas rápidas (≤ ~1,2 s): câmera lateral, câmera lenta, congelamento no impacto,
 * explosão de sangue e ragdoll lançado. Disponível com inimigo atordoado ou com pouca vida, perto e à frente.
 */
export class FinisherSystem {
  active = false;
  private def: FinisherDef | null = null;
  private target: Enemy | null = null;
  private t = 0;
  private impacted = false;
  private last = '';
  private camPos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private v = new THREE.Vector3();
  /** Impulso de morte pedido (lido por game.makeCorpse). */
  readonly pendingImpulse = new Map<number, THREE.Vector3>();

  constructor(
    private player: Player,
    private camera: ThirdPersonCamera,
    private loop: FixedLoop,
    private particles: Particles,
    private renderer: Renderer,
    private enemies: () => Enemy[],
  ) {}

  /** Melhor alvo finalizável (ou null). */
  candidate(): Enemy | null {
    if (this.active || !this.player.alive || this.player.state !== 'move') return null;
    const p = this.player.actor;
    let best: Enemy | null = null;
    let bd = 2.4;
    for (const e of this.enemies()) {
      if (!e.alive) continue;
      const weak = e.staggered || e.actor.hp / e.actor.maxHp < 0.3;
      if (!weak) continue;
      const d = p.distanceTo(e.actor);
      if (d < bd && (d < 1.2 || p.angleTo(e.actor) < 1.3)) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  tryStart(): boolean {
    const e = this.candidate();
    if (!e) return false;
    const pool = FINISHERS.filter((f) => f.id !== this.last);
    this.def = rngs.combat.pick(pool);
    this.last = this.def.id;
    this.target = e;
    this.t = 0;
    this.impacted = false;
    this.active = true;
    const p = this.player.actor;
    // encosta os dois: Márcio de frente para a vítima a ~1 m
    const yaw = p.yawTo(e.actor);
    p.yaw = yaw;
    e.actor.yaw = yaw + Math.PI;
    const d = p.distanceTo(e.actor);
    if (d > 1.05) p.move(Math.sin(yaw) * (d - 1.0), Math.cos(yaw) * (d - 1.0), 1 / 60);
    this.player.setCine(true);
    p.invulnerable = 99;
    e.actor.invulnerable = 99;
    e.freezeFor(3);
    p.model.animator.play(this.def.clip, { speed: this.def.speed, start: this.def.start, end: this.def.end, fade: 0.05 });
    audio.play('whooshHeavy', 1);
    this.loop.timeScale = 0.55;
    events.emit('FinisherStarted', { targetId: e.actor.id, id: this.def.id });
    return true;
  }

  /** Por frame, com dt real. */
  update(realDt: number): void {
    if (!this.active || !this.def || !this.target) return;
    const def = this.def;
    const p = this.player.actor;
    const e = this.target;
    this.t += realDt * this.loop.timeScale;
    // câmera lateral olhando o ponto médio
    const mx = (p.pos.x + e.actor.pos.x) / 2;
    const mz = (p.pos.z + e.actor.pos.z) / 2;
    const rx = Math.cos(p.yaw) * def.camSide;
    const rz = -Math.sin(p.yaw) * def.camSide;
    this.camPos.set(mx + rx * 2.3 - Math.sin(p.yaw) * 0.6, def.camHeight, mz + rz * 2.3 - Math.cos(p.yaw) * 0.6);
    this.look.set(mx, 1.05, mz);
    this.camera.cine = { pos: this.camPos, look: this.look, fov: 42, blend: 1 };
    const clipT = p.model.animator.shotTime;
    if (!this.impacted && clipT >= def.impactAt) {
      this.impacted = true;
      this.impact();
    }
    if (clipT >= def.end - 0.02 || this.t > 2.2) this.finish();
  }

  private impact(): void {
    const def = this.def!;
    const p = this.player.actor;
    const e = this.target!;
    const wolf = this.player.damageMul > 1 ? 1.5 : 1;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    this.pendingImpulse.set(e.actor.id, new THREE.Vector3(fx * def.fwd * wolf, def.up * (def.up > 0 ? wolf : 1), fz * def.fwd * wolf));
    e.actor.model.boneWorld(def.up < 0 ? 'spine_03' : 'Head', this.v);
    this.particles.blood(this.v.x, this.v.y, this.v.z, fx, fz, def.blood * wolf);
    this.particles.blood(this.v.x, this.v.y, this.v.z, -fx * 0.3, -fz * 0.3, 1);
    if (def.up < 0) this.particles.dust(e.actor.pos.x, 0.1, e.actor.pos.z, 2);
    audio.play('punchHeavy', 1.3);
    audio.play('bodyfall', 0.6);
    this.camera.addTrauma(0.7);
    this.renderer.chromaKick = 1;
    p.model.animator.freeze = 0.09;
    e.actor.invulnerable = 0;
    const attack = { ...attacksData.attacks.p_slam!, react: 'knockdown' as const };
    e.takeHit({ attacker: p, attack, damage: 9999, dirX: fx, dirZ: fz, heavy: true });
    // congela o impacto um instante, depois acelera
    this.loop.timeScale = 0.12;
    setTimeout(() => {
      if (this.active) this.loop.timeScale = 0.6;
    }, 140);
  }

  private finish(): void {
    this.active = false;
    this.camera.cine = null;
    this.loop.timeScale = 1;
    this.player.setCine(false);
    this.player.actor.invulnerable = 0.5;
    this.def = null;
    this.target = null;
  }
}
