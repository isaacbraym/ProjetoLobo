import { z } from 'zod';

/** Schemas de todo data/*.json. `npm run validate:data` usa os mesmos schemas que o jogo. */
export const AttackSchema = z.object({
  clip: z.string(),
  speed: z.number().positive(),
  start: z.number().min(0),
  hitAt: z.number().positive(),
  cancelAt: z.number().positive(),
  end: z.number().positive(),
  damage: z.number().positive(),
  poise: z.number().min(0),
  range: z.number().positive(),
  arc: z.number().positive().max(360),
  hitstop: z.number().min(0).max(0.25),
  knockback: z.number().min(0),
  shake: z.number().min(0).max(1),
  warp: z.number().min(0),
  react: z.enum(['head', 'chest', 'launch', 'knockdown']),
  sfx: z.string(),
  heavy: z.boolean(),
});
export type AttackDef = z.infer<typeof AttackSchema>;

export const AttacksFileSchema = z
  .object({
    $comment: z.string().optional(),
    attacks: z.record(z.string(), AttackSchema),
    combos: z.object({
      $comment: z.string().optional(),
      light: z.array(z.array(z.string()).min(1)).min(1),
      heavy: z.array(z.array(z.string()).min(1)).min(1),
      kick: z.array(z.array(z.string()).min(1)).min(1),
      lightToHeavy: z.string(),
      afterDodgeKick: z.string().optional(),
      wolfLight: z.array(z.array(z.string()).min(1)).optional(),
      wolfHeavy: z.array(z.array(z.string()).min(1)).optional(),
      comboResetSeconds: z.number().positive(),
    }),
  })
  .superRefine((f, ctx) => {
    for (const [id, a] of Object.entries(f.attacks)) {
      if (!(a.start < a.hitAt && a.hitAt <= a.cancelAt && a.cancelAt <= a.end))
        ctx.addIssue({ code: 'custom', message: `${id}: precisa start < hitAt <= cancelAt <= end` });
    }
    const all = [...f.combos.light.flat(), ...f.combos.heavy.flat(), ...f.combos.kick.flat(), f.combos.lightToHeavy,
      ...(f.combos.wolfLight ?? []).flat(), ...(f.combos.wolfHeavy ?? []).flat(), ...(f.combos.afterDodgeKick ? [f.combos.afterDodgeKick] : [])];
    for (const id of all) if (!f.attacks[id]) ctx.addIssue({ code: 'custom', message: `combo referencia ataque inexistente: ${id}` });
  });
export type AttacksFile = z.infer<typeof AttacksFileSchema>;

export const ArchetypeSchema = z.object({
  name: z.string(),
  tier: z.number().int().min(1).max(3),
  hp: z.number().positive(),
  poise: z.number().min(0),
  speed: z.number().positive(),
  walk: z.number().positive(),
  aggression: z.number().min(0).max(1),
  attackSet: z.array(z.string()).min(1),
  tokenCost: z.number().int().min(1),
  scale: z.number().positive(),
  width: z.number().positive(),
  colors: z.object({ main: z.string(), joints: z.string() }),
  bar: z.string(),
  /** id do personagem gerado no Blender (public/assets/characters/<model>.glb) */
  model: z.string().optional(),
  modelScale: z.number().positive().optional(),
  /** variações de cor por instância: nome do material → cor */
  palette: z.array(z.record(z.string(), z.string())).optional(),
});
export type ArchetypeDef = z.infer<typeof ArchetypeSchema>;
export const ArchetypesFileSchema = z.object({ $comment: z.string().optional(), archetypes: z.record(z.string(), ArchetypeSchema) });

export const DifficultySchema = z.object({
  label: z.string(),
  tokens: z.number().int().min(1),
  telegraph: z.number().min(0.15),
  cooldown: z.number().positive(),
  damage: z.number().positive(),
  waveScale: z.number().positive(),
  hp: z.number().positive(),
  wolfGain: z.number().positive(),
  eliteDodge: z.number().min(0).max(1),
});
export type DifficultyDef = z.infer<typeof DifficultySchema>;
export const DifficultyFileSchema = z.object({
  $comment: z.string().optional(),
  levels: z.object({ easy: DifficultySchema, normal: DifficultySchema, hard: DifficultySchema }),
});

/** Validação cruzada: attackSet dos arquétipos existe. */
export function crossValidate(attacks: AttacksFile, archetypes: z.infer<typeof ArchetypesFileSchema>): string[] {
  const errs: string[] = [];
  for (const [id, a] of Object.entries(archetypes.archetypes))
    for (const at of a.attackSet) if (!attacks.attacks[at]) errs.push(`arquétipo ${id}: ataque ${at} não existe`);
  return errs;
}
