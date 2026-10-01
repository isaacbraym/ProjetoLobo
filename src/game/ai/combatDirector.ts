import type { Enemy } from './enemy';
import type { Fighter } from '../combat/fighter';

/**
 * CombatDirector: fichas de ataque (no máximo N atacantes por dificuldade, Heavy custa mais) e slots em anéis
 * ao redor do Márcio (quem tem ficha fica no anel interno; o resto circula no externo). Evita bolo de inimigos.
 */
export class CombatDirector {
  tokens = 2;
  private acc = 0;
  innerRadius = 1.7;
  outerRadius = 4.2;

  update(dt: number, enemies: Enemy[], player: Fighter): void {
    this.acc += dt;
    if (this.acc < 0.1) return; // 10 Hz
    this.acc = 0;
    const p = player.actor;
    const engaged = enemies.filter((e) => e.alive && e.engaged);

    // 1) fichas: mantém quem está no meio do golpe; distribui o resto pelos melhores candidatos
    let used = 0;
    for (const e of engaged) {
      if (e.hasToken && (e.attacking || e.cooldown > 0.2)) used += e.def.tokenCost;
      else e.hasToken = false;
    }
    const candidates = engaged
      .filter((e) => !e.hasToken && e.state === 'approach' && e.cooldown <= 0)
      .map((e) => ({ e, score: e.actor.distanceTo(p) + (e.lastHitTime < 0.8 ? 3 : 0) - e.def.aggression * 1.5 }))
      .sort((a, b) => a.score - b.score);
    for (const { e } of candidates) {
      if (used + e.def.tokenCost > this.tokens) continue;
      e.hasToken = true;
      used += e.def.tokenCost;
    }

    // 2) slots: espalha ângulos em torno do Márcio mantendo cada um perto do ângulo atual (relaxação simples)
    if (!engaged.length) return;
    const items = engaged.map((e) => ({ e, ang: Math.atan2(e.actor.pos.x - p.pos.x, e.actor.pos.z - p.pos.z) }));
    items.sort((a, b) => a.ang - b.ang);
    const n = items.length;
    const minSep = Math.min((Math.PI * 2) / n, 1.0);
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < n; i++) {
        const a = items[i]!;
        const b = items[(i + 1) % n]!;
        let d = b.ang - a.ang;
        if (i === n - 1) d += Math.PI * 2;
        if (n > 1 && d < minSep) {
          const push = (minSep - d) / 2;
          a.ang -= push;
          b.ang += push;
        }
      }
    }
    for (const { e, ang } of items) {
      const r = e.hasToken ? this.innerRadius : this.outerRadius + (e.def.tokenCost > 1 ? -0.4 : 0);
      e.slotRadius = r;
      e.slot.set(p.pos.x + Math.sin(ang) * r, 0, p.pos.z + Math.cos(ang) * r);
    }
  }

  /** Quantos estão atacando agora (para o teste de invariante L-05). */
  activeAttackers(enemies: Enemy[]): number {
    return enemies.filter((e) => e.alive && e.attacking).reduce((s, e) => s + e.def.tokenCost, 0);
  }
}
