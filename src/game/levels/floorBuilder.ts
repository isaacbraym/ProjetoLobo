import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Physics } from '../../engine/physics/physics';
import type { Renderer } from '../../engine/render/renderer';
import { Rng } from '../../core/rng';
import type { DoorDef, LevelDef, RoomDef } from '../data/levelSchema';
import { Batch, box, cyl, mat4 } from './kit';
import { LevelMaterials } from './levelMaterials';
import { LevelAtlas, drawBlood, drawBulletHole, drawSign } from './atlas';
import { PROPS, SCATTER, type PropCtx } from './props';
import type { LevelHandle } from './sandboxLobby';
import { NavFollower, NavWorld, type NavBox } from '../../engine/nav/navmesh';

/**
 * Construtor do andar a partir da planta em dados (data/levels/floorN/layout.json): salas com piso/forro/paredes
 * (vãos de porta recortados), fachada de vidro, mezanino, portas, props, espalhados e marcas. Geometria estática
 * mesclada por material e fatiada por sala (culling por sala: atual + vizinhas por portas abertas). Luzes: anclas da
 * planta servidas por um pool fixo de PointLights (sem recompilar shader quando a sala muda).
 */
export interface RoomHandle {
  def: RoomDef;
  group: THREE.Group;
  neighbors: Set<string>;
  tris: number;
}

export interface FloorHandle extends LevelHandle {
  def: LevelDef;
  rooms: Map<string, RoomHandle>;
  roomAt(x: number, z: number): RoomHandle | null;
  /** objetos expostos pelos props (ex.: abas das catracas) */
  exposed: Map<string, unknown>;
  doors: Map<string, DoorRuntime>;
  /** sala do jogador (atualizada no update) */
  current: RoomHandle | null;
  visibleRooms: Set<string>;
  setFocus(player: THREE.Vector3, camera: THREE.Vector3): void;
  /** debug: todas as salas visíveis */
  forceAll: boolean;
  /** debug: esconde os forros (vista de cima) */
  planView: boolean;
  stats(): { rooms: number; tris: number; drawGroups: number };
  /** Portas bloqueadas por barreira de arena (ninguém passa). */
  blockedDoors: Set<string>;
  /**
   * Navegação entre salas: devolve em `out` o próximo ponto para ir de (fx,fz) até (tx,tz) — o próprio destino se for a
   * mesma sala; senão o centro da próxima porta (e atravessa quando já está perto dela).
   */
  nextWaypoint(fx: number, fz: number, tx: number, tz: number, out: THREE.Vector3): boolean;
  /** Navmesh (gerada no carregamento por initNav). */
  nav: NavWorld | null;
  initNav(): Promise<void>;
  /** Navegação por agente: navmesh quando houver, senão o grafo de portas. */
  makeSteer(): (fx: number, fz: number, tx: number, tz: number, out: THREE.Vector3) => boolean;
}

export interface DoorRuntime {
  def: DoorDef;
  /** centro do vão no chão e direção da normal (de a para b) */
  center: THREE.Vector3;
  normal: THREE.Vector3;
  width: number;
}

const WALL_T = 0.2;
const LIGHT_POOL = 6;

function inside(r: RoomDef, x: number, z: number, m = 0): boolean {
  return x >= r.rect[0] - m && x <= r.rect[2] + m && z >= r.rect[1] - m && z <= r.rect[3] + m;
}

