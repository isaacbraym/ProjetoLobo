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
    teleport(x: number, z: number) {
      game.player.actor.teleport(new THREE.Vector3(x, 0, z));
    },
  };
  (window as unknown as { __LOBO__: typeof api }).__LOBO__ = api;
}
