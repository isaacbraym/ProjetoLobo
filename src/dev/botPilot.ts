import * as THREE from 'three';
import type { Game } from '../game/game';
import type { Player } from '../game/player/player';
import type { ButtonAction } from '../engine/input/input';
import { Rng } from '../core/rng';

/**
 * Bot de teste: anda até o inimigo mais próximo, encadeia combos, esquiva de golpes telegrafados.
 * No andar (exploração), navega pelas portas: briga com quem está alerta, depois caça os grupos distraídos, pega os
 * segredos e termina na porta do auditório. Usado nos cenários automáticos (detecta travamento).
 */
export function createBot(game: Game, seed = 7) {
  const rng = new Rng(seed);
  let cool = 0;
  const steer = game.floor ? game.floor.makeSteer() : null;
  const wp = new THREE.Vector3();
  const last = new THREE.Vector3(1e9, 0, 0);
  let stuckT = 0;
  let unstick = 0;
  let unstickDir = 1;
  /** alvo de exploração quando não há briga */
  const explore = (me: THREE.Vector3): THREE.Vector3 | null => {
    const enc = game.encounters;
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const d = me.distanceTo(e.actor.pos);
      if (d < bd) (bd = d), (best = e.actor.pos);
    }
    if (best) return best;
    if (!enc || !game.floor) return null;
    for (const s of enc.pendingSecrets()) {
      const d = Math.hypot(s.x - me.x, s.z - me.z);
      if (d < bd) (bd = d), (best = new THREE.Vector3(s.x, 0, s.z));
    }
    if (best) return best;
    const fd = game.floor.doors.get(game.floor.def.objectives.finalDoor);
    return fd ? fd.center.clone().addScaledVector(fd.normal, -1.5) : null;
  };

  return (p: Player): { mx: number; my: number; press?: ButtonAction; sprint?: boolean } => {
    cool -= 1 / 60;
    const me = p.actor;
    let best = null as null | (typeof game.enemies)[number];
    let bd = Infinity;
    // arena trancada: só quem está do lado de dentro da grade
    const zone = game.encounters?.lockedZone() ?? null;
    for (const e of game.enemies) {
      if (!e.alive || (game.floor && !e.aware)) continue;
      if (zone && !game.encounters!.inside(zone, e.actor.pos.x, e.actor.pos.z)) continue;
      const d = me.distanceTo(e.actor);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    const cam = game.camera;
    const toInput = (tx: number, tz: number) => {
      // converte direção de mundo para o espaço da câmera (mx/my)
      const dx = tx - me.pos.x;
      const dz = tz - me.pos.z;
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
      const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      const l = Math.hypot(dx, dz) || 1;
      return { mx: (dx * rx + dz * rz) / l, my: (dx * fx + dz * fz) / l, dist: l };
    };
    // destrava: se não sai do lugar andando, dá uma volta de lado
    const moved = last.distanceTo(me.pos);
    if (moved < 0.02 && p.moveSpeed > 0.5) stuckT += 1 / 60;
    else stuckT = Math.max(0, stuckT - 1 / 30);
    last.copy(me.pos);
    if (stuckT > 1.2) {
      stuckT = 0;
      unstick = 0.8;
      unstickDir = rng.chance(0.5) ? 1 : -1;
    }
    const target = best ? best.actor.pos : explore(me.pos);
    if (!target) return { mx: 0, my: 0 };
    let tx = target.x, tz = target.z;
    if (steer && steer(me.pos.x, me.pos.z, tx, tz, wp)) {
      tx = wp.x;
      tz = wp.z;
    }
    let { mx, my } = toInput(tx, tz);
    if (unstick > 0) {
      unstick -= 1 / 60;
      const s = { mx: my * unstickDir, my: -mx * unstickDir };
      mx = s.mx;
      my = s.my;
    }
    if (!best) return { mx, my, sprint: true };
    // de perto mas com balcão/parede no meio: continua pelo caminho da navmesh
    const blocked = game.encounters ? !game.encounters.los(me.pos.x, me.pos.z, best.actor.pos.x, best.actor.pos.z) : false;
    const direct = blocked ? { mx, my, dist: bd } : toInput(best.actor.pos.x, best.actor.pos.z);
    // esquiva de golpe telegrafado próximo
    const threat = game.enemies.find((e) => e.alive && e.telegraphAmount > 0.55 && me.distanceTo(e.actor) < 2.6);
    if (threat && cool <= 0 && rng.chance(0.75)) {
      cool = 0.6;
      return { mx: -direct.mx, my: -direct.my, press: 'dodge' };
    }
    if (bd > 3.5 || blocked) return { mx, my, sprint: bd > 7 };
    if (game.finishers?.candidate() && cool <= 0 && rng.chance(0.6)) {
      cool = 1.2;
      return { mx: direct.mx, my: direct.my, press: 'interact' };
    }
    if (game.wolf?.ready && cool <= 0) {
      cool = 2.5;
      return { mx: 0, my: 0, press: 'special' };
    }
    if (cool <= 0) {
      cool = rng.range(0.12, 0.3);
      const r = rng.next();
      const press: ButtonAction = r < 0.6 ? 'light' : r < 0.76 ? 'heavy' : r < 0.9 ? 'kick' : 'kickHeavy';
      return { mx: direct.mx, my: direct.my, press };
    }
    return { mx: direct.mx * 0.3, my: direct.my * 0.3 };
  };
}
