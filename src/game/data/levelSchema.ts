import { z } from 'zod';

/** Schema da planta de andar (data/levels/floorN/layout.json). Validado no boot e no `npm run validate:data`. */
const Rect = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const P2 = z.tuple([z.number(), z.number()]);

export const RoomSchema = z.object({
  id: z.string(),
  name: z.string(),
  rect: Rect,
  height: z.number().positive(),
  floor: z.string(),
  wall: z.string(),
  ceiling: z.string(),
  checkpoint: z.boolean().optional(),
  /** sala fechada (ainda sem interior jogável): só as paredes externas */
  closed: z.boolean().optional(),
});

export const DoorSchema = z.object({
  id: z.string(),
  a: z.string(),
  b: z.string().nullable(),
  axis: z.enum(['x', 'z']),
  at: z.number(),
  from: z.number(),
  to: z.number(),
  height: z.number().positive(),
  kind: z.enum(['opening', 'door', 'double', 'revolving']),
  state: z.enum(['open', 'locked']),
  label: z.string().optional(),
});

/** Prop: tipo + posição; demais campos são parâmetros do tipo (props.ts). */
export const PropSchema = z.object({ t: z.string(), x: z.number(), z: z.number() }).passthrough();

const BehaviorSchema = z.enum(['guard', 'talk', 'sit', 'villainGuard', 'patrol', 'idle']);
export const MemberSchema = z.object({
  a: z.string(),
  x: z.number(),
  z: z.number(),
  yaw: z.number(),
  do: BehaviorSchema,
  path: z.array(P2).optional(),
});

export const LevelSchema = z
  .object({
    $comment: z.string().optional(),
    id: z.string(),
    name: z.string(),
    spawn: z.object({ x: z.number(), z: z.number(), yaw: z.number() }),
    rooms: z.array(RoomSchema).min(1),
    doors: z.array(DoorSchema),
    facades: z.array(z.object({ room: z.string(), side: z.enum(['north', 'south', 'east', 'west']), kind: z.enum(['glass']) })),
    mezzanines: z.array(z.object({ room: z.string(), rect: Rect, level: z.number(), railing: z.array(Rect) })),
    props: z.array(PropSchema),
    scatter: z.array(z.object({ t: z.string(), room: z.string(), count: z.number().int().positive(), seed: z.number(), rect: Rect.optional() })),
    marks: z.array(z.object({ t: z.string(), x: z.number(), z: z.number() }).passthrough()),
    lights: z.array(
      z.object({
        room: z.string(),
        x: z.number(),
        y: z.number(),
        z: z.number(),
        color: z.string(),
        intensity: z.number().positive(),
        range: z.number().positive(),
        pulse: z.number().optional(),
        flicker: z.boolean().optional(),
      }),
    ),
    groups: z.array(
      z.object({
        id: z.string(),
        room: z.string(),
        intro: z.boolean().optional(),
        arena: z.string().optional(),
        members: z.array(MemberSchema).min(1),
      }),
    ),
    hostages: z.array(
      z.object({
        id: z.string(),
        group: z.string().nullable(),
        x: z.number(),
        z: z.number(),
        yaw: z.number(),
        pose: z.enum(['kneel', 'scared']),
        look: z.number().int().min(0),
        secret: z.boolean().optional(),
        label: z.string().optional(),
      }),
    ),
    arenas: z.array(
      z.object({
        id: z.string(),
        room: z.string(),
        zone: Rect,
        group: z.string(),
        barriers: z.array(z.string()).min(1),
        banner: z.string(),
        opening: z.enum(['rise', 'smash']),
      }),
    ),
    secrets: z.array(
      z.object({
        id: z.string(),
        room: z.string(),
        x: z.number(),
        z: z.number(),
        y: z.number().optional(),
        kind: z.enum(['medkit', 'guitar', 'hostage']),
        label: z.string(),
        heal: z.number().optional(),
        hostage: z.string().optional(),
      }),
    ),
    objectives: z.object({ hostages: z.string(), final: z.string(), finalDoor: z.string(), finalHint: z.string() }),
  })
  .superRefine((L, ctx) => {
    const rooms = new Set(L.rooms.map((r) => r.id));
    const err = (m: string) => ctx.addIssue({ code: 'custom', message: m });
    for (const r of L.rooms) if (!(r.rect[0] < r.rect[2] && r.rect[1] < r.rect[3])) err(`sala ${r.id}: retângulo invertido`);
    for (const d of L.doors) {
      if (!rooms.has(d.a) || (d.b !== null && !rooms.has(d.b))) err(`porta ${d.id}: sala inexistente`);
      if (!(d.from < d.to)) err(`porta ${d.id}: from < to`);
      // a porta precisa estar numa borda da sala a
      const ra = L.rooms.find((r) => r.id === d.a);
      if (ra) {
        const onEdge = d.axis === 'x' ? d.at === ra.rect[0] || d.at === ra.rect[2] : d.at === ra.rect[1] || d.at === ra.rect[3];
        if (!onEdge) err(`porta ${d.id}: não está numa parede da sala ${d.a}`);
      }
    }
    const groups = new Set(L.groups.map((g) => g.id));
    for (const g of L.groups) if (!rooms.has(g.room)) err(`grupo ${g.id}: sala ${g.room} inexistente`);
    for (const h of L.hostages) if (h.group !== null && !groups.has(h.group)) err(`refém ${h.id}: grupo ${h.group} inexistente`);
    const doors = new Set(L.doors.map((d) => d.id));
    for (const a of L.arenas) {
      if (!groups.has(a.group)) err(`arena ${a.id}: grupo ${a.group} inexistente`);
      for (const b of a.barriers) if (b !== 'turnstileGates' && !doors.has(b)) err(`arena ${a.id}: barreira ${b} desconhecida`);
    }
    for (const l of L.lights) if (!rooms.has(l.room)) err(`luz: sala ${l.room} inexistente`);
    for (const s of L.scatter) if (!rooms.has(s.room)) err(`scatter ${s.t}: sala ${s.room} inexistente`);
    for (const g of L.groups) for (const m of g.members) if (m.do === 'patrol' && (!m.path || m.path.length < 2)) err(`grupo ${g.id}: patrulha sem caminho`);
    if (!doors.has(L.objectives.finalDoor)) err('objetivo final: porta inexistente');
  });
export type LevelDef = z.infer<typeof LevelSchema>;
export type RoomDef = z.infer<typeof RoomSchema>;
export type DoorDef = z.infer<typeof DoorSchema>;
export type PropDef = z.infer<typeof PropSchema>;
