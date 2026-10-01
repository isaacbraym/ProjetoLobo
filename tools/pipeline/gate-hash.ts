/**
 * Gera src/presentation/ui/gateHash.ts a partir de LOBO_PASSWORD no .env.local (fora do Git).
 * A senha em texto nunca entra em código, commit ou bundle — só sal + SHA-256(sal + senha).
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '..');
const envPath = resolve(root, '.env.local');
if (!existsSync(envPath)) {
  console.error('[gate:hash] .env.local não encontrado. Copie .env.example e defina LOBO_PASSWORD.');
  process.exit(1);
}
const m = readFileSync(envPath, 'utf8').match(/^LOBO_PASSWORD=(.*)$/m);
const pass = m?.[1]?.trim();
if (!pass) {
  console.error('[gate:hash] LOBO_PASSWORD vazio em .env.local');
  process.exit(1);
}
const outPath = resolve(root, 'src/presentation/ui/gateHash.ts');
// Mantém o sal se a senha não mudou (evita diffs inúteis).
let salt = randomBytes(16).toString('hex');
if (existsSync(outPath)) {
  const prev = readFileSync(outPath, 'utf8');
  const ps = prev.match(/GATE_SALT = '([0-9a-f]+)'/)?.[1];
  const ph = prev.match(/GATE_HASH = '([0-9a-f]+)'/)?.[1];
  if (ps && ph && createHash('sha256').update(ps + pass).digest('hex') === ph) salt = ps;
}
const hash = createHash('sha256').update(salt + pass).digest('hex');
writeFileSync(
  outPath,
  `// GERADO por \`npm run gate:hash\` a partir do .env.local. Não editar à mão. Não contém a senha.\n` +
    `export const GATE_SALT = '${salt}';\nexport const GATE_HASH = '${hash}';\nexport const GATE_LENGTH = ${pass.length};\n`,
);
console.log(`[gate:hash] ok → ${outPath} (comprimento ${pass.length})`);
