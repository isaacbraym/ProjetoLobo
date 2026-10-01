/**
 * Cenário dos controles "poucos botões" (DEC-0016): mira no mouse (cursor visível, sem pointer lock), toque × segurar
 * (leve na hora, carga, forte ao soltar), chute forte, Shift (esquiva/correr), G (câmera), Ctrl+W cancelado e o lobo
 * devorando um corpo com clique direito. Usado por `npm run capture controls` (com capturas) e pelo `verify`.
 */
import type { Page } from '@playwright/test';
import { resolve } from 'node:path';
import { lobo } from './browser';

export async function runControls(page: Page, dir: string | null): Promise<{ failed: string[]; checks: Record<string, unknown> }> {
  await lobo(page, 'godMode(true)');
  await lobo(page, 'freezeEnemies(true)');
  await page.waitForTimeout(1500);
  type St = { camMode: string; hovered: number | null; body: boolean; playerState: string; attackId: string; chargeLevel: number; target: number | null; hp: number; wolf: string; moveSpeed: number; corpses: number };
  const st = async () => (await lobo(page, 'aimState()')) as St;
  const shot = async (n: string) => {
    if (dir) await page.screenshot({ path: resolve(dir, `ctl_${n}.png`) });
  };
  const checks: Record<string, unknown> = {};
  const aimAt = async (id?: number) => {
    const es = (await lobo(page, `enemyScreen(${id ?? ''})`)) as { id: number; px: [number, number] } | null;
    if (es) await page.mouse.move(es.px[0], es.px[1], { steps: 3 });
    await page.waitForTimeout(120);
    return es;
  };
  checks.camDefault = (await st()).camMode;
  const es = await aimAt();
  checks.hover = (await st()).hovered === es?.id;
  await shot('1_hover');
  // toque: soco leve sai na hora, no inimigo sob o cursor
  await page.mouse.down();
  await page.waitForTimeout(50);
  await page.mouse.up();
  await page.waitForTimeout(90);
  let s1 = await st();
  checks.tap = { ok: s1.playerState === 'attack' && ['p_jab', 'p_cross', 'p_hook', 'p_body'].includes(s1.attackId), state: s1.playerState, attack: s1.attackId, targetIsHovered: s1.target === es?.id };
  await page.waitForTimeout(900);
  // segurar: carga → soltar = soco forte
  await aimAt(es?.id);
  await page.mouse.down();
  await page.waitForTimeout(750);
  s1 = await st();
  checks.charge = { ok: s1.playerState === 'charge' && s1.chargeLevel > 0.3, state: s1.playerState, level: +s1.chargeLevel.toFixed(2), attack: s1.attackId };
  await shot('2_charge');
  await page.mouse.up();
  await page.waitForTimeout(60);
  s1 = await st();
  checks.heavy = { ok: s1.playerState === 'attack' && ['p_slam', 'p_power_hook'].includes(s1.attackId), state: s1.playerState, attack: s1.attackId };
  await page.waitForTimeout(160);
  await shot('3_heavy');
  await page.waitForTimeout(1300);
  // clique direito segurado = chute forte
  await aimAt(es?.id);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(650);
  s1 = await st();
  const kCharge = s1.playerState === 'charge';
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(60);
  s1 = await st();
  checks.kickHeavy = { ok: kCharge && s1.playerState === 'attack' && ['p_roundhouse', 'p_kick_push'].includes(s1.attackId), charged: kCharge, attack: s1.attackId };
  await page.waitForTimeout(200);
  await shot('4_kick');
  await page.waitForTimeout(1300);
  // Shift: toque = esquiva, segurar = correr
  await page.keyboard.down('Shift');
  await page.waitForTimeout(70);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(60);
  checks.dodge = (await st()).playerState === 'dodge';
  await page.waitForTimeout(900);
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Shift');
  await page.waitForTimeout(1000);
  s1 = await st();
  checks.sprint = { ok: s1.moveSpeed > 5 && s1.playerState === 'move', speed: +s1.moveSpeed.toFixed(2) };
  await page.keyboard.up('Shift');
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  // G alterna câmera e mostra o aviso
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(150);
  const afterG = (await st()).camMode;
  const toast = await page.locator('.hud__toast.on').count();
  await shot('5_cam_free');
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(150);
  checks.camToggle = { ok: afterG === 'free' && (await st()).camMode === 'aim' && toast === 1, afterG, toast };
  // Ctrl+W: o jogo cancela o atalho (fechar a aba de verdade só é capturado com tela cheia + Keyboard Lock: NÃO VALIDADO headless)
  await page.evaluate(() => {
    const w = window as unknown as { __ctrlw?: boolean | null };
    w.__ctrlw = null;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyW' && e.ctrlKey) w.__ctrlw = e.defaultPrevented;
    });
  });
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyW');
  await page.keyboard.up('Control');
  await page.waitForTimeout(100);
  checks.ctrlW = { prevented: await page.evaluate(() => (window as unknown as { __ctrlw?: boolean | null }).__ctrlw), pageAlive: !page.isClosed() };
  // lobo: devorar um corpo com clique direito em cima dele
  await lobo(page, 'killAll()');
  await page.waitForTimeout(2600);
  await lobo(page, 'transform()');
  await page.waitForTimeout(2700);
  await lobo(page, 'hurt(40)');
  const hp0 = (await st()).hp;
  const bp = (await lobo(page, 'bodyScreen()')) as [number, number] | null;
  if (bp) await page.mouse.move(bp[0], bp[1], { steps: 3 });
  await page.waitForTimeout(150);
  const onBody = (await st()).body;
  await shot('6_eat_aim');
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(40);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(100);
  const eatState = (await st()).playerState;
  await page.waitForTimeout(500);
  await shot('7_eat');
  await page.waitForTimeout(900);
  s1 = await st();
  checks.eat = { ok: onBody && eatState === 'eat' && s1.hp > hp0, onBody, eatState, hpBefore: hp0, hpAfter: s1.hp, wolf: s1.wolf, bodyPx: bp, cursor: (s1 as unknown as { cursor: unknown }).cursor };
  const failed = Object.entries(checks)
    .filter(([, v]) => v === false || (typeof v === 'object' && v !== null && 'ok' in v && !(v as { ok: boolean }).ok))
    .map(([k]) => k);
  return { failed, checks };
}
