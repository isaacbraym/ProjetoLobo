/**
 * Capturas para revisão visual: `npm run capture [cenário]`.
 * Cenários: combat (padrão), menu, lobby. Saída: .agent-tmp/captures/<data>/*.png + state.json
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, openGame, outDir, lobo } from './browser';

const scenario = process.argv[2] ?? 'combat';
const dir = outDir('captures');
const browser = await launch();
try {
  if (scenario === 'face') {
    const { page, logs } = await openGame(browser, 'perf=1', { width: 900, height: 900 });
    await lobo(page, 'godMode(true)');
    await page.waitForTimeout(1500);
    // pausa os inimigos longe para não atrapalhar a foto
    for (const [n, ang, dist] of [['front', 0, 0.75], ['three_quarter', 35, 0.8], ['profile', 85, 0.85], ['body', 0, 2.6]] as const) {
      await lobo(page, `faceCam(true, ${dist}, ${ang})`);
      await page.waitForTimeout(900);
      await page.screenshot({ path: resolve(dir, `face_${n}.png`) });
    }
    writeFileSync(resolve(dir, 'logs.txt'), logs.join('\n'));
  } else if (scenario === 'wolf') {
    const { page, logs } = await openGame(browser, 'perf=1');
    await lobo(page, 'seed(42)');
    await lobo(page, 'godMode(true)');
    await page.waitForTimeout(2500);
    await lobo(page, 'transform()');
    const t0 = Date.now();
    const marks = [0.15, 0.45, 0.8, 1.1, 1.4, 1.7, 2.3];
    const info: unknown[] = [];
    for (const m of marks) {
      const wait = m * 1000 - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      await page.screenshot({ path: resolve(dir, `wolf_${String(m).replace('.', '_')}s.png`) });
      info.push({ t: m, wolf: await lobo(page, 'wolfState()') });
    }
    await lobo(page, 'bot(true, 5)');
    for (const m of [4, 6, 8]) {
      await page.waitForTimeout(2000);
      await page.screenshot({ path: resolve(dir, `wolf_fight_${m}s.png`) });
    }
    info.push({ state: await lobo(page, 'state()'), perf: await lobo(page, 'perf()') });
    writeFileSync(resolve(dir, 'state.json'), JSON.stringify(info, null, 2));
    writeFileSync(resolve(dir, 'logs.txt'), logs.join('\n'));
  } else if (scenario === 'menu') {
    const { page, logs } = await openGame(browser, 'menu=1&perf=1');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: resolve(dir, 'menu.png') });
    writeFileSync(resolve(dir, 'logs.txt'), logs.join('\n'));
  } else {
    const { page, logs } = await openGame(browser, 'perf=1');
    await lobo(page, 'seed(42)');
    await lobo(page, 'godMode(true)');
    await lobo(page, 'bot(true, 3)');
    const shots = [1.5, 3, 4.5, 6, 8, 10, 13, 16];
    let last = 0;
    for (const t of shots) {
      await page.waitForTimeout((t - last) * 1000);
      last = t;
      await page.screenshot({ path: resolve(dir, `combat_${String(t).replace('.', '_')}s.png`) });
    }
    const state = await lobo(page, 'state()');
    const perf = await lobo(page, 'perf()');
    writeFileSync(resolve(dir, 'state.json'), JSON.stringify({ state, perf }, null, 2));
    writeFileSync(resolve(dir, 'logs.txt'), logs.join('\n'));
  }
  console.log(`[capture] ${scenario} → ${dir}`);
} finally {
  await browser.close();
}
