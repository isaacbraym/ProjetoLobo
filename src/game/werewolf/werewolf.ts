import * as THREE from 'three';
import wolfJson from '../../../data/werewolf.json';
import type { Player } from '../player/player';
import type { Enemy } from '../ai/enemy';
import type { ThirdPersonCamera } from '../../presentation/camera/thirdPersonCamera';
import type { FixedLoop } from '../../core/loop';
import type { Renderer } from '../../engine/render/renderer';
import type { Particles } from '../../engine/vfx/particles';
import { WolfVisual } from './wolfVisual';
import { audio } from '../../engine/audio/audio';
import { events } from '../../core/events';
import { attacksData } from '../data/gameData';

export type WolfState = 'human' | 'transforming' | 'wolf' | 'reverting';
const T = wolfJson.transform;

/**
 * Sistema do Lobisomem: barra → transformação cinematográfica (~2 s, close frontal, "FALA LOBINHO" com ducking,
 * rugido + onda de choque) → modo lobo com timer → retorno. A barra é alimentada por eventos (game.ts).
 */
export class WerewolfSystem {
  state: WolfState = 'human';
  meter = 0;
  timer = 0;
  private roarCd = 0;
  private t = 0;
  private roared = false;
  private voiced = false;
  readonly visual: WolfVisual;
  private headPos = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private flash: HTMLDivElement;

  constructor(
    private player: Player,
    private camera: ThirdPersonCamera,
    private loop: FixedLoop,
    private renderer: Renderer,
    private particles: Particles,
    private getEnemies: () => Enemy[],
    uiRoot: HTMLElement,
  ) {
    this.visual = new WolfVisual(player.actor.model);
    this.flash = document.createElement('div');
    this.flash.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:16;opacity:0;background:radial-gradient(circle at 50% 45%, rgba(255,170,60,.55), rgba(255,60,0,.15) 55%, transparent 75%);transition:opacity .25s';
    uiRoot.appendChild(this.flash);
    events.on('Killed', () => {
      if (this.state === 'wolf') this.timer = Math.min(wolfJson.duration.max, this.timer + wolfJson.duration.perKill);
    });
  }

  get active(): boolean {
    return this.state === 'wolf' || this.state === 'transforming';
  }
  get ready(): boolean {
    return this.state === 'human' && this.meter >= 100;
  }

  add(v: number): void {
    if (this.state !== 'human') return;
    const was = this.meter;
    this.meter = Math.min(100, this.meter + v);
    if (was < 100 && this.meter >= 100) events.emit('WolfMeterFull', {});
  }

  trigger(): boolean {
    if (!this.ready || !this.player.alive) return false;
    this.state = 'transforming';
    this.t = 0;
    this.roared = false;
    this.voiced = false;
    this.meter = 0;
    this.player.setCine(true);
    this.player.actor.invulnerable = 99;
    const anim = this.player.actor.model.animator;
    if (anim.has('wolfRoar')) anim.play('wolfRoar', { speed: 1.0, start: 0.2, fade: 0.15 });
    else anim.play('idleCombat', { fade: 0.1, hold: false });
    this.loop.timeScale = T.worldTimeScale;
    events.emit('WolfStart', {});
    return true;
  }

