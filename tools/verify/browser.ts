/** Utilitários Playwright compartilhados por capture/perf/verify. */
import { chromium, type Browser, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..', '..');
export const BASE_URL = process.env.LOBO_URL ?? 'http://localhost:5180/ProjetoLobo/';

export async function launch(headed = !!process.env.HEADED): Promise<Browser> {
  return chromium.launch({
    headless: !headed,
    args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'],
  });
}

export async function openGame(browser: Browser, query: string, viewport = { width: 1280, height: 720 }): Promise<{ page: Page; logs: string[] }> {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${BASE_URL}?autotest=1&fixeddpr=1&${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (window as unknown as { __LOBO__?: { ready: boolean } }).__LOBO__?.ready === true, null, { timeout: 60000 });
  return { page, logs };
}

export function outDir(kind: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = resolve(ROOT, '.agent-tmp', kind, stamp);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export const lobo = (page: Page, expr: string) => page.evaluate(`window.__LOBO__.${expr}`);
