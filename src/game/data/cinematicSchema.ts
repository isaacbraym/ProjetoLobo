import { z } from 'zod';

/** Schema das cinemáticas (data/cinematics/*.json). Validado no boot e no `npm run validate:data`. */
const V3 = z.tuple([z.number(), z.number(), z.number()]);

export const CinematicEventSchema = z.discriminatedUnion('do', [
  z.object({ t: z.number(), do: z.literal('place'), actor: z.string(), x: z.number(), z: z.number(), yaw: z.number() }),
  z.object({ t: z.number(), do: z.literal('walk'), actor: z.string(), to: z.array(z.tuple([z.number(), z.number()])).min(1), speed: z.number().positive(), faceEnd: z.number().optional() }),
  z.object({ t: z.number(), do: z.literal('idle'), actor: z.string(), clip: z.string() }),
  z.object({ t: z.number(), do: z.literal('anim'), actor: z.string(), clip: z.string(), speed: z.number().optional(), start: z.number().optional(), end: z.number().optional() }),
  z.object({ t: z.number(), do: z.literal('upper'), actor: z.string(), clip: z.string().nullable() }),
  z.object({ t: z.number(), do: z.literal('attach'), actor: z.string(), prop: z.enum(['phone', 'coffee']) }),
  z.object({ t: z.number(), do: z.literal('detach'), actor: z.string(), prop: z.enum(['phone', 'coffee']) }),
  z.object({ t: z.number(), do: z.literal('drop'), actor: z.string(), prop: z.enum(['phone', 'coffee']) }),
  z.object({ t: z.number(), do: z.literal('hideGroup'), group: z.string() }),
  z.object({ t: z.number(), do: z.literal('showGroup'), group: z.string() }),
  z.object({ t: z.number(), do: z.literal('caption'), text: z.string(), who: z.string().optional(), style: z.enum(['line', 'location']).optional(), dur: z.number().positive() }),
  z.object({ t: z.number(), do: z.literal('title'), text: z.string(), sub: z.string().optional(), dur: z.number().positive() }),
  z.object({ t: z.number(), do: z.literal('sound'), id: z.string(), vol: z.number().optional() }),
  z.object({ t: z.number(), do: z.literal('shake'), amount: z.number() }),
  z.object({ t: z.number(), do: z.literal('end') }),
]);

export const CinematicSchema = z
  .object({
    $comment: z.string().optional(),
    id: z.string(),
    duration: z.number().positive(),
    skippableAfter: z.number().min(0),
    /** anchor: pos/look relativos à cabeça do ator (x = direita dele, y = cima, z = frente dele) */
    camera: z.array(z.object({ t: z.number(), pos: V3, look: V3, fov: z.number().positive(), cut: z.boolean().optional(), anchor: z.string().optional() })).min(1),
    dof: z.array(z.object({ t: z.number(), on: z.boolean(), target: z.string().optional(), bokeh: z.number().optional() })),
    rim: z.array(z.object({ t: z.number(), on: z.boolean(), target: z.string().optional(), color: z.string().optional(), intensity: z.number().optional() })),
    events: z.array(CinematicEventSchema),
  })
  .superRefine((c, ctx) => {
    for (let i = 1; i < c.camera.length; i++)
      if (c.camera[i]!.t < c.camera[i - 1]!.t) ctx.addIssue({ code: 'custom', message: `câmera: chave ${i} volta no tempo` });
    if (!c.events.some((e) => e.do === 'end')) ctx.addIssue({ code: 'custom', message: 'cinemática sem evento "end"' });
  });
export type CinematicDef = z.infer<typeof CinematicSchema>;
export type CinematicEvent = z.infer<typeof CinematicEventSchema>;