  /** Chamado por frame com dt REAL (não escalado): a cinemática roda em tempo real com o mundo lento. */
  update(realDt: number): void {
    const p = this.player.actor;
    this.roarCd = Math.max(0, this.roarCd - realDt);
    switch (this.state) {
      case 'transforming': {
        this.t += realDt;
        const t = this.t;
        if (!this.voiced && t >= T.voiceAt) {
          this.voiced = true;
          audio.playVoice('fala_lobinho', -18);
        }
        const g = Math.min(1, Math.max(0, (t - T.growStart) / (T.growEnd - T.growStart)));
        this.visual.amount = g;
        // câmera: close frontal no rosto → abre para corpo inteiro
        p.model.boneWorld('Head', this.headPos);
        const fx = Math.sin(p.yaw);
        const fz = Math.cos(p.yaw);
        if (t < T.pullbackAt) {
          const d = 0.95 - g * 0.15;
          this.camPos.set(this.headPos.x + fx * d, this.headPos.y + 0.04, this.headPos.z + fz * d);
          this.look.copy(this.headPos);
          this.camera.cine = { pos: this.camPos, look: this.look, fov: 34, blend: 1 };
          this.camera.addTrauma(0.03 * g);
          if (Math.random() < 0.3) this.particles.dust(p.pos.x, 0.1, p.pos.z, 0.4);
        } else {
          const k = Math.min(1, (t - T.pullbackAt) / 0.4);
          const d = 1.0 + k * 2.4;
          this.camPos.set(p.pos.x + fx * d, p.pos.y + 1.5 - k * 0.2, p.pos.z + fz * d);
          this.look.set(p.pos.x, p.pos.y + 1.2, p.pos.z);
          this.camera.cine = { pos: this.camPos, look: this.look, fov: 50, blend: 1 };
        }
        if (!this.roared && t >= T.roarAt) {
          this.roared = true;
          this.roar();
        }
        if (t >= T.controlAt) {
          this.player.actor.model.animator.setLocoSet({ idle: 'wolfIdle', walk: 'wolfWalk', jog: 'wolfRun', sprint: 'wolfRun' });
          this.state = 'wolf';
          this.timer = wolfJson.duration.base;
          this.camera.cine = null;
          this.loop.timeScale = 1;
          this.player.setCine(false);
          this.player.actor.invulnerable = 0.4;
          this.flash.style.opacity = '0';
        }
        break;
      }
      case 'wolf':
        this.visual.amount = 1;
        this.timer -= realDt * this.loop.timeScale;
        if (this.timer <= 0) {
          this.state = 'reverting';
          this.t = 0;
          audio.play('whooshHeavy', 0.8);
        }
        break;
      case 'reverting':
        this.t += realDt;
        this.visual.amount = Math.max(0, 1 - this.t / wolfJson.revert.total);
        if (Math.random() < 0.4) this.particles.dust(p.pos.x, 1.0, p.pos.z, 0.3);
        if (this.t >= wolfJson.revert.total) {
          this.player.actor.model.animator.setLocoSet({ idle: 'idleCombat', walk: 'walk', jog: 'jog', sprint: 'sprint' });
          this.state = 'human';
          this.visual.amount = 0;
          events.emit('WolfEnd', {});
        }
        break;
    }
  }

  /** Aplicar depois do mixer (escala de ossos sobrescreve pose). */
  applyVisual(): void {
    this.visual.apply(this.visual.amount);
  }

  /** Especial como lobo (Espaço/F): rugido em área com recarga. */
  specialRoar(): boolean {
    if (this.state !== 'wolf' || this.roarCd > 0) return false;
    this.roarCd = wolfJson.special.roarCooldown;
    this.player.actor.model.animator.play('wolfRoar', { speed: 1.6, start: 0.6, end: 2.2, fade: 0.08, fadeOut: 0.2 });
    this.roar();
    return true;
  }

  /** Lobo comeu um corpo: estende o tempo de lobo. */
  feed(seconds: number): void {
    if (this.state === 'wolf') this.timer = Math.min(wolfJson.duration.max, this.timer + seconds);
  }

  private roar(): void {
    audio.play('roar', 1.2);
    this.camera.addTrauma(0.85);
    this.renderer.chromaKick = 1;
    this.flash.style.opacity = '1';
    setTimeout(() => (this.flash.style.opacity = '0'), 260);
    const p = this.player.actor;
    this.particles.dust(p.pos.x, 0.1, p.pos.z, 3);
    const shock = attacksData.attacks.p_slam!;
    for (const e of this.getEnemies()) {
      if (!e.alive) continue;
      const d = e.actor.distanceTo(p);
      if (d > T.shockwaveRadius) continue;
      const dx = (e.actor.pos.x - p.pos.x) / (d || 1);
      const dz = (e.actor.pos.z - p.pos.z) / (d || 1);
      e.takeHit({ attacker: p, attack: { ...shock, knockback: T.shockwaveForce, react: 'knockdown' }, damage: 8, dirX: dx, dirZ: dz, heavy: true });
    }
  }

  /** Multiplicadores para o combate/movimento. */
  get damageMul(): number {
    return this.state === 'wolf' ? wolfJson.stats.damageMul : 1;
  }
  get speedMul(): number {
    return this.state === 'wolf' ? wolfJson.stats.speedMul : 1;
  }
  get timerFraction(): number {
    return this.state === 'wolf' ? this.timer / wolfJson.duration.max : 0;
  }
}
