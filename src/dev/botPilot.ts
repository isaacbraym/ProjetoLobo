import type { Game } from '../game/game';
import type { Player } from '../game/player/player';
import type { ButtonAction } from '../engine/input/input';
import { Rng } from '../core/rng';

/**
 * Bot de teste: anda até o inimigo mais próximo, encadeia combos, esquiva de golpes telegrafados.
 * Usado em cenários automáticos (detecta softlock e mede se o combate é vencível).
 */
export function createBot(game: Game, seed = 7) {
  const rng = new Rng(seed);
  let cool = 0;
  return (p: Player): { mx: number; my: number; press?: ButtonAction; sprint?: boolean } => {
    cool -= 1 / 60;
    const me = p.actor;
    let best = null as null | (typeof game.enemies)[number];
    let bd = Infinity;
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const d = me.distanceTo(e.actor);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) return { mx: 0, my: 0 };
    // converte direção de mundo para o espaço da câmera (mx/my)
    const cam = game.camera;
    const dx = best.actor.pos.x - me.pos.x;
    const dz = best.actor.pos.z - me.pos.z;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const l = Math.hypot(dx, dz) || 1;
    const my = (dx * fx + dz * fz) / l;
    const mx = (dx * rx + dz * rz) / l;
    // esquiva de golpe telegrafado próximo
    const threat = game.enemies.find((e) => e.alive && e.telegraphAmount > 0.55 && me.distanceTo(e.actor) < 2.6);
    if (threat && cool <= 0 && rng.chance(0.75)) {
      cool = 0.6;
      return { mx: -mx, my: -my, press: 'dodge' };
    }
    if (bd > 3.5) return { mx, my, sprint: bd > 7 };
    if (game.finishers?.candidate() && cool <= 0 && rng.chance(0.6)) {
      cool = 1.2;
      return { mx, my, press: 'interact' };
    }
    if (game.wolf?.ready && cool <= 0) {
      cool = 2.5;
      return { mx: 0, my: 0, press: 'special' };
    }
    if (cool <= 0) {
      cool = rng.range(0.12, 0.3);
      const r = rng.next();
      const press: ButtonAction = r < 0.6 ? 'light' : r < 0.76 ? 'heavy' : r < 0.9 ? 'kick' : 'kickHeavy';
      return { mx, my, press };
    }
    return { mx: mx * 0.3, my: my * 0.3 };
  };
}
