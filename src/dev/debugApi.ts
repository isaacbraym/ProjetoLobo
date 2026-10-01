import * as THREE from 'three';
import type { Game } from '../game/game';
import type { PerfOverlay } from './perfOverlay';
import { createBot } from './botPilot';
import { reseedAll } from '../core/rng';
import type { QualityName } from '../engine/render/quality';
import { attacksData } from '../game/data/gameData';

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
    perf() {
      return perf.report();
    },
    teleport(x: number, z: number) {
      game.player.actor.teleport(new THREE.Vector3(x, 0, z));
    },
  };
  (window as unknown as { __LOBO__: typeof api }).__LOBO__ = api;
}
