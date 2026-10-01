import * as THREE from 'three';
import type { Game } from '../game';
import type { Enemy } from '../ai/enemy';
import type { FloorHandle } from './floorBuilder';
import type { LevelDef } from '../data/levelSchema';
import { Hostage } from '../actors/hostage';
import { Actor } from '../actors/actor';
import { CharacterModel } from '../characters/character';
import { events } from '../../core/events';
import { rngs } from '../../core/rng';
import { audio } from '../../engine/audio/audio';

/**
 * Encontros do andar (DEC-0017: exploração, sem ondas). Inimigos POSICIONADOS por grupo com comportamento de antes
 * da briga; percepção a 10 Hz (cone de visão + linha de visada contra paredes, proximidade, barulho de briga); o alerta
 * se espalha pelo grupo. Reféns por grupo (libertados quando o grupo cai). Arenas: ao entrar na zona, as saídas
 * fecham (abas das catracas, porta de aço, mesas viradas) até o grupo cair e abrem de jeitos diferentes.
 * Objetivos no HUD, segredos e checkpoints ao entrar nas salas grandes.
 */
const VISION_RANGE = 13;
const VISION_COS = Math.cos((60 * Math.PI) / 180);
const HEAR_FIGHT = 11;

/** Visual dos civis: modelo + cores de roupa (look da planta). */
const CIVILIAN_LOOKS: { model: string; tint: Record<string, string> }[] = [
  { model: 'thug_slim', tint: { M_Shirt: '#e8e6e0', M_Pants: '#4a4a50' } },
  { model: 'thug_a', tint: { M_Shirt: '#9cc3e6', M_Pants: '#1f2a44' } },
  { model: 'thug_slim', tint: { M_Shirt: '#e6a3b5', M_Pants: '#1c1c20' } },
  { model: 'thug_a', tint: { M_Shirt: '#d8c8a8', M_Pants: '#7a6a4a' } },
  { model: 'thug_slim', tint: { M_Shirt: '#5a7a9a', M_Pants: '#26282e' } },
  { model: 'thug_a', tint: { M_Shirt: '#18181c', M_Pants: '#22252b' } },
];

interface GroupRt {
  id: string;
  room: string;
  members: Enemy[];
  alerted: boolean;
  cleared: boolean;
  arena?: ArenaRt;
  intro: boolean;
}

interface ArenaRt {
  id: string;
  def: LevelDef['arenas'][number];
  state: 'idle' | 'closed' | 'open';
  closeT: number;
  barriers: Barrier[];
}

interface Barrier {
  close(): void;
  open(): void;
  update(dt: number): void;
}

export class Encounters {
  readonly groups: GroupRt[] = [];
  readonly hostages: Hostage[] = [];
  private secrets: { def: LevelDef['secrets'][number]; mesh: THREE.Object3D | null; found: boolean }[] = [];
  private acc = 0;
  private visitedRooms = new Set<string>();
  /** posição de renascimento do último checkpoint */
  readonly checkpoint = new THREE.Vector3();
  checkpointYaw = Math.PI;
  private finalShown = false;
  private exitPoint = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  freedCount = 0;
  secretsFound = 0;
  /** progresso para o bot/verify (muda quando algo avança) */
  progress = 0;

  constructor(
    private game: Game,
    private floor: FloorHandle,
  ) {
    const L = floor.def;
    this.checkpoint.set(L.spawn.x, 0, L.spawn.z);
    this.checkpointYaw = L.spawn.yaw;
    const entrance = L.doors.find((d) => d.kind === 'revolving');
    if (entrance) this.exitPoint.copy(floor.doors.get(entrance.id)!.center).add(new THREE.Vector3(0, 0, -0.7));
    events.on('HitLanded', (e) => this.onNoise(e.x, e.z, HEAR_FIGHT));
    events.on('Killed', (e) => {
      this.progress++;
      const enemy = this.game.enemies.find((x) => x.actor.id === e.victimId);
      if (enemy) this.onNoise(enemy.actor.pos.x, enemy.actor.pos.z, HEAR_FIGHT);
    });
  }

