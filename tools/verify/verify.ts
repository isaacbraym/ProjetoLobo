/**
 * Portão único: `npm run verify` (completo) / `npm run verify:quick`.
 * Etapas em ordem, para na primeira falha grave, grava .agent-tmp/verify/<data>/report.json.
 */
import { spawnSync, spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ROOT, launch, openGame, outDir, lobo } from './browser';
import { runControls } from './scenarioControls';
import { runWalkthrough } from './scenarioWalk';

const quick = process.argv.includes('--quick');
const PREVIEW_PORT = 4180;
const dir = outDir('verify');
interface Step { name: string; ok: boolean; ms: number; detail?: unknown }
const steps: Step[] = [];

function run(name: string, cmd: string, args: string[]): boolean {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, shell: true, encoding: 'utf8' });
  const ok = r.status === 0;
  steps.push({ name, ok, ms: Date.now() - t0, detail: ok ? undefined : (r.stdout + r.stderr).slice(-4000) });
  console.log(`${ok ? '✔' : '✘'} ${name} (${Date.now() - t0} ms)`);
  if (!ok) console.log((r.stdout + r.stderr).slice(-2500));
  return ok;
}

function finish(): never {
  const ok = steps.every((s) => s.ok);
  writeFileSync(resolve(dir, 'report.json'), JSON.stringify({ ok, quick, date: new Date().toISOString(), steps }, null, 2));
  console.log(`\nverify ${quick ? '(quick) ' : ''}${ok ? 'PASS' : 'FAIL'} → ${resolve(dir, 'report.json')}`);
  process.exit(ok ? 0 : 1);
}

const seq: [string, string, string[]][] = [
  ['typecheck', 'npx', ['tsc', '--noEmit', '-p', 'tsconfig.json']],
  ['validate:data', 'npx', ['tsx', 'tools/pipeline/validate-data.ts']],
  ['lint:imports', 'npx', ['tsx', 'tools/pipeline/lint-imports.ts']],
  ['unit', 'npx', ['vitest', 'run', '--reporter=dot']],
];
for (const [n, c, a] of seq) if (!run(n, c, a)) finish();
if (quick) finish();

if (!run('build', 'npx', ['vite', 'build'])) finish();
// orçamento de tamanho do build
{
  let total = 0;
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else total += s.size;
    }
  };
  walk(resolve(ROOT, 'dist'));
  const mb = total / 1048576;
  steps.push({ name: 'build-size', ok: mb < 150, ms: 0, detail: `${mb.toFixed(1)} MB` });
  console.log(`${mb < 150 ? '✔' : '✘'} build-size ${mb.toFixed(1)} MB (limite 150)`);
}

// e2e contra o preview do build de produção
let server: ChildProcess | null = null;
/** No Windows `kill()` num processo com shell:true só mata o cmd e deixa o vite órfão segurando a porta. */
function killTree(p: ChildProcess | null): void {
  if (!p?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  else p.kill();
}
async function e2e(): Promise<void> {
  const t0 = Date.now();
  const previewUrl = `http://localhost:${PREVIEW_PORT}/ProjetoLobo/`;
  // porta ocupada = um preview antigo serviria um build velho e o e2e testaria a coisa errada
  if (await fetch(previewUrl).then(() => true, () => false)) throw new Error(`porta ${PREVIEW_PORT} já ocupada (preview órfão?) — mate o processo e rode de novo`);
  server = spawn('npx', ['vite', 'preview', '--port', String(PREVIEW_PORT), '--strictPort'], { cwd: ROOT, shell: true, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(previewUrl);
      if (r.ok && (await r.text()).includes('MÁRCIO')) break;
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  process.env.LOBO_URL = previewUrl;
  const browser = await launch();
  try {
    // 1) gate: sem senha, nenhum asset pesado é requisitado (L-09)
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const heavy: string[] = [];
      page.on('request', (r) => {
        if (/\.(glb|ktx2|m4a|mp3|ogg|wasm)(\?|$)/.test(r.url())) heavy.push(r.url());
      });
      await page.goto(`http://localhost:${PREVIEW_PORT}/ProjetoLobo/`, { waitUntil: 'networkidle' });
      const gateVisible = await page.locator('.gate').isVisible();
      steps.push({ name: 'e2e:gate', ok: gateVisible && heavy.length === 0, ms: 0, detail: { gateVisible, heavy } });
      await ctx.close();
    }
    // 2) combate com bot: vence, sem erros, fichas respeitadas (L-05, L-08)
    {
      const { page, logs } = await openGame(browser, 'scene=sandbox-combat&perf=1');
      await lobo(page, 'seed(7)');
      await lobo(page, 'godMode(true)');
      await lobo(page, 'bot(true, 7)');
      let maxAttackers = 0;
      let tokens = 0;
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(500);
        const s = (await lobo(page, 'state()')) as { activeAttackers: number; tokens: number };
        maxAttackers = Math.max(maxAttackers, s.activeAttackers);
        tokens = s.tokens;
      }
      const s = (await lobo(page, 'state()')) as { kills: number; corpses: number };
      const perf = await lobo(page, 'perf()');
      await page.screenshot({ path: resolve(dir, 'combat.png') });
      const errors = logs.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[error]'));
      steps.push({ name: 'e2e:combat-bot', ok: s.kills >= 3 && errors.length === 0, ms: 0, detail: { kills: s.kills, corpses: s.corpses, errors, perf } });
      steps.push({ name: 'e2e:tokens', ok: maxAttackers <= tokens, ms: 0, detail: { maxAttackers, tokens } });
    }
    // 3) controles "poucos botões" (DEC-0016): mira, toque × segurar, Shift, G, Ctrl+W, lobo devorando
    {
      const { page, logs } = await openGame(browser, 'scene=sandbox-combat');
      const r = await runControls(page, null);
      const errors = logs.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[error]'));
      steps.push({ name: 'e2e:controls', ok: r.failed.length === 0 && errors.length === 0, ms: 0, detail: { failed: r.failed, errors, checks: r.checks } });
    }
    // 4) andar 1 (DEC-0017): o bot explora, limpa os grupos, liberta reféns e chega no auditório; 30 s sem progresso = falha
    {
      const { page, logs } = await openGame(browser, 'perf=1');
      const r = await runWalkthrough(page, null, { maxSeconds: 160, timeScale: 2 });
      const errors = logs.filter((l) => l.startsWith('[pageerror]') || l.startsWith('[error]'));
      await page.screenshot({ path: resolve(dir, 'floor1_walk.png') });
      steps.push({ name: 'e2e:floor1-walk', ok: r.ok && errors.length === 0, ms: r.seconds * 1000, detail: { stuck: r.stuck, final: r.final, errors, seconds: r.seconds } });
    }
  } finally {
    await browser.close();
    killTree(server);
  }
  for (const s of steps.slice(-5)) console.log(`${s.ok ? '✔' : '✘'} ${s.name}`, s.ok ? '' : JSON.stringify(s.detail).slice(0, 800));
  steps.push({ name: 'e2e', ok: true, ms: Date.now() - t0 });
}

await e2e().catch((e) => steps.push({ name: 'e2e', ok: false, ms: 0, detail: String(e) }));
if (existsSync(resolve(dir, 'combat.png'))) console.log(`captura: ${resolve(dir, 'combat.png')}`);
finish();
