/**
 * Percurso automático do andar 1 (B2): o bot explora, briga com os grupos, liberta reféns, pega segredos e termina na
 * porta do auditório. Falha se ficar 30 s sem progresso (travamento) ou estourar o tempo.
 */
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { lobo } from './browser';

interface FloorState { room: string | null; progress: number; freed: number; hostages: number; secrets: number; groupsLeft: string[]; allClear: boolean; finished: boolean }

export async function runWalkthrough(page: Page, dir: string | null, opts: { maxSeconds?: number; timeScale?: number } = {}) {
  const maxS = opts.maxSeconds ?? 300;
  await lobo(page, 'godMode(true)');
  await lobo(page, `setTimeScale(${opts.timeScale ?? 1})`);
  await lobo(page, 'bot(true, 11)');
  let lastProgress = -1;
  // travamento medido em tempo de SIMULAÇÃO (o teste acelera o mundo, mas a transformação do lobo volta para 1×)
  let lastChangeSim = 0;
  let sim = 0;
  const t0 = Date.now();
  const timeline: unknown[] = [];
  let shot = 0;
  let st: FloorState | null = null;
  let stuck = false;
  while ((Date.now() - t0) / 1000 < maxS) {
    await page.waitForTimeout(2000);
    const s = (await lobo(page, 'state()')) as { floor: FloorState; kills: number; simTime: number; player: { pos: number[] } };
    st = s.floor;
    sim = s.simTime;
    timeline.push({ t: Math.round((Date.now() - t0) / 1000), sim: Math.round(s.simTime), kills: s.kills, pos: s.player.pos.map((v) => +v.toFixed(1)), ...st });
    if (st.progress !== lastProgress) {
      lastProgress = st.progress;
      lastChangeSim = sim;
    }
    if (dir && (Date.now() - t0) / 1000 > shot * 15) {
      await page.screenshot({ path: resolve(dir, `walk_${String(shot).padStart(2, '0')}.png`) });
      shot++;
    }
    if (st.finished) break;
    if (sim - lastChangeSim > 30) {
      stuck = true;
      break;
    }
  }
  if (dir) await page.screenshot({ path: resolve(dir, 'walk_end.png') });
  return { ok: !!st?.finished && !stuck, stuck, seconds: Math.round((Date.now() - t0) / 1000), final: st, timeline };
}
