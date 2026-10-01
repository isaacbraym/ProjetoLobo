import * as THREE from 'three';
import type { Game } from '../game/game';
import type { PerfOverlay } from './perfOverlay';
import { createBot } from './botPilot';
import { reseedAll } from '../core/rng';
import type { QualityName } from '../engine/render/quality';
import { attacksData } from '../game/data/gameData';
import { CinematicSchema } from '../game/data/cinematicSchema';
import introJson from '../../data/cinematics/intro.json';

/** API de debug para Playwright/agentes. Só instalada em dev ou ?autotest=1 em localhost. */
export function installDebugApi(game: Game, perf: PerfOverlay): void {
  const errors: string[] = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
  const api = {
    ready: true,
    errors,
    state() {
      const p = game.player;
      return {
        started: game.started,
        wave: game.wave,
        kills: game.kills,
        player: { hp: p.actor.hp, lives: p.lives, state: p.state, pos: p.actor.pos.toArray(), alive: p.alive },
        enemies: game.enemies.map((e) => ({ id: e.actor.id, type: e.archetypeId, hp: e.actor.hp, state: e.state, token: e.hasToken })),
        corpses: game.corpses.length,
        wolf: game.wolfMeter,
        activeAttackers: game.director.activeAttackers(game.enemies),
        tokens: game.director.tokens,
        simTime: game.loop.simTime,
        floor: game.encounters
          ? {
              room: game.floor?.current?.def.id ?? null,
              progress: game.encounters.progress,
              freed: game.encounters.freedCount,
              hostages: game.encounters.totalHostages,
              secrets: game.encounters.secretsFound,
              groupsLeft: game.encounters.groups.filter((g) => !g.cleared).map((g) => g.id),
              allClear: game.encounters.allClear,
              finished: game.encounters.finished,
            }
          : null,
      };
    },
    start() {
      if (!game.started) game.start();
    },
    spawn(type: string, x?: number, z?: number) {
      const e = game.spawnEnemy(type, x !== undefined && z !== undefined ? new THREE.Vector3(x, 0, z) : undefined);
      return e.actor.id;
    },
    killAll() {
      const attack = attacksData.attacks.p_slam!;
      for (const e of [...game.enemies]) e.takeHit({ attacker: game.player.actor, attack, damage: 9999, dirX: 0, dirZ: -1, heavy: true });
    },
    setTimeScale(v: number) {
      game.loop.timeScale = v;
    },
    godMode(on = true) {
      game.godMode = on;
    },
    bot(on = true, seed = 7) {
      game.player.autopilot = on ? createBot(game, seed) : null;
    },
    seed(n: number) {
      reseedAll(n);
    },
    quality(q: QualityName) {
      game.renderer.setQuality(q);
    },
    difficulty(d: 'easy' | 'normal' | 'hard') {
      game.applyDifficulty(d);
    },
    camera(yaw: number, pitch: number, dist?: number) {
      game.camera.yaw = yaw;
      game.camera.pitch = pitch;
      if (dist) game.camera.distance = dist;
    },
    setWolfMeter(v: number) {
      game.wolf.meter = v;
    },
    transform() {
      game.wolf.meter = 100;
      return game.wolf.trigger();
    },
    wolfState() {
      return { state: game.wolf.state, meter: game.wolf.meter, timer: game.wolf.timer, amount: game.wolf.visual.amount, duck: 0 };
    },
    /**
     * Câmera fixa no rosto do Márcio (comparação com a foto). angle em graus (0 = de frente).
     * neutral: pose parada (sem guarda de luta) e câmera na altura dos olhos, como na foto de referência.
     */
    faceCam(on = true, dist = 0.75, angleDeg = 0, neutral = false, fov = 30) {
      const anim = game.player.actor.model.animator;
      if (!on) {
        game.camera.cine = null;
        game.player.setCine(false);
        anim.setLocoSet({ idle: 'idleCombat' });
        return;
      }
      game.player.setCine(true);
      if (neutral) anim.setLocoSet({ idle: 'idle' }, true);
      const p = game.player.actor;
      const head = new THREE.Vector3();
      p.model.boneWorld('Head', head);
      const a = p.yaw + THREE.MathUtils.degToRad(angleDeg);
      if (neutral) {
        // segue a direção real do rosto (a pose pode inclinar a cabeça): eixo local do osso mais alinhado com a frente
        const bone = p.model.bone('Head')!;
        bone.updateWorldMatrix(true, false);
        const fwd = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
        const up = new THREE.Vector3(0, 1, 0);
        let bestF = fwd.clone();
        let bestU = up.clone();
        let sf = -2;
        let su = -2;
        for (let i = 0; i < 3; i++)
          for (const sg of [1, -1]) {
            const ax = new THREE.Vector3().setFromMatrixColumn(bone.matrixWorld, i).normalize().multiplyScalar(sg);
            if (ax.dot(fwd) > sf) (sf = ax.dot(fwd)), bestF.copy(ax);
            if (ax.dot(up) > su) (su = ax.dot(up)), bestU.copy(ax);
          }
        const eye = head.clone().addScaledVector(bestU, 0.06).addScaledVector(bestF, 0.09);
        const dir = bestF.clone().applyAxisAngle(bestU, THREE.MathUtils.degToRad(angleDeg));
        game.camera.cine = { pos: eye.clone().addScaledVector(dir, dist), look: eye, fov, blend: 1 };
        return;
      }
      head.y += 0.06;
      const pos = new THREE.Vector3(head.x + Math.sin(a) * dist, head.y + 0.02, head.z + Math.cos(a) * dist);
      game.camera.cine = { pos, look: head.clone(), fov, blend: 1 };
    },
    perf() {
      return perf.report();
    },
    /** Toca a abertura (cenário `npm run capture intro`). */
    intro() {
      game.cinematic.play(CinematicSchema.parse(introJson));
    },
    cineState() {
      return { active: game.cinematic.active, t: +game.cinematic.t.toFixed(2) };
    },
    /** Câmera fixa de inspeção (cenas de revisão do andar). */
    cam(x: number, y: number, z: number, lx: number, ly: number, lz: number, fov = 55) {
      game.player.setCine(true);
      game.camera.cine = { pos: new THREE.Vector3(x, y, z), look: new THREE.Vector3(lx, ly, lz), fov, blend: 1 };
    },
    camOff() {
      game.camera.cine = null;
      game.player.setCine(false);
    },
    /** Mostra todas as salas (vista geral) — ignora o culling por sala. */
    showAllRooms(on = true) {
      if (game.floor) game.floor.forceAll = game.floor.planView = on;
    },
    /** Caminho da navmesh (cantos) e o próximo ponto do grafo de portas, para depurar travamentos. */
    navPath(fx: number, fz: number, tx: number, tz: number) {
      const f = game.floor;
      if (!f) return null;
      const out = new THREE.Vector3();
      const ok = f.nextWaypoint(fx, fz, tx, tz, out);
      const path = f.nav ? f.nav.path(new THREE.Vector3(fx, 0, fz), new THREE.Vector3(tx, 0, tz)).map((p) => [+p.x.toFixed(2), +p.z.toFixed(2)]) : null;
      return { nav: !!f.nav, path, door: ok ? [+out.x.toFixed(2), +out.z.toFixed(2)] : null };
    },
    floorStats() {
      return game.floor ? { ...game.floor.stats(), current: game.floor.current?.def.id ?? null, visible: [...game.floor.visibleRooms], navMs: game.floor.nav ? Math.round(game.floor.nav.buildMs) : null } : null;
    },
    /** Estado dos controles/mira (cenário `npm run capture controls`). */
    aimState() {
      const p = game.player;
      return {
        camMode: game.input.camMode,
        hovered: game.aim.enemy ? game.aim.enemy.actor.id : null,
        body: game.aim.body ? true : false,
        playerState: p.state,
        attackId: p.lastAttackId,
        chargeLevel: p.chargeLevel,
        charging: game.input.charging,
        target: p.currentTarget ? p.currentTarget.actor.id : null,
        hp: p.actor.hp,
        wolf: game.wolf.state,
        moveSpeed: p.moveSpeed,
        yaw: p.actor.yaw,
        corpses: game.corpses.length,
        cursor: { inside: game.input.cursorInside, locked: game.input.pointerLocked, px: [game.input.cursorPx.x, game.input.cursorPx.y], touch: game.input.usingTouch, pad: game.input.usingGamepad },
      };
    },
    /** Pixel na tela de um ponto do mundo (para mover o mouse até ele nos testes). */
    screenOf(x: number, y: number, z: number) {
      const v = new THREE.Vector3(x, y, z).project(game.renderer.camera);
      const el = game.renderer.gl.domElement;
      return [((v.x + 1) / 2) * el.clientWidth, ((1 - v.y) / 2) * el.clientHeight];
    },
    enemyScreen(id?: number) {
      const e = id === undefined ? game.enemies.find((x) => x.alive) : game.enemies.find((x) => x.actor.id === id);
      if (!e) return null;
      const r = e.actor.model.root.position;
      return { id: e.actor.id, px: api.screenOf(r.x, r.y + 1.25, r.z) };
    },
    bodyScreen() {
      // corpo visível mais perto do Márcio
      const pp = game.player.actor.pos;
      const el = game.renderer.gl.domElement;
      let best: number[] | null = null;
      let bd = Infinity;
      for (const c of game.corpses) {
        if (c.actor === game.player.actor) continue;
        const v = new THREE.Vector3();
        if (c.ragdoll) c.ragdoll.torsoPosition(v);
        else v.copy(c.model.root.position);
        const px = api.screenOf(v.x, Math.max(0.15, v.y), v.z);
        if (px[0]! < 20 || px[1]! < 20 || px[0]! > el.clientWidth - 20 || px[1]! > el.clientHeight - 20) continue;
        if (v.distanceTo(pp) < bd) (bd = v.distanceTo(pp)), (best = px);
      }
      return best;
    },
    freezeEnemies(on = true) {
      for (const e of game.enemies) (e as unknown as { frozen?: boolean }).frozen = on;
      game.director.tokens = on ? 0 : 2;
    },
    hurt(n: number) {
      game.player.actor.hp = Math.max(1, game.player.actor.hp - n);
    },
    teleport(x: number, z: number) {
      game.player.actor.teleport(new THREE.Vector3(x, 0, z));
    },
  };
  (window as unknown as { __LOBO__: typeof api }).__LOBO__ = api;
}
