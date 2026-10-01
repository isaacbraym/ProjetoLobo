import * as THREE from 'three';
import type { AttackDef } from '../data/schemas';
import type { Fighter } from './fighter';
import type { HitInfo } from '../actors/actor';
import { events } from '../../core/events';
import { audio } from '../../engine/audio/audio';
import { rngs } from '../../core/rng';
import type { Particles } from '../../engine/vfx/particles';
import type { ThirdPersonCamera } from '../../presentation/camera/thirdPersonCamera';
import type { Renderer } from '../../engine/render/renderer';

const _v = new THREE.Vector3();

/**
 * Resolve golpes: alcance + arco, dano, hitstop local, feedback (sangue, som, tremor, aberração).
 * Não conhece música, UI ou barra do lobo — publica eventos.
 */
export class CombatSystem {
  fighters: Fighter[] = [];
  /** Multiplicador global de dano dos inimigos (dificuldade). */
  enemyDamageScale = 1;
  playerDamageScale = 1;
  combo = 0;
  private comboTimer = 0;

  constructor(
    private particles: Particles,
    private camera: ThirdPersonCamera,
    private renderer: Renderer,
  ) {}

  update(dt: number): void {
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        events.emit('ComboChanged', { count: 0 });
      }
    }
  }

  /** Alvos atingíveis por `attacker` com `def` (sem aplicar). */
  query(attacker: Fighter, def: AttackDef, out: Fighter[] = []): Fighter[] {
    out.length = 0;
    const a = attacker.actor;
    const half = THREE.MathUtils.degToRad(def.arc / 2);
    for (const f of this.fighters) {
      if (f === attacker || !f.alive || f.kind === attacker.kind) continue;
      const d = a.distanceTo(f.actor);
      if (d > def.range + f.actor.radius + 0.15) continue;
      if (d > 0.4 && a.angleTo(f.actor) > half) continue;
      out.push(f);
    }
    out.sort((x, y) => a.distanceTo(x.actor) - a.distanceTo(y.actor));
    return out;
  }

  private tmpTargets: Fighter[] = [];

  /**
   * Aplica o golpe. Retorna quantos alvos foram atingidos.
   * Crítico: sorteio por golpe (critChance), contra-ataque após esquiva perfeita (forceCrit) ou golpe pesado em alvo
   * atordoado/caído. Crítico dá 1,5× de dano e é um dos três casos em que há sangue (os outros: arma branca e fatal).
   */
  resolve(attacker: Fighter, def: AttackDef, damageMul = 1, forceCrit = false): number {
    const targets = this.query(attacker, def, this.tmpTargets);
    const maxTargets = attacker.kind === 'player' ? 3 : 1;
    let hits = 0;
    for (let i = 0; i < targets.length && hits < maxTargets; i++) {
      const t = targets[i]!;
      const a = attacker.actor;
      let dx = t.actor.pos.x - a.pos.x;
      let dz = t.actor.pos.z - a.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      const scale = attacker.kind === 'enemy' ? this.enemyDamageScale : this.playerDamageScale;
      const crit = forceCrit || (def.heavy && t.staggered) || rngs.combat.chance(def.critChance ?? (def.heavy ? 0.15 : 0.05));
      const info: HitInfo = { attacker: a, attack: def, damage: def.damage * scale * damageMul * (crit ? 1.5 : 1), dirX: dx, dirZ: dz, heavy: def.heavy };
      if (!t.takeHit(info)) continue;
      hits++;
      this.feedback(attacker, t, def, dx, dz, crit, !t.alive);
    }
    if (hits === 0) audio.play(def.heavy ? 'whooshHeavy' : 'whoosh', 0.8);
    return hits;
  }

  private feedback(attacker: Fighter, target: Fighter, def: AttackDef, dx: number, dz: number, crit: boolean, fatal: boolean): void {
    const boneName = def.react === 'head' || def.react === 'launch' ? 'Head' : 'spine_03';
    target.actor.model.boneWorld(boneName, _v);
    // hitstop local nos dois
    attacker.actor.model.animator.freeze = Math.max(attacker.actor.model.animator.freeze, def.hitstop);
    target.actor.model.animator.freeze = Math.max(target.actor.model.animator.freeze, def.hitstop * 1.1);
    target.actor.model.flash(def.heavy ? 1.3 : 1);
    if (crit || fatal || def.bleed) {
      // sangue só em crítico, arma branca/garra ou golpe fatal
      this.particles.blood(_v.x, _v.y, _v.z, dx, dz, fatal ? 1.7 : crit ? 1.25 : 0.9);
    } else {
      this.particles.impact(_v.x, _v.y, _v.z, dx, dz, def.heavy ? 1.2 : 0.8);
    }
    audio.play(def.sfx, crit ? 1.3 : 1);
    const toPlayer = target.kind === 'player';
    this.camera.addTrauma(def.shake * (toPlayer ? 1.3 : 0.75) * (crit ? 1.35 : 1));
    if (def.heavy || crit) this.renderer.chromaKick = Math.min(1, this.renderer.chromaKick + (crit ? 1 : 0.8));
    if (crit) {
      attacker.actor.model.animator.freeze = Math.max(attacker.actor.model.animator.freeze, def.hitstop * 1.6);
      target.actor.model.animator.freeze = Math.max(target.actor.model.animator.freeze, def.hitstop * 1.7);
    }
    if (attacker.kind === 'player') {
      this.combo++;
      this.comboTimer = 2.5;
      events.emit('ComboChanged', { count: this.combo });
    }
    events.emit('HitLanded', {
      attackerId: attacker.actor.id,
      targetId: target.actor.id,
      damage: def.damage,
      heavy: def.heavy,
      crit,
      x: _v.x,
      y: _v.y,
      z: _v.z,
    });
  }
}