export function buildFloor(renderer: Renderer, physics: Physics, def: LevelDef): FloorHandle {
  const root = new THREE.Group();
  root.name = def.id;
  const scene = renderer.scene;
  const pmrem = new THREE.PMREMGenerator(renderer.gl);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.24;
  scene.background = new THREE.Color(0x0d0c10);
  scene.fog = new THREE.Fog(0x141118, 30, 80);

  const navBoxes: NavBox[] = [];
  physics.record = navBoxes;
  const mats = new LevelMaterials();
  const atlas = new LevelAtlas();
  // 'ceil:x' = mesmo material x, mas malha separada (a vista de planta esconde os forros)
  const getMat = (k: string): THREE.Material => (k.startsWith('atlas') ? atlas.material(k) : mats.get(k.startsWith('ceil:') ? k.slice(5) : k));
  const rooms = new Map<string, RoomHandle>();
  const batches = new Map<string, Batch>();
  const ticks: ((dt: number, t: number) => void)[] = [];
  const exposed = new Map<string, unknown>();
  for (const r of def.rooms) {
    const g = new THREE.Group();
    g.name = `room:${r.id}`;
    root.add(g);
    rooms.set(r.id, { def: r, group: g, neighbors: new Set(), tris: 0 });
    batches.set(r.id, new Batch());
  }
  const roomAt = (x: number, z: number): RoomHandle | null => {
    for (const rh of rooms.values()) if (inside(rh.def, x, z)) return rh;
    return null;
  };
  // vizinhança por portas (trancadas não deixam ver)
  for (const d of def.doors) {
    if (!d.b || d.state === 'locked') continue;
    rooms.get(d.a)!.neighbors.add(d.b);
    rooms.get(d.b)!.neighbors.add(d.a);
  }

  // chão físico único sob o andar
  {
    const xs = def.rooms.flatMap((r) => [r.rect[0], r.rect[2]]);
    const zs = def.rooms.flatMap((r) => [r.rect[1], r.rect[3]]);
    const x0 = Math.min(...xs) - 2, x1 = Math.max(...xs) + 2, z0 = Math.min(...zs) - 2, z1 = Math.max(...zs) + 8;
    physics.addStaticBox((x0 + x1) / 2, -0.5, (z0 + z1) / 2, (x1 - x0) / 2, 0.5, (z1 - z0) / 2);
  }

  // ---------- salas: piso, forro, paredes ----------
  const doorRuntimes = new Map<string, DoorRuntime>();
  for (const d of def.doors) {
    const mid = (d.from + d.to) / 2;
    const ra = rooms.get(d.a)!.def;
    const center = d.axis === 'x' ? new THREE.Vector3(d.at, 0, mid) : new THREE.Vector3(mid, 0, d.at);
    // normal de a para fora de a
    const normal = d.axis === 'x' ? new THREE.Vector3(d.at === ra.rect[0] ? -1 : 1, 0, 0) : new THREE.Vector3(0, 0, d.at === ra.rect[1] ? -1 : 1);
    doorRuntimes.set(d.id, { def: d, center, normal, width: d.to - d.from });
  }

  for (const rh of rooms.values()) {
    const r = rh.def;
    const b = batches.get(r.id)!;
    const [x0, z0, x1, z1] = r.rect;
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, H = r.height;
    b.add(r.floor, box(w, 0.1, d), mat4(cx, -0.05, cz));
    if (!r.closed) {
      b.add('ceil:' + r.ceiling, box(w, 0.06, d), mat4(cx, H + 0.03, cz));
      // forro com colisão: a câmera nunca sai da sala por cima
      physics.addStaticBox(cx, H + 0.15, cz, w / 2, 0.15, d / 2);
    }
    // as 4 paredes: [linha, eixo, de, até, normal para dentro]
    const edges: { axis: 'x' | 'z'; at: number; from: number; to: number; inward: number; side: 'north' | 'south' | 'east' | 'west' }[] = [
      { axis: 'z', at: z0, from: x0, to: x1, inward: 1, side: 'north' },
      { axis: 'z', at: z1, from: x0, to: x1, inward: -1, side: 'south' },
      { axis: 'x', at: x0, from: z0, to: z1, inward: 1, side: 'west' },
      { axis: 'x', at: x1, from: z0, to: z1, inward: -1, side: 'east' },
    ];
    for (const e of edges) {
      const facade = def.facades.find((f) => f.room === r.id && f.side === e.side);
      const openings = def.doors
        .filter((dd) => (dd.a === r.id || dd.b === r.id) && dd.axis === e.axis && Math.abs(dd.at - e.at) < 0.01)
        .sort((p, q) => p.from - q.from);
      if (facade) {
        buildGlassFacade(b, e, H, openings);
        continue;
      }
      // segmentos sólidos entre as portas + verga acima de cada porta
      let cur = e.from;
      const segs: [number, number, number, number][] = []; // [de, até, y0, y1]
      for (const o of openings) {
        if (o.from > cur) segs.push([cur, o.from, 0, H]);
        if (o.height < H) segs.push([o.from, o.to, o.height, H]);
        cur = Math.max(cur, o.to);
      }
      if (cur < e.to) segs.push([cur, e.to, 0, H]);
      const off = e.at + e.inward * (WALL_T / 2);
      for (const [a, c, y0, y1] of segs) {
        const len = c - a, mid = (a + c) / 2, hh = y1 - y0;
        if (len < 0.01 || hh < 0.01) continue;
        const m = e.axis === 'z' ? mat4(mid, (y0 + y1) / 2, off + e.inward * 0.01) : mat4(off + e.inward * 0.01, (y0 + y1) / 2, mid, Math.PI / 2);
        b.add(r.wall, box(len, hh, 0.02), m);
        if (y0 === 0) {
          // rodapé
          const mb = e.axis === 'z' ? mat4(mid, 0.06, off + e.inward * 0.03) : mat4(off + e.inward * 0.03, 0.06, mid, Math.PI / 2);
          b.add(r.closed ? r.wall : 'stoneDark', box(len, 0.12, 0.03), mb);
          // colisão (centrada na linha da parede)
          if (e.axis === 'z') physics.addStaticBox(mid, H / 2, e.at, len / 2, H / 2, WALL_T / 2);
          else physics.addStaticBox(e.at, H / 2, mid, WALL_T / 2, H / 2, len / 2);
        }
      }
      // portas que pertencem a esta sala como "a": batentes que fecham a espessura da parede
      for (const o of openings) if (o.a === r.id) buildDoorFrame(b, o, H);
    }
    if (r.id === 'atrio' || r.ceiling === 'atrium') atriumCeiling(b, r);
    else if (!r.closed) roomCeilingLights(b, r);
  }

  // ---------- portas: folhas, trancas ----------
  for (const [, dr] of doorRuntimes) buildDoorLeaves(dr, rooms, physics, getMat);

  // ---------- mezanino ----------
  for (const mz of def.mezzanines) {
    const b = batches.get(mz.room)!;
    const [x0, z0, x1, z1] = mz.rect;
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, y = mz.level;
    b.add('stone', box(w, 0.08, d), mat4(cx, y + 0.04, cz));
    b.add('paintWhite', box(w, 0.36, d), mat4(cx, y - 0.18, cz));
    physics.addStaticBox(cx, y - 0.2, cz, w / 2, 0.25, d / 2);
    for (const [ax, az, bx, bz] of mz.railing) {
      const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bz - az, bx - ax) * -1;
      const mx = (ax + bx) / 2, mzz = (az + bz) / 2;
      b.add('glass', box(len, 1.0, 0.02), mat4(mx, y + 0.55, mzz, ry));
      b.add('chrome', box(len, 0.05, 0.07), mat4(mx, y + 1.08, mzz, ry));
      b.add('stoneDark', box(len, 0.42, 0.12), mat4(mx, y - 0.19, mzz, ry));
      b.add('ledWarm', box(len, 0.03, 0.02), mat4(mx, y - 0.4, mzz, ry));
    }
    for (let x = x0 + 1; x < x1; x += 2) for (let z = z0 + 1.5; z < z1; z += 3) b.add('ledWarm', cyl(0.12, 0.12, 0.02, 12), mat4(x, y - 0.37, z));
  }

  // ---------- props ----------
  const doDyn = (room: RoomHandle, base: THREE.Matrix4) => (obj: THREE.Object3D) => {
    obj.updateMatrix();
    obj.applyMatrix4(base);
    room.group.add(obj);
  };
  const roomFor = (x: number, z: number, ry: number): RoomHandle | null => roomAt(x + Math.sin(ry) * 0.35, z + Math.cos(ry) * 0.35) ?? roomAt(x, z);
  def.props.forEach((p, i) => {
    const fn = PROPS[p.t];
    const ry = typeof p.ry === 'number' ? p.ry : 0;
    const room = roomFor(p.x, p.z, ry);
    if (!fn || !room) {
      console.warn('[floor] prop ignorado:', p.t, p.x, p.z);
      return;
    }
    const base = mat4(p.x, 0, p.z, ry);
    const ctx: PropCtx = {
      batch: batches.get(room.def.id)!,
      atlas,
      base,
      ry,
      p: { ...p, level: def },
      rng: new Rng(1000 + i * 31),
      roomHeight: room.def.height,
      collide: (w, h, d, lx, ly, lz, lry = 0) => {
        const c = new THREE.Vector3(lx, ly, lz).applyMatrix4(base);
        physics.addStaticBox(c.x, c.y, c.z, w / 2, h / 2, d / 2, ry + lry);
      },
      dyn: doDyn(room, base),
      tick: (f) => ticks.push(f),
      expose: (k, v) => exposed.set(k, v),
      getMat,
    };
    fn(ctx);
  });

  // ---------- espalhados ----------
  for (const sc of def.scatter) {
    const room = rooms.get(sc.room)!;
    const rng = new Rng(sc.seed * 97 + 5);
    const [a, b0, c, d] = sc.rect ?? [room.def.rect[0] + 0.7, room.def.rect[1] + 0.7, room.def.rect[2] - 0.7, room.def.rect[3] - 0.7];
    const fn = SCATTER[sc.t];
    if (!fn) continue;
    for (let i = 0; i < sc.count; i++) {
      const x = a + rng.next() * (c - a), z = b0 + rng.next() * (d - b0), ry = rng.next() * Math.PI * 2;
      fn({ batch: batches.get(sc.room)!, atlas, base: mat4(x, 0, z, ry), ry, p: {}, rng, roomHeight: room.def.height, collide: () => {}, dyn: doDyn(room, mat4(x, 0, z, ry)), tick: () => {}, expose: () => {}, getMat });
    }
  }

  // ---------- marcas: buracos de bala e sangue ----------
  const holeUv = atlas.alloc(64, 64, drawBulletHole());
  const bloodUvs = [1, 2, 3].map((s) => atlas.alloc(256, 256, drawBlood(s)));
  def.marks.forEach((mk, i) => {
    const room = roomAt(mk.x as number, mk.z as number) ?? roomFor(mk.x as number, mk.z as number, (mk.ry as number) ?? 0);
    if (!room) return;
    const b = batches.get(room.def.id)!;
    const rng = new Rng(77 + i);
    if (mk.t === 'bulletHoles') {
      const n = (mk.count as number) ?? 5, ry = (mk.ry as number) ?? 0, y = (mk.y as number) ?? 1.8;
      for (let k = 0; k < n; k++) {
        const s = 0.06 + rng.next() * 0.05;
        const lx = (rng.next() - 0.5) * 1.6, ly = y + (rng.next() - 0.5) * 1.0;
        b.add(LevelAtlas.key('atlasDecal', holeUv), LevelAtlas.quad(s, s, holeUv), new THREE.Matrix4().multiplyMatrices(mat4(mk.x as number, 0, mk.z as number, ry), mat4(lx, ly, 0.06)), false);
      }
    } else if (mk.t === 'bloodSmear') {
      const s = ((mk.s as number) ?? 1) * 1.6;
      const buv = bloodUvs[i % 3]!;
      b.add(LevelAtlas.key('atlasDecal', buv), LevelAtlas.quad(s, s, buv), mat4(mk.x as number, 0.012, mk.z as number, rng.next() * 6, -Math.PI / 2), false);
    }
  });

  // ---------- fachada: cidade à noite lá fora ----------
  for (const f of def.facades) {
    const r = rooms.get(f.room)!.def;
    if (f.side !== 'south') continue;
    const cityMat = new THREE.MeshBasicMaterial({ map: makeNightCity(), toneMapped: true });
    const w = r.rect[2] - r.rect[0];
    const city = new THREE.Mesh(new THREE.PlaneGeometry(w * 2.6, r.height * 1.4), cityMat);
    city.position.set((r.rect[0] + r.rect[2]) / 2, r.height * 0.55, r.rect[3] + 7);
    city.rotation.y = Math.PI;
    rooms.get(f.room)!.group.add(city);
    const street = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, 14), new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.4, envMapIntensity: 1.5 }));
    street.rotation.x = -Math.PI / 2;
    street.position.set((r.rect[0] + r.rect[2]) / 2, -0.02, r.rect[3] + 7);
    rooms.get(f.room)!.group.add(street);
  }

  physics.record = null;
  // ---------- mescla dos lotes ----------
  atlas.finish();
  let totalTris = 0;
  for (const rh of rooms.values()) {
    const b = batches.get(rh.def.id)!;
    rh.tris = b.tris;
    totalTris += b.tris;
    b.build(rh.group, getMat, (k) => mats.casts(k) && !k.startsWith('atlas'));
    if (rh.def.closed) rh.group.visible = false;
  }

  // ---------- luzes: pool fixo servido pelas âncoras mais próximas ----------
  scene.add(new THREE.HemisphereLight(0x9fb0ff, 0x1a120c, 0.22));
  const anchors = def.lights.map((l) => ({ ...l, pos: new THREE.Vector3(l.x, l.y, l.z), col: new THREE.Color(l.color), cur: 1 }));
  const pool: THREE.PointLight[] = [];
  for (let i = 0; i < LIGHT_POOL; i++) {
    const pl = new THREE.PointLight(0xffffff, 0, 10, 2);
    root.add(pl);
    pool.push(pl);
  }
  const key = new THREE.DirectionalLight(0xffe6c8, 1.5);
  key.castShadow = renderer.preset.shadows !== 'blob';
  key.shadow.mapSize.set(renderer.preset.shadowMapSize, renderer.preset.shadowMapSize);
  const sc = key.shadow.camera;
  sc.left = -9;
  sc.right = 9;
  sc.top = 9;
  sc.bottom = -9;
  sc.near = 1;
  sc.far = 30;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  root.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x7fa8ff, 0.9);
  rim.position.set(-4, 6, 16);
  root.add(rim);
  scene.add(root);

  const focus = new THREE.Vector3(def.spawn.x, 0, def.spawn.z);
  const camPos = new THREE.Vector3();
  const visible = new Set<string>();
  let current: RoomHandle | null = null;
  let t = 0;
  const assignLights = () => {
    const scored = anchors
      .filter((a) => visible.has(a.room))
      .map((a) => ({ a, d: a.pos.distanceTo(focus) - (a.room === current?.def.id ? 6 : 0) }))
      .sort((p, q) => p.d - q.d);
    for (let i = 0; i < pool.length; i++) {
      const s = scored[i];
      const pl = pool[i]!;
      if (!s) {
        pl.intensity = 0;
        continue;
      }
      pl.position.copy(s.a.pos);
      pl.color.copy(s.a.col);
      pl.distance = s.a.range;
      pl.userData.anchor = s.a;
    }
  };
  let lightAcc = 1;

  const handle: FloorHandle = {
    root,
    def,
    rooms,
    exposed,
    doors: doorRuntimes,
    get current() {
      return current;
    },
    visibleRooms: visible,
    nav: null,
    async initNav() {
      handle.nav = await NavWorld.build(navBoxes);
      if (handle.nav) console.info(`[nav] navmesh pronta em ${handle.nav.buildMs.toFixed(0)} ms (${navBoxes.length} caixas)`);
    },
    makeSteer() {
      const follower = handle.nav ? new NavFollower(handle.nav) : null;
      return (fx, fz, tx, tz, out) => {
        if (follower && follower.next(fx, fz, tx, tz, out)) return true;
        return handle.nextWaypoint(fx, fz, tx, tz, out);
      };
    },
    blockedDoors: new Set<string>(),
    nextWaypoint(fx, fz, tx, tz, out) {
      out.set(tx, 0, tz);
      const ra = roomAt(fx, fz), rb = roomAt(tx, tz);
      if (!ra || !rb || ra === rb) return true;
      // BFS no grafo de salas pelas portas abertas
      const prev = new Map<string, { room: string; door: DoorRuntime }>();
      const q = [ra.def.id];
      const seen = new Set(q);
      while (q.length) {
        const cur = q.shift()!;
        if (cur === rb.def.id) break;
        for (const dr of doorRuntimes.values()) {
          const d = dr.def;
          if (!d.b || d.state === 'locked' || handle.blockedDoors.has(d.id)) continue;
          const other = d.a === cur ? d.b : d.b === cur ? d.a : null;
          if (!other || seen.has(other)) continue;
          seen.add(other);
          prev.set(other, { room: cur, door: dr });
          q.push(other);
        }
      }
      if (!prev.has(rb.def.id)) return false;
      // primeira porta do caminho
      let node = rb.def.id;
      let first = prev.get(node)!;
      while (first.room !== ra.def.id) {
        node = first.room;
        first = prev.get(node)!;
      }
      const dr = first.door;
      // lado de dentro da sala de destino (próxima): normal a→b aponta para fora de a
      const into = dr.def.a === ra.def.id ? 1 : -1;
      const dx = fx - dr.center.x, dz = fz - dr.center.z;
      const along = dx * dr.normal.x * into + dz * dr.normal.z * into; // < 0 = ainda do lado de cá
      const lateral = Math.abs(dr.def.axis === 'x' ? dz : dx);
      if (along > -0.9 && lateral < dr.width / 2 + 0.3) out.set(dr.center.x + dr.normal.x * into * 1.2, 0, dr.center.z + dr.normal.z * into * 1.2);
      else out.set(dr.center.x - dr.normal.x * into * 0.5, 0, dr.center.z - dr.normal.z * into * 0.5);
      return true;
    },
    forceAll: false,
    planView: false,
    spawn: new THREE.Vector3(def.spawn.x, 0, def.spawn.z),
    enemySpawns: [],
    bounds: { minX: -1e3, maxX: 1e3, minZ: -1e3, maxZ: 1e3 },
    keyLight: key,
    roomAt,
    setFocus(player, camera) {
      focus.copy(player);
      camPos.copy(camera);
      const r = roomAt(player.x, player.z);
      if (r) current = r;
      const camRoom = roomAt(camera.x, camera.z);
      visible.clear();
      if (current) {
        visible.add(current.def.id);
        for (const n of current.neighbors) visible.add(n);
      }
      if (camRoom) visible.add(camRoom.def.id);
      for (const rh of rooms.values()) {
        rh.group.visible = !rh.def.closed && (handle.forceAll || visible.has(rh.def.id) || visible.size === 0);
        for (const o of rh.group.children) if (o.name.startsWith('ceil:')) o.visible = !handle.planView;
      }
      // sombra que segue o jogador (só perto do Márcio)
      key.position.set(player.x + 3, player.y + 12, player.z + 4);
      key.target.position.set(player.x, player.y, player.z);
    },
    update(dt: number) {
      t += dt;
      for (const f of ticks) f(dt, t);
      lightAcc += dt;
      if (lightAcc > 0.25) {
        lightAcc = 0;
        assignLights();
      }
      for (const pl of pool) {
        const a = pl.userData.anchor as (typeof anchors)[number] | undefined;
        if (!a) continue;
        let k = 1;
        if (a.pulse) k = 0.55 + 0.45 * Math.sin(t * a.pulse * 2);
        if (a.flicker) k = Math.sin(t * 23) + Math.sin(t * 7.1) > -0.6 || Math.sin(t * 1.3) > 0.7 ? 1 : 0.08;
        // aparece suave ao trocar de âncora
        const target = a.intensity * k;
        pl.intensity += (target - pl.intensity) * Math.min(1, dt * 10);
      }
    },
    stats() {
      let groups = 0;
      root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && o.visible) groups++;
      });
      return { rooms: rooms.size, tris: Math.round(totalTris), drawGroups: groups };
    },
  };
  // primeira atribuição
  handle.setFocus(handle.spawn, handle.spawn);
  assignLights();
  void camPos;
  return handle;

  // ---------- auxiliares (fecham sobre o escopo) ----------
  function buildGlassFacade(b: Batch, e: { axis: 'x' | 'z'; at: number; from: number; to: number; inward: number }, H: number, openings: DoorDef[]) {
    const len = e.to - e.from, mid = (e.from + e.to) / 2;
    const place = (x: number, y: number, ry = 0) => (e.axis === 'z' ? mat4(x, y, e.at, ry) : mat4(e.at, y, x, ry + Math.PI / 2));
    b.add('glass', box(len, H, 0.03), place(mid, H / 2));
    for (let x = e.from; x <= e.to + 0.01; x += 2.66) b.add('metalDark', box(0.12, H, 0.2), place(x, H / 2));
    for (const y of [3.4, 6.4]) b.add('metalDark', box(len, 0.14, 0.2), place(mid, y));
    b.add('stoneDark', box(len, 0.3, 0.3), place(mid, 0.15));
    if (e.axis === 'z') physics.addStaticBox(mid, H / 2, e.at + 0.15, len / 2, H / 2, 0.2);
    else physics.addStaticBox(e.at, H / 2, mid, 0.2, H / 2, len / 2);
    for (const o of openings) {
      if (o.kind !== 'revolving') continue;
      const cx = (o.from + o.to) / 2, r = (o.to - o.from) / 2;
      const off = e.inward * -0.1;
      const at = (x: number, y: number, z: number, ry = 0) => (e.axis === 'z' ? mat4(cx + x, y, e.at + off + z, ry) : mat4(e.at + off + z, y, cx + x, ry));
      b.add('glass', cyl(r, r, o.height, 24, true), at(0, o.height / 2, 0));
      b.add('metalDark', cyl(r + 0.08, r + 0.08, 0.3, 24), at(0, o.height + 0.15, 0));
      b.add('metalDark', cyl(r + 0.05, r + 0.05, 0.04, 24), at(0, 0.02, 0));
      b.add('chrome', cyl(0.06, 0.06, o.height, 10), at(0, o.height / 2, 0));
      for (let k = 0; k < 4; k++) b.add('glass', box(r * 0.95, o.height - 0.1, 0.03), at(Math.cos((k * Math.PI) / 2 + 0.4) * r * 0.48, o.height / 2, Math.sin((k * Math.PI) / 2 + 0.4) * r * 0.48, -((k * Math.PI) / 2 + 0.4)));
      const uv = atlas.alloc(512, 110, drawSign(o.label ?? 'ENTRADA', 'fechado pela segurança', { fg: '#f3ece4' }));
      b.add(LevelAtlas.key('atlasGlow', uv), LevelAtlas.quad(2.6, 0.56, uv), at(0, o.height + 0.6, e.inward * 0.2, e.inward > 0 ? 0 : Math.PI), false);
    }
  }

  function buildDoorFrame(b: Batch, o: DoorDef, H: number) {
    void H;
    const len = o.to - o.from, mid = (o.from + o.to) / 2;
    const mat = o.kind === 'opening' ? 'stoneDark' : 'brushed';
    const P = (along: number, y: number, ry = 0) => (o.axis === 'z' ? mat4(along, y, o.at, ry) : mat4(o.at, y, along, ry + Math.PI / 2));
    // ombreiras e verga cobrindo a espessura da parede
    b.add(mat, box(0.08, o.height, WALL_T + 0.06), P(o.from - 0.04, o.height / 2));
    b.add(mat, box(0.08, o.height, WALL_T + 0.06), P(o.to + 0.04, o.height / 2));
    b.add(mat, box(len + 0.16, 0.08, WALL_T + 0.06), P(mid, o.height + 0.04));
  }
}

