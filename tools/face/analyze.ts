/**
 * Landmarks do rosto (MediaPipe Face Landmarker, 478 pontos + blendshapes + pose) e, opcionalmente, segmentação
 * multiclasse (cabelo / pele do rosto / pele do corpo / roupa / fundo) de imagens locais — ASSET_PIPELINE §3 (F2/F11).
 * Roda o MediaPipe numa página local aberta pelo Chromium headless (sem janela, sem rede: tudo servido do disco).
 *
 * Uso: npx tsx tools/face/analyze.ts <imagem> [<imagem>...] --out <saida.json> [--seg]
 * Modelos em tools/bin/ (face_landmarker.task, selfie_multiclass_256x256.tflite) — ver tools/face/README.md.
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const MP = resolve(ROOT, 'node_modules/@mediapipe/tasks-vision');
const ORIGIN = 'http://face.local';

export interface FaceResult {
  file: string;
  w: number;
  h: number;
  found: boolean;
  /** pixels da imagem: [x, y, z] (z na escala de x, negativo = mais perto da câmera) */
  landmarks?: [number, number, number][];
  blendshapes?: Record<string, number>;
  matrix?: number[] | null;
  /** máscaras de confiança 0–255 por classe (256x256): 0 fundo, 1 cabelo, 2 pele corpo, 3 pele rosto, 4 roupa, 5 outros */
  seg?: { w: number; h: number; conf: number[][] };
}

const MIME: Record<string, string> = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg' };

export async function analyzeImages(files: string[], wantSeg = false): Promise<FaceResult[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const imgs = new Map<string, string>();
    await page.route(`${ORIGIN}/**`, async (route) => {
      const path = new URL(route.request().url()).pathname;
      let file: string | undefined;
      if (path === '/' || path === '/index.html') file = resolve(ROOT, 'tools/face/landmarks.html');
      else if (path === '/vision_bundle.mjs') file = resolve(MP, 'vision_bundle.mjs');
      else if (path.startsWith('/wasm/')) file = resolve(MP, 'wasm', path.slice(6));
      else if (path.startsWith('/models/')) file = resolve(ROOT, 'tools/bin', path.slice(8));
      else if (path.startsWith('/img/')) file = imgs.get(path.slice(5));
      if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: 'nao encontrado' });
      // imagens sem extensão (ex.: assets-src/characters/marcio_face_src) → o navegador detecta pelo conteúdo
      return route.fulfill({ status: 200, body: readFileSync(file), contentType: MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
    });
    const logs: string[] = [];
    page.on('console', (m) => m.type() === 'error' && logs.push(m.text()));
    page.on('pageerror', (e) => logs.push(e.message));
    await page.goto(`${ORIGIN}/`);
    await page.waitForFunction(() => (window as unknown as { ready?: boolean }).ready === true, null, { timeout: 120000 }).catch((e) => {
      throw new Error(`MediaPipe não iniciou: ${e}\n${logs.join('\n')}`);
    });
    const out: FaceResult[] = [];
    for (const [i, f] of files.entries()) {
      const key = `i${i}`;
      imgs.set(key, resolve(f));
      const r = (await page.evaluate(([u, s]) => (window as unknown as { analyze: (u: string, s: boolean) => Promise<unknown> }).analyze(u as string, s as boolean), [`/img/${key}`, wantSeg])) as Omit<FaceResult, 'file'>;
      out.push({ file: f, ...r });
    }
    return out;
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const out = outIdx >= 0 ? argv[outIdx + 1]! : resolve(ROOT, '.agent-tmp/face/landmarks.json');
  const wantSeg = argv.includes('--seg');
  const files = argv.filter((a, i) => !a.startsWith('--') && i !== outIdx + 1);
  const res = await analyzeImages(files, wantSeg);
  writeFileSync(out, JSON.stringify(files.length === 1 ? res[0] : res));
  for (const r of res) console.log(`[face] ${r.file}: ${r.found ? `${r.landmarks!.length} pontos` : 'ROSTO NÃO ENCONTRADO'} (${r.w}x${r.h})${r.seg ? ' +seg' : ''}`);
  console.log(`[face] → ${out}`);
}
