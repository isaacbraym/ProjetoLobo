/**
 * Formata JSON de dados para edição humana: objetos/arrays curtos ficam numa linha só (props, portas, membros…).
 * Uso: npx tsx tools/pipeline/format-json.ts <arquivo.json> [largura=160]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const inline = (v: unknown): string =>
  JSON.stringify(v, null, 1)
    .replace(/\n\s*/g, ' ')
    .replace(/\[ /g, '[')
    .replace(/ \]/g, ']');

export function formatJson(value: unknown, width = 160): string {
  const fmt = (v: unknown, indent: string, prefix: number): string => {
    const one = inline(v);
    if (v === null || typeof v !== 'object' || indent.length + prefix + one.length <= width) return one;
    const next = indent + '  ';
    if (Array.isArray(v)) return '[\n' + v.map((x) => next + fmt(x, next, 0)).join(',\n') + '\n' + indent + ']';
    const entries = Object.entries(v as Record<string, unknown>);
    return '{\n' + entries.map(([k, x]) => `${next}${JSON.stringify(k)}: ${fmt(x, next, JSON.stringify(k).length + 2)}`).join(',\n') + '\n' + indent + '}';
  };
  return fmt(value, '', 0) + '\n';
}

if (process.argv[1]?.endsWith('format-json.ts')) {
  const [file, w] = process.argv.slice(2);
  writeFileSync(file!, formatJson(JSON.parse(readFileSync(file!, 'utf8')), w ? Number(w) : 160));
  console.log(`[format-json] ${file}`);
}