function atriumCeiling(b: Batch, r: RoomDef) {
  const [x0, z0, x1, z1] = r.rect;
  for (let x = x0 + 3; x <= x1 - 3; x += 4) for (let z = z0 + 3; z <= z1 - 3; z += 4) b.add('ledCool', box(2.2, 0.04, 0.5), mat4(x, r.height - 0.04, z));
  b.add('ledWarm', box(x1 - x0, 0.04, 0.06), mat4((x0 + x1) / 2, r.height - 0.3, z0 + 0.12));
  b.add('ledWarm', box(0.06, 0.04, z1 - z0), mat4(x1 - 0.12, r.height - 0.3, (z0 + z1) / 2));
}

function roomCeilingLights(b: Batch, r: RoomDef) {
  const [x0, z0, x1, z1] = r.rect;
  const w = x1 - x0, d = z1 - z0;
  const nx = Math.max(1, Math.round(w / 3.2)), nz = Math.max(1, Math.round(d / 3.2));
  if (r.id === 'corredor') return; // corredor usa as calhas fluorescentes da planta
  for (let i = 0; i < nx; i++)
    for (let k = 0; k < nz; k++) {
      const x = x0 + ((i + 0.5) * w) / nx, z = z0 + ((k + 0.5) * d) / nz;
      if (r.ceiling === 'woodSlat') {
        // pendentes da cafeteria
        b.add('metalDark', box(0.01, 0.8, 0.01), mat4(x, r.height - 0.4, z));
        b.add('c:#2b2420:0.6', cyl(0.12, 0.28, 0.22, 16, true), mat4(x, r.height - 0.9, z));
        b.add('ledWarm', cyl(0.25, 0.25, 0.01, 16), mat4(x, r.height - 1.0, z));
      } else b.add('ledWhite', box(1.15, 0.03, 0.55), mat4(x, r.height - 0.02, z));
    }
}

