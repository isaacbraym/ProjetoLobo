/**
 * Capturas para revisão visual: `npm run capture [cenário]`.
 * Cenários: combat (padrão), menu, lobby. Saída: .agent-tmp/captures/<data>/*.png + state.json
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, openGame, outDir, lobo, ROOT } from './browser';
import { runControls } from './scenarioControls';
import { runWalkthrough } from './scenarioWalk';

const scenario = process.argv[2] ?? 'combat';
const dir = outDir('captures');
const browser = await launch();
try {
  if (scenario === 'face') {
    const { page, logs } = await openGame(browser, 'scene=sandbox-combat', { width: 900, height: 900 });
    await lobo(page, 'godMode(true)');
    await page.waitForTimeout(1500);
    // pausa os inimigos longe para não atrapalhar a foto
    // face_photo imita a foto de referência (pose parada, olhos na altura da câmera, perto) para comparação lado a lado
    const shots = [['photo', 0, 0.3, true, 60], ['front', 0, 0.75, false, 30], ['three_quarter', 35, 0.8, true, 30], ['profile', 85, 0.85, true, 30], ['body', 0, 2.6, false, 30]] as const;
    for (const [n, ang, dist, neutral, fov] of shots) {
      await lobo(page, `faceCam(true, ${dist}, ${ang}, ${neutral}, ${fov})`);
      await page.waitForTimeout(neutral ? 1400 : 900);
      await lobo(page, `faceCam(true, ${dist}, ${ang}, ${neutral}, ${fov})`); // reenquadra depois da pose assentar
      await page.waitForTimeout(300);
      await page.screenshot({ path: resolve(dir, `face_${n}.png`) });
    }
    writeFileSync(resolve(dir, 'logs.txt'), logs.join('\n'));
    // F11 no jogo: landmarks + SSIM da captura frontal contra a foto (tools/face/compare.ts)
    const { compareFace } = await import('../face/compare');
    console.log('[capture] rosto vs foto:', JSON.stringify(await compareFace(resolve(ROOT, 'assets-src/characters/marcio_face_src'), resolve(dir, 'face_photo.png'), dir)));
  } else if (scenario === 'wolf') {
    const { page, logs } = await openGame(browser, 'scene=sandbox-combat&perf=1');
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
  } else if (scenario === 'controls') {
    const { page, logs } = await openGame(browser, 'scene=sandbox-combat');
    const { failed, checks } = await runControls(page, dir);
    writeFileSync(resolve(dir, 'controls.json'), JSON.stringify({ failed, checks }, null, 2));
    writeFileSync(resolve(dir, 'logs.txt'), logs.join('\n'));
    console.log(`[capture] controles: ${failed.length ? 'FALHOU ' + failed.join(', ') : 'tudo ok'}`);
    console.log(JSON.stringify(checks));
  } else if (scenario === 'intro') {
    // abertura: quadros ao longo da cinemática para revisão de direção (enquadramento, ritmo, pés no chão)
    const { page, logs } = await openGame(browser, 'intro=1');
    const marks = [0.4, 2.5, 4.6, 6.0, 7.8, 9.0, 10.6, 12.2, 13.4, 15.2, 17.3, 18.8, 20.6, 22.2, 24.5];
    const t0 = Date.now();
    const info: unknown[] = [];
    for (const [i, m] of marks.entries()) {
      const wait = m * 1000 - (Date.now() - t0);
      if (wait > 0) await page.waitForTimeout(wait);
      await page.screenshot({ path: resolve(dir, `intro_${String(i).padStart(2, '0')}.png`) });
      info.push({ mark: m, cine: await lobo(page, 'cineState()') });
    }
    writeFileSync(resolve(dir, 'state.json'), JSON.stringify(info, null, 2));
    writeFileSync(resolve(dir, 'logs.txt'), logs.join('\n'));
  } else if (scenario === 'walk') {
    const { page, logs } = await openGame(browser, 'perf=1');
    const r = await runWalkthrough(page, dir, { maxSeconds: Number(process.argv[3] ?? 300), timeScale: Number(process.argv[4] ?? 1) });
    writeFileSync(resolve(dir, 'walk.json'), JSON.stringify(r, null, 2));
    writeFileSync(resolve(dir, 'logs.txt'), logs.join('\n'));
    console.log(`[capture] percurso: ${r.ok ? 'COMPLETO' : r.stuck ? 'TRAVOU' : 'NÃO TERMINOU'} em ${r.seconds}s → ${JSON.stringify(r.final)}`);
  } else if (scenario === 'floor1') {
    // revisão do andar 1: uma vista por sala (jogador teleportado para a sala = culling real) + vista de cima
    const { page, logs } = await openGame(browser, 'perf=1');
    await page.waitForTimeout(1200);
    const views: [string, number, number, number[], number[], number?][] = [
      ['01_entrada', 0, 10.4, [0, 1.75, 11.3], [0, 2.6, -6], 62],
      ['02_recepcao', -3, 8, [-5.5, 2.3, 9.5], [0.5, 1.0, 3.8]],
      ['03_catracas', 6, -2, [9, 2.6, 0.5], [-2, 1.4, -9]],
      ['04_mezanino', 4, 4, [6, 3.2, 6], [-13, 3, 1]],
      ['05_espera', 9, 1, [7.5, 2.1, -0.5], [13, 1, 5]],
      ['06_seguranca', 18, 10.5, [17.2, 2.2, 11.4], [22, 1.1, 5]],
      ['07_cafeteria', 18, 0, [17.4, 2.4, 1.4], [27, 1, -8]],
      ['08_balcao', 25, -3, [24, 1.9, -2.6], [30.6, 1.2, -9]],
      ['09_corredor', -13, -13.7, [-15, 1.8, -13.7], [20, 1.2, -13.7]],
      ['10_correspondencia', -12.3, -16.5, [-9, 2.1, -16.1], [-13.5, 0.9, -20.5]],
      ['11_banheiro', -4.5, -16.5, [-1.6, 2.1, -16.1], [-6, 0.9, -20.5]],
      ['12_deposito', 2.1, -16.5, [5.4, 2.1, -16.1], [1, 0.9, -20.5]],
      ['13_escada', 9.1, -16.5, [11.4, 2.1, -16.1], [8.5, 1, -20.5]],
    ];
    const stats: Record<string, unknown> = {};
    for (const [name, px, pz, c, l, fov] of views) {
      await lobo(page, `teleport(${px}, ${pz})`);
      await lobo(page, `cam(${c.join(',')}, ${l.join(',')}, ${fov ?? 58})`);
      await page.waitForTimeout(700);
      await page.screenshot({ path: resolve(dir, `floor_${name}.png`) });
      stats[name] = { floor: await lobo(page, 'floorStats()'), perf: await lobo(page, 'perf()') };
    }
    await lobo(page, 'showAllRooms(true)');
    await lobo(page, 'cam(8, 70, -4.9, 8, 0, -5, 42)');
    await page.waitForTimeout(800);
    await page.screenshot({ path: resolve(dir, 'floor_00_planta.png') });
    writeFileSync(resolve(dir, 'state.json'), JSON.stringify(stats, null, 2));
    writeFileSync(resolve(dir, 'logs.txt'), logs.join('\n'));
  } else if (scenario === 'menu') {
    const { page, logs } = await openGame(browser, 'menu=1');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: resolve(dir, 'menu.png') });
    // painel CONTROLES (DEC-0016): uma captura por dispositivo
    await page.click('[data-act="controls"]');
    await page.waitForTimeout(300);
    await page.screenshot({ path: resolve(dir, 'menu_controls_kbm.png') });
    await page.click('[data-dev="pad"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(dir, 'menu_controls_pad.png') });
    await page.click('[data-dev="touch"]');
    await page.waitForTimeout(200);
    await page.screenshot({ path: resolve(dir, 'menu_controls_touch.png') });
    writeFileSync(resolve(dir, 'logs.txt'), logs.join('\n'));
  } else {
    const { page, logs } = await openGame(browser, 'scene=sandbox-combat&perf=1');
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
