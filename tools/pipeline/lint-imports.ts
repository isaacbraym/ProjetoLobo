/** Invariante L-01: src/game, src/engine, src/core e src/presentation nunca importam src/dev. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const bad: string[] = [];
function walk(dir: string): void {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(f)) {
      const src = readFileSync(p, 'utf8');
      const rel = relative(root, p).replace(/\\/g, '/');
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const spec = m[1] ?? m[2] ?? '';
        if (/(^|\/)dev\//.test(spec) && !rel.startsWith('src/dev/') && rel !== 'src/main.ts') bad.push(`${rel} importa ${spec}`);
        if (rel.startsWith('src/core/') && /(engine|game|presentation)\//.test(spec)) bad.push(`${rel} (core) importa ${spec}`);
      }
    }
  }
}
walk(resolve(root, 'src'));
if (bad.length) {
  console.error('[lint:imports] FALHOU\n' + bad.join('\n'));
  process.exit(1);
}
console.log('[lint:imports] ok');