  /** Instancia grupos, reféns e segredos. */
  start(): void {
    const L = this.floor.def;
    for (const g of L.groups) {
      const rt: GroupRt = { id: g.id, room: g.room, members: [], alerted: false, cleared: false, intro: !!g.intro };
      for (const m of g.members) {
        const e = this.game.spawnEnemy(m.a, new THREE.Vector3(m.x, 0, m.z));
        const st = this.floor.makeSteer();
        e.steer = (fx, fz, tx, tz, out) => {
          if (!st(fx, fz, tx, tz, out)) out.set(tx, 0, tz);
        };
        e.los = this.los;
        e.setPre({
          kind: m.do,
          home: new THREE.Vector3(m.x, 0, m.z),
          homeYaw: m.yaw,
          path: (m.path ?? []).map(([x, z]) => new THREE.Vector3(x, 0, z)),
          pathIdx: 1 % Math.max(1, m.path?.length ?? 1),
          wait: rngs.ai.range(0, 1.5),
          groupId: g.id,
          room: g.room,
        });
        rt.members.push(e);
      }
      this.groups.push(rt);
    }
    for (const a of L.arenas) {
      const g = this.groups.find((x) => x.id === a.group);
      if (!g) continue;
      g.arena = { id: a.id, def: a, state: 'idle', closeT: 0, barriers: a.barriers.map((b) => this.makeBarrier(b)) };
    }
    for (const h of L.hostages) this.spawnHostage(h);
    for (const s of L.secrets) this.secrets.push({ def: s, mesh: s.kind === 'hostage' ? null : this.makeSecretMesh(s), found: false });
    this.refreshObjective();
  }

  private spawnHostage(h: LevelDef['hostages'][number]): void {
    const look = CIVILIAN_LOOKS[h.look % CIVILIAN_LOOKS.length]!;
    const gltf = this.game.characterGltf(look.model);
    if (!gltf) return;
    const model = new CharacterModel(gltf, this.game.lib, null, h.pose === 'kneel' ? 'hostageKneel' : 'hostageScared', look.tint);
    this.game.renderer.scene.add(model.root);
    const actor = new Actor('civilian', model, this.game.physics, 30, 10, new THREE.Vector3(h.x, 0, h.z));
    actor.yaw = h.yaw;
    const host = new Hostage(h.id, actor, h.group, h.pose, h.label);
    host.exit.copy(this.exitPoint);
    const st = this.floor.makeSteer();
    host.steer = (fx, fz, tx, tz, out) => {
      if (!st(fx, fz, tx, tz, out)) out.set(tx, 0, tz);
    };
    host.onFreed = () => {
      this.freedCount++;
      this.progress++;
      const lines = ['"Valeu, tiozão!"', '"Ele veio sozinho?!"', '"Deus te pague, moço!"', '"Corre, gente, CORRE!"', '"Quem é esse cara?"', '"Eu sabia que alguém vinha!"'];
      this.game.hud.toast(`<b>REFÉM LIVRE</b> · ${rngs.ai.pick(lines)}`, 2.2);
      this.refreshObjective();
    };
    this.hostages.push(host);
    this.game.combat.fighters.push(host);
  }

  /** Linha livre a 1 m de altura (balcões, divisórias e paredes bloqueiam; cadeiras não). */
  readonly los = (ax: number, az: number, bx: number, bz: number): boolean => {
    const dx = bx - ax, dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (d < 0.3) return true;
    const hit = this.game.physics.castRay(ax, 1.0, az, dx / d, 0, dz / d, d);
    return hit === null || hit > d - 0.35;
  };

  // ---------- percepção ----------
  /** Barulho de briga: inimigos distraídos por perto (mesma sala ou vizinha) percebem. */
  private onNoise(x: number, z: number, radius: number): void {
    const r = this.floor.roomAt(x, z);
    for (const g of this.groups) {
      for (const e of g.members) {
        if (e.aware || e.alerting || !e.alive) continue;
        const d = Math.hypot(e.actor.pos.x - x, e.actor.pos.z - z);
        if (d > radius) continue;
        const er = this.floor.roomAt(e.actor.pos.x, e.actor.pos.z);
        if (r && er && r !== er && !r.neighbors.has(er.def.id)) continue;
        this.alertGroup(g, e, rngs.ai.range(0.2, 0.6));
      }
    }
  }

