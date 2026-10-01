/** Valida todo data/*.json com os mesmos schemas que o jogo usa. Sai ≠ 0 em erro. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ArchetypesFileSchema, AttacksFileSchema, DifficultyFileSchema, crossValidate } from '../../src/game/data/schemas';

const root = resolve(import.meta.dirname, '..', '..');
const read = (p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const errors: string[] = [];
const check = <T>(name: string, fn: () => T): T | null => {
  try {
    return fn();
  } catch (e) {
    errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
};
const attacks = check('data/combat/attacks.json', () => AttacksFileSchema.parse(read('data/combat/attacks.json')));
const arch = check('data/enemies/archetypes.json', () => ArchetypesFileSchema.parse(read('data/enemies/archetypes.json')));
check('data/difficulty.json', () => DifficultyFileSchema.parse(read('data/difficulty.json')));
const authored = check('data/anim/authored.json', () => read('data/anim/authored.json'));
if (attacks && arch) errors.push(...crossValidate(attacks, arch));
// L-04: nenhum ataque inimigo sem telegrafia mínima (a telegrafia vem da dificuldade, ≥ 0,15 s pelo schema)
if (authored) {
  for (const [name, c] of Object.entries((authored as { clips: Record<string, { keys: { t: number }[]; duration: number }> }).clips)) {
    const ts = c.keys.map((k) => k.t);
    if (ts.some((t, i) => i > 0 && t <= ts[i - 1]!)) errors.push(`authored ${name}: tempos das chaves precisam crescer`);
    if (ts[ts.length - 1]! > c.duration + 1e-6) errors.push(`authored ${name}: chave depois da duração`);
  }
}
if (errors.length) {
  console.error('[validate:data] FALHOU\n' + errors.join('\n'));
  process.exit(1);
}
console.log('[validate:data] ok');
