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
  if (scenario === 'menu') {
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