  private canSee(e: Enemy): boolean {
    const p = this.game.player.actor;
    const a = e.actor;
    const dx = p.pos.x - a.pos.x, dz = p.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.2) return true; // ouviu os passos
    if (d > VISION_RANGE) return false;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    if ((dx * fx + dz * fz) / d < VISION_COS) {
      // correndo perto chama atenção mesmo de costas
      return this.game.player.moveSpeed > 5 && d < 6;
    }
    // linha de visada (paredes e móveis altos bloqueiam)
    const ey = 1.6;
    const hit = this.game.physics.castRay(a.pos.x, ey, a.pos.z, dx / d, (1.2 - ey) / d, dz / d, d);
    return hit === null || hit > d - 0.4;
  }

  private alertGroup(g: GroupRt, first: Enemy | null, delay: number): void {
    if (!g.alerted) {
      g.alerted = true;
      events.emit('EncounterStart', { id: g.id, arena: !!g.arena });
      for (const h of this.hostages) if (h.groupId === g.id) h.hope();
      audio.play('whooshHeavy', 0.3);
    }
    first?.alert(delay);
    // o grupo grita e os outros entram em seguida
    for (const m of g.members) if (m !== first) m.alert(delay + rngs.ai.range(0.25, 0.9));
  }

  /** O intro (cinemática) solta o primeiro grupo de uma vez. */
  alertIntroGroups(): void {
    for (const g of this.groups) if (g.intro) this.alertGroup(g, null, 0.1);
  }

  // ---------- arenas ----------
  private makeBarrier(key: string): Barrier {
    const game = this.game;
    const phys = this.game.physics;
    if (key === 'turnstileGates') {
      const flaps = (this.floor.exposed.get('turnstileFlaps') as THREE.Mesh[]) ?? [];
      const colliders = flaps
        .filter((f) => f.userData.side < 0)
        .map((f) => {
          const c = phys.addStaticBox(f.userData.closedX + 0.27, 0.6, f.position.z, 0.53, 0.6, 0.05);
          c.setEnabled(false);
          return c;
        });
      let target = 0;
      let k = 0;
      return {
        close: () => {
          target = 1;
          colliders.forEach((c) => c.setEnabled(true));
          audio.play('bodyfall', 0.6);
        },
        open: () => {
          target = 0;
          colliders.forEach((c) => c.setEnabled(false));
        },
        update: (dt) => {
          k += (target - k) * Math.min(1, dt * 9);
          for (const f of flaps) {
            f.rotation.y = (Math.PI / 2) * (1 - k);
            f.position.x = THREE.MathUtils.lerp(f.userData.openX, f.userData.closedX, k);
          }
        },
      };
    }
    const dr = this.floor.doors.get(key);
    if (!dr) return { close() {}, open() {}, update() {} };
    const d = dr.def;
    const room = this.floor.rooms.get(d.a)!;
    const width = dr.width + 0.3;
    const along = d.axis === 'z';
    const cx = dr.center.x, cz = dr.center.z;
    const col = along ? phys.addStaticBox(cx, 1.4, cz, width / 2, 1.4, 0.15) : phys.addStaticBox(cx, 1.4, cz, 0.15, 1.4, width / 2);
    col.setEnabled(false);
    const blocked = this.floor.blockedDoors;
    if (d.kind === 'opening') {
      // mesas e cadeiras viradas fazendo barricada (caem de cima; na abertura, voam longe)
      const g = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x4a2e1c, roughness: 0.5 });
      const metal = new THREE.MeshStandardMaterial({ color: 0x22222a, metalness: 0.8, roughness: 0.35 });
      const pieces: { m: THREE.Mesh; home: THREE.Vector3; rot: THREE.Euler; vel: THREE.Vector3; spin: THREE.Vector3 }[] = [];
      const n = Math.ceil(width / 0.9);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        const top = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 18), i % 2 ? wood : metal);
        const home = new THREE.Vector3(along ? cx + t * width : cx, 0.45 + (i % 2) * 0.12, along ? cz : cz + t * width);
        const rot = new THREE.Euler(along ? Math.PI / 2 : 0, rngs.vfx.range(-0.3, 0.3), along ? 0 : Math.PI / 2);
        top.castShadow = true;
        g.add(top);
        pieces.push({ m: top, home, rot, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 0.06), metal);
        const lhome = home.clone().add(new THREE.Vector3(along ? 0 : 0.35, -0.05, along ? 0.35 : 0));
        g.add(leg);
        pieces.push({ m: leg, home: lhome, rot: new THREE.Euler(0, 0, along ? 1.3 : 0), vel: new THREE.Vector3(), spin: new THREE.Vector3() });
      }
      g.visible = false;
      room.group.add(g);
      let mode: 'idle' | 'drop' | 'fly' = 'idle';
      let t = 0;
      return {
        close: () => {
          g.visible = true;
          mode = 'drop';
          t = 0;
          col.setEnabled(true);
          blocked.add(d.id);
          for (const p of pieces) {
            p.m.position.copy(p.home).add(new THREE.Vector3(0, 2.2 + rngs.vfx.range(0, 0.8), 0));
            p.m.rotation.copy(p.rot);
          }
          game.camera.addTrauma(0.25);
          audio.play('bodyfall', 0.9);
        },
        open: () => {
          mode = 'fly';
          t = 0;
          col.setEnabled(false);
          blocked.delete(d.id);
          for (const p of pieces) {
            p.vel.set(rngs.vfx.range(-3, 3), rngs.vfx.range(2, 4.5), rngs.vfx.range(-3, 3));
            p.spin.set(rngs.vfx.range(-8, 8), rngs.vfx.range(-8, 8), rngs.vfx.range(-8, 8));
          }
          game.particles.dust(cx, 0.2, cz, 2);
          game.camera.addTrauma(0.4);
          audio.play('punchHeavy', 1);
        },
        update: (dt) => {
          t += dt;
          if (mode === 'drop') {
            for (const p of pieces) {
              p.m.position.y = Math.max(p.home.y, p.m.position.y - dt * 9);
            }
            if (t > 0.5) mode = 'idle';
          } else if (mode === 'fly') {
            for (const p of pieces) {
              p.vel.y -= 9.8 * dt;
              p.m.position.addScaledVector(p.vel, dt);
              if (p.m.position.y < 0.05) {
                p.m.position.y = 0.05;
                p.vel.multiplyScalar(0.4);
                p.vel.y = Math.abs(p.vel.y) * 0.3;
              }
              p.m.rotation.x += p.spin.x * dt;
              p.m.rotation.y += p.spin.y * dt;
              p.m.rotation.z += p.spin.z * dt;
              p.spin.multiplyScalar(Math.pow(0.2, dt));
            }
            if (t > 2.5) mode = 'idle';
          }
        },
      };
    }
    // porta: grade de aço que desce (fecha) e sobe (abre)
    const grid = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x5c5f66, metalness: 0.9, roughness: 0.4 });
    const H = d.height;
    for (let i = 0; i <= Math.ceil(width / 0.12); i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, H, 0.03), steel);
      const o = -width / 2 + i * 0.12;
      bar.position.set(along ? o : 0, H / 2, along ? 0 : o);
      grid.add(bar);
    }
    for (let k = 0; k < 4; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(along ? width : 0.05, 0.05, along ? 0.05 : width), steel);
      bar.position.set(0, 0.3 + k * (H / 4), 0);
      grid.add(bar);
    }
    const side = room.def.id === d.a ? -1 : 1;
    grid.position.set(cx + (along ? 0 : side * 0.18 * dr.normal.x), H + 0.05, cz + (along ? side * 0.18 * dr.normal.z : 0));
    grid.visible = false;
    room.group.add(grid);
    let target = 0;
    let k = 0;
    return {
      close: () => {
        target = 1;
        grid.visible = true;
        col.setEnabled(true);
        blocked.add(d.id);
        audio.play('whooshHeavy', 0.7);
      },
      open: () => {
        target = 0;
        col.setEnabled(false);
        blocked.delete(d.id);
      },
      update: (dt) => {
        k += (target - k) * Math.min(1, dt * (target ? 7 : 2));
        grid.position.y = H + 0.05 - k * H;
        if (k < 0.01 && target === 0) grid.visible = false;
      },
    };
  }

  private inZone(z: [number, number, number, number], x: number, zz: number): boolean {
    return x >= z[0] && x <= z[2] && zz >= z[1] && zz <= z[3];
  }

  // ---------- segredos ----------
  private makeSecretMesh(s: LevelDef['secrets'][number]): THREE.Object3D {
    const g = new THREE.Group();
    if (s.kind === 'medkit') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.24), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4 }));
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.005, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.1).multiplyScalar(1.6), toneMapped: false }));
      const cross2 = cross1.clone();
      cross2.rotation.y = Math.PI / 2;
      cross1.position.y = cross2.position.y = 0.063;
      g.add(body, cross1, cross2);
    } else {
      // guitarra encostada na prateleira
      const wood = new THREE.MeshStandardMaterial({ color: 0x8a2b14, roughness: 0.35, envMapIntensity: 1.2 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.5 });
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 20), wood);
      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.09, 20), wood);
      b1.rotation.x = b2.rotation.x = Math.PI / 2;
      b1.position.y = 0.28;
      b2.position.y = 0.55;
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 0.03), dark);
      neck.position.y = 0.98;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.035), dark);
      head.position.y = 1.36;
      g.add(b1, b2, neck, head);
      g.rotation.x = -0.25;
    }
    g.position.set(s.x, s.y ?? 0, s.z);
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.floor.rooms.get(s.room)?.group.add(g);
    return g;
  }

  private findSecret(sec: (typeof this.secrets)[number]): void {
    sec.found = true;
    this.secretsFound++;
    this.progress++;
    const d = sec.def;
    const p = this.game.player.actor;
    if (d.kind === 'medkit') {
      p.hp = Math.min(p.maxHp, p.hp + (d.heal ?? 30));
      if (sec.mesh) sec.mesh.visible = false;
      this.game.hud.toast(`<b>SEGREDO</b> · ${d.label} (+${d.heal ?? 30} vida)`, 2.6);
    } else if (d.kind === 'guitar') {
      if (sec.mesh) sec.mesh.visible = false;
      this.game.hud.toast(`<b>SEGREDO</b> · ${d.label} — guardada para quando as armas chegarem`, 3);
    } else if (d.kind === 'hostage') {
      const h = this.hostages.find((x) => x.id === d.hostage);
      h?.release(0.3);
      this.game.hud.toast(`<b>SEGREDO</b> · ${d.label}`, 2.6);
    }
    audio.play('whoosh', 0.5);
    this.refreshObjective();
  }

  // ---------- objetivos ----------
  private refreshObjective(): void {
    const L = this.floor.def;
    const total = this.hostages.length;
    const allClear = this.groups.every((g) => g.cleared);
    const lines = [`${L.objectives.hostages} <b>${this.freedCount}/${total}</b>`];
    if (allClear || this.freedCount >= total) lines.push(`<b>${L.objectives.final}</b>`);
    else lines.push(`<span class="dim">${L.objectives.final}</span>`);
    lines.push(`<span class="dim">segredos ${this.secretsFound}/${this.secrets.length}</span>`);
    this.game.hud.setObjective(lines);
  }

  // ---------- por frame ----------
  update(dt: number): void {
    const p = this.game.player;
    for (const h of this.hostages) h.update(dt, p);
    for (const g of this.groups) g.arena?.barriers.forEach((b) => b.update(dt));
    this.acc += dt;
    if (this.acc < 0.1) return; // lógica a 10 Hz
    this.acc = 0;
    const pp = p.actor.pos;
    const room = this.floor.current;
    // checkpoint e nome da sala na primeira visita
    if (room && !this.visitedRooms.has(room.def.id)) {
      this.visitedRooms.add(room.def.id);
      this.progress++;
      if (this.visitedRooms.size > 1) this.game.hud.toast(`<b>${room.def.name.toUpperCase()}</b>${room.def.checkpoint ? ' · checkpoint' : ''}`, 1.8);
      if (room.def.checkpoint) {
        this.checkpoint.copy(pp);
        this.checkpointYaw = p.actor.yaw;
      }
    }
    // percepção
    for (const g of this.groups) {
      if (g.cleared) continue;
      if (!g.alerted || g.members.some((e) => !e.aware && !e.alerting && e.alive)) {
        for (const e of g.members) {
          if (!e.alive || e.aware || e.alerting) continue;
          if (this.canSee(e)) this.alertGroup(g, e, rngs.ai.range(0.25, 0.55));
        }
      }
      // arena: entrou na zona com o grupo vivo → fecha as saídas
      const ar = g.arena;
      if (ar && ar.state === 'idle' && this.inZone(ar.def.zone, pp.x, pp.z) && g.members.some((e) => e.alive)) {
        ar.state = 'closed';
        ar.barriers.forEach((b) => b.close());
        this.alertGroup(g, null, 0.15);
        this.game.hud.showBanner(ar.def.banner, 'ninguém sai', 1.6);
        events.emit('EncounterStart', { id: ar.id, arena: true });
      }
      // grupo derrotado
      if (!g.cleared && g.members.every((e) => !e.alive)) {
        g.cleared = true;
        this.progress++;
        for (const h of this.hostages) if (h.groupId === g.id) h.release();
        if (ar && ar.state === 'closed') {
          ar.state = 'open';
          ar.barriers.forEach((b) => b.open());
          this.game.hud.showBanner(`${ar.def.banner} LIMPA`, 'as saídas abriram', 2);
          this.checkpoint.copy(pp);
        }
        events.emit('EncounterClear', { id: g.id });
        this.refreshObjective();
      }
    }
    // reféns: começam a torcer quando a briga do grupo deles começa (ver alertGroup)
    // segredos
    for (const s of this.secrets) {
      if (s.found) continue;
      const d = Math.hypot(s.def.x - pp.x, s.def.z - pp.z);
      if (d < (s.def.kind === 'hostage' ? 1.8 : 1.3)) this.findSecret(s);
    }
    // final: andar limpo → porta do auditório
    const L = this.floor.def;
    if (!this.finalShown && this.groups.every((g) => g.cleared)) {
      const dr = this.floor.doors.get(L.objectives.finalDoor);
      if (dr && Math.hypot(dr.center.x - pp.x, dr.center.z - pp.z) < 4) {
        this.finalShown = true;
        this.progress++;
        this.game.hud.showBanner('TÉRREO LIMPO', L.objectives.finalHint, 4);
      }
    }
    // visibilidade/sono: inimigos e reféns de salas não visíveis somem e não animam
    const vis = this.floor.visibleRooms;
    for (const g of this.groups)
      for (const e of g.members) {
        if (!e.alive) continue;
        const r = this.floor.roomAt(e.actor.pos.x, e.actor.pos.z);
        const show = e.aware || !r || vis.has(r.def.id);
        e.actor.model.setVisible(show);
        e.sleeping = !show;
      }
    for (const h of this.hostages) {
      if (h.state === 'gone') continue;
      const r = this.floor.roomAt(h.actor.pos.x, h.actor.pos.z);
      h.actor.model.setVisible(!r || vis.has(r.def.id) || h.state === 'fleeing');
    }
    this.tmp.set(0, 0, 0);
  }

  /** Segredos ainda não achados (o bot de teste visita). */
  pendingSecrets(): { x: number; z: number }[] {
    return this.secrets.filter((s) => !s.found).map((s) => ({ x: s.def.x, z: s.def.z }));
  }

  get finished(): boolean {
    return this.finalShown;
  }

  get allClear(): boolean {
    return this.groups.every((g) => g.cleared);
  }

  get totalHostages(): number {
    return this.hostages.length;
  }
}