function buildDoorLeaves(dr: DoorRuntime, rooms: Map<string, RoomHandle>, physics: Physics, getMat: (k: string) => THREE.Material) {
  const d = dr.def;
  if (d.kind === 'opening' || d.kind === 'revolving') return;
  const room = rooms.get(d.a)!;
  const len = d.to - d.from;
  const mk = (w: number, mat: string) => new THREE.Mesh(new THREE.BoxGeometry(w, d.height - 0.04, 0.05), getMat(mat));
  const place = (m: THREE.Object3D, along: number, swing: number, hingeSide: number) => {
    // dobradiça na ponta `hingeSide` do vão; swing = ângulo de abertura (0 fechada)
    const hingeAlong = hingeSide < 0 ? d.from : d.to;
    const w = ((m as THREE.Mesh).geometry as THREE.BoxGeometry).parameters.width;
    const g = new THREE.Group();
    m.position.set((-hingeSide * w) / 2, (d.height - 0.04) / 2, 0);
    g.add(m);
    // fechada: a folha cobre o vão de `from` a `to`
    const baseRy = d.axis === 'z' ? 0 : -Math.PI / 2;
    if (d.axis === 'z') g.position.set(hingeAlong, 0, d.at);
    else g.position.set(d.at, 0, hingeAlong);
    // aberta: gira para o lado em que a ponta livre entra na sala b (ao longo da normal a→b)
    const tip = (ry: number) => new THREE.Vector3(-hingeSide * w, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    const sgn = tip(baseRy + swing).dot(dr.normal) >= tip(baseRy - swing).dot(dr.normal) ? 1 : -1;
    g.rotation.y = baseRy + swing * sgn;
    m.castShadow = true;
    room.group.add(g);
    void along;
    return g;
  };
  if (d.kind === 'door') {
    const leaf = mk(len - 0.04, d.state === 'locked' ? 'woodDark' : 'woodLight');
    place(leaf, 0, d.state === 'locked' ? 0 : 1.45, -1);
    // puxador
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), getMat('chrome'));
    h.position.set((len - 0.04) / 2 - 0.12, 1.0 - (d.height - 0.04) / 2, 0.04);
    leaf.add(h);
    if (d.state === 'locked') {
      if (d.axis === 'z') physics.addStaticBox((d.from + d.to) / 2, d.height / 2, d.at, len / 2, d.height / 2, 0.08);
      else physics.addStaticBox(d.at, d.height / 2, (d.from + d.to) / 2, 0.08, d.height / 2, len / 2);
    }
  } else if (d.kind === 'double') {
    for (const side of [-1, 1]) {
      const leaf = mk(len / 2 - 0.03, 'woodDark');
      place(leaf, 0, d.state === 'locked' ? 0 : 1.4, side);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(len / 2 - 0.3, 0.05, 0.06), getMat('chrome'));
      bar.position.set(0, 1.05 - (d.height - 0.04) / 2, 0.06 * (dr.normal.x + dr.normal.z < 0 ? 1 : -1));
      leaf.add(bar);
    }
    if (d.state === 'locked') {
      // corrente com cadeado nas barras (lado do átrio)
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 16), getMat('chrome'));
      const lock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.05), getMat('brass'));
      const mid = (d.from + d.to) / 2;
      const side = -dr.normal.x - dr.normal.z; // para dentro da sala a
      if (d.axis === 'x') {
        chain.position.set(d.at + side * 0.12, 1.05, mid);
        chain.rotation.y = Math.PI / 2;
        lock.position.set(d.at + side * 0.15, 0.85, mid);
        lock.rotation.y = Math.PI / 2;
      } else {
        chain.position.set(mid, 1.05, d.at + side * 0.12);
        lock.position.set(mid, 0.85, d.at + side * 0.15);
      }
      room.group.add(chain, lock);
      if (d.axis === 'z') physics.addStaticBox(mid, d.height / 2, d.at, len / 2, d.height / 2, 0.08);
      else physics.addStaticBox(d.at, d.height / 2, mid, 0.08, d.height / 2, len / 2);
    }
  }
}

function makeNightCity(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#0a1024');
  g.addColorStop(0.6, '#1b2350');
  g.addColorStop(1, '#3a2a40');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const w = 30 + rnd() * 70;
    const h = 120 + rnd() * 330;
    const x = rnd() * 1024;
    ctx.fillStyle = `rgb(${12 + rnd() * 14},${14 + rnd() * 14},${26 + rnd() * 20})`;
    ctx.fillRect(x, 512 - h, w, h);
    for (let wy = 512 - h + 8; wy < 500; wy += 10)
      for (let wx = x + 4; wx < x + w - 4; wx += 8)
        if (rnd() < 0.32) {
          ctx.fillStyle = rnd() < 0.8 ? 'rgba(255,214,150,0.9)' : 'rgba(150,200,255,0.9)';
          ctx.fillRect(wx, wy, 4, 5);
        }
  }
  // viaturas lá fora
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(255,40,50,0.7)' : 'rgba(50,90,255,0.7)';
    ctx.fillRect(200 + i * 90, 470, 40, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
