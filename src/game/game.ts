import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FixedLoop } from '../core/loop';
import { events } from '../core/events';
import { rngs } from '../core/rng';
import { Renderer } from '../engine/render/renderer';
import { Physics } from '../engine/physics/physics';
import { Assets } from '../engine/assets/loader';
import { Input } from '../engine/input/input';
import { AnimLibrary } from '../engine/anim/animLibrary';
import { authorClip, type AuthoredClipDef } from '../engine/anim/poseAuthoring';
import { Particles } from '../engine/vfx/particles';
import { FloorDecals } from '../engine/vfx/decals';
import { audio } from '../engine/audio/audio';
import { ThirdPersonCamera } from '../presentation/camera/thirdPersonCamera';
import { Hud } from '../presentation/ui/hud';
import { CharacterModel } from './characters/character';
import { Actor } from './actors/actor';
import { Player } from './player/player';
import { Enemy } from './ai/enemy';
import { CombatDirector } from './ai/combatDirector';
import { CombatSystem } from './combat/combatSystem';
import { Ragdoll } from './corpses/ragdoll';
import { buildSandboxLobby, type LevelHandle } from './levels/sandboxLobby';
import { archetypesData, difficultyData, type DifficultyName } from './data/gameData';
import authoredJson from '../../data/anim/authored.json';

interface Corpse {
  model: CharacterModel;
  ragdoll: Ragdoll | null;
  actor: Actor;
}

const WAVES: string[][] = [
  ['thug', 'thug', 'thug'],
  ['thug', 'fast', 'thug', 'fast'],
  ['heavy', 'thug', 'thug'],
  ['fast', 'fast', 'heavy', 'thug', 'thug'],
  ['heavy', 'heavy', 'fast', 'thug', 'thug', 'fast'],
];

/** Orquestrador: inicializa sistemas, roda o loop e liga eventos. */
export class Game {
  readonly renderer: Renderer;
  readonly physics = new Physics();
  readonly input: Input;
  readonly loop: FixedLoop;
  assets!: Assets;
  /** Clipes do esqueleto do Márcio (humanoid_anims.glb) e dos manequins provisórios (ual1_src.glb). */
  lib = new AnimLibrary();
  libMannequin = new AnimLibrary();
  private marcioGltf!: GLTF;
  level!: LevelHandle;
  camera!: ThirdPersonCamera;
  combat!: CombatSystem;
  director = new CombatDirector();
  player!: Player;
  enemies: Enemy[] = [];
  corpses: Corpse[] = [];
  particles!: Particles;
  decals!: FloorDecals;
  hud!: Hud;
  private charGltf!: GLTF;
  difficulty: DifficultyName = 'normal';
  wave = 0;
  private waveClearTimer = -1;
  private respawnTimer = -1;
  wolfMeter = 0;
  started = false;
  /** Tempo de simulação de cada sistema (ms), para o overlay de perf. */
  readonly timings = { sim: 0, anim: 0, physics: 0, render: 0, frame: 0 };
  godMode = false;
  kills = 0;

  constructor(canvas: HTMLCanvasElement, private uiRoot: HTMLElement) {
    this.renderer = new Renderer(canvas);
    this.input = new Input(canvas);
    this.loop = new FixedLoop({
      fixedUpdate: (dt) => this.fixedUpdate(dt),
      frameUpdate: (dt, alpha) => this.frameUpdate(dt, alpha),
    });
  }

  async load(onProgress: (f: number) => void): Promise<void> {
    this.assets = new Assets(this.renderer.gl);
    this.assets.onProgress = onProgress;
    const [, gltf, marcio, anims] = await Promise.all([
      this.physics.init(),
      this.assets.load('assets/anims/ual1_src.glb'),
      this.assets.load('assets/characters/marcio.glb'),
      this.assets.load('assets/anims/humanoid_anims.glb'),
    ]);
    this.charGltf = gltf;
    this.marcioGltf = marcio;
    this.libMannequin.addFromGltf(gltf);
    this.lib.addFromGltf(anims);
    // golpes autorados por pose-chave (gancho, uppercut, chute) — um conjunto por esqueleto
    const authored = (authoredJson as { clips: Record<string, AuthoredClipDef> }).clips;
    const refM = skeletonClone(gltf.scene);
    const refH = skeletonClone(marcio.scene);
    for (const [name, def] of Object.entries(authored)) {
      this.libMannequin.clips.set(name, authorClip(name, refM, this.libMannequin.get(def.base), def));
      this.lib.clips.set(name, authorClip(name, refH, this.lib.get(def.base), def));
    }
    this.setupWorld();
  }

  private setupWorld(): void {
    const r = this.renderer;
    this.level = buildSandboxLobby(r, this.physics);
    this.camera = new ThirdPersonCamera(r.camera, this.physics);
    this.particles = new Particles(r.preset.particleMax);
    this.decals = new FloorDecals(r.preset.decalPool);
    r.scene.add(this.particles.points, this.decals.group);
    this.particles.onGroundHit = (x, z, s) => {
      if (rngs.vfx.chance(0.35)) this.decals.add(x, z, s * 1.6);
    };
    this.combat = new CombatSystem(this.particles, this.camera, r);
    const marcioModel = new CharacterModel(this.marcioGltf, this.lib, null, 'idleCombat');
    r.scene.add(marcioModel.root);
    const pa = new Actor('player', marcioModel, this.physics, 100, 999, this.level.spawn);
    pa.yaw = Math.PI;
    this.player = new Player(pa, this.combat);
    this.combat.fighters.push(this.player);
    this.camera.yaw = 0;
    this.hud = new Hud(this.uiRoot);
    this.hud.el.classList.add('hidden');
    this.applyDifficulty(this.difficulty);
    this.wireEvents();
  }

  applyDifficulty(d: DifficultyName): void {
    this.difficulty = d;
    const def = difficultyData.levels[d];
    this.director.tokens = def.tokens;
    this.combat.enemyDamageScale = def.damage;
  }

  private wireEvents(): void {
    events.on('HitLanded', (e) => {
      if (e.attackerId === this.player.actor.id) this.addWolf(e.damage * 0.35 * (1 + Math.min(this.combat.combo, 20) / 20));
    });
    events.on('Killed', (e) => {
      this.kills++;
      this.addWolf(4 + e.tier * 2);
      const enemy = this.enemies.find((x) => x.actor.id === e.victimId);
      if (enemy) this.makeCorpse(enemy.actor);
    });
    events.on('PlayerDamaged', (e) => {
      this.addWolf(e.damage * 0.25);
      this.hud.damageFlash();
      if (this.godMode) this.player.actor.hp = this.player.actor.maxHp;
    });
    events.on('PerfectDodge', () => {
      this.addWolf(5);
      this.loop.timeScale = 0.3;
      setTimeout(() => (this.loop.timeScale = 1), 320);
      this.hud.setHint('ESQUIVA PERFEITA');
      setTimeout(() => this.hud.setHint(null), 700);
    });
    events.on('ComboChanged', (e) => this.hud.setCombo(e.count));
  }

  private addWolf(v: number): void {
    const gain = difficultyData.levels[this.difficulty].wolfGain;
    this.wolfMeter = Math.min(100, this.wolfMeter + v * gain);
  }

  private makeCorpse(actor: Actor): void {
    actor.disableCollision();
    const imp = new THREE.Vector3(actor.push.x * 0.55, 2.2 + Math.hypot(actor.push.x, actor.push.z) * 0.12, actor.push.z * 0.55);
    const rd = new Ragdoll(this.physics, actor.model, imp);
    this.corpses.push({ model: actor.model, ragdoll: rd, actor });
    audio.play('bodyfall', 0.8);
  }

  start(): void {
    this.started = true;
    this.hud.el.classList.remove('hidden');
    this.hud.setLives(this.player.lives);
    if (!this.loopRunning) this.loop.start();
    this.loopRunning = true;
    this.nextWave();
  }

  private loopRunning = false;

  /** Começa o loop só para o fundo do menu (câmera orbitando). */
  startBackground(): void {
    if (!this.loopRunning) {
      this.loop.start();
      this.loopRunning = true;
    }
  }

  spawnEnemy(archetype: string, at?: THREE.Vector3): Enemy {
    const def = archetypesData.archetypes[archetype];
    if (!def) throw new Error(`arquétipo desconhecido: ${archetype}`);
    const diff = difficultyData.levels[this.difficulty];
    const model = new CharacterModel(this.charGltf, this.libMannequin, { main: def.colors.main, joints: def.colors.joints, scale: def.scale, width: def.width }, 'idleCombat');
    this.renderer.scene.add(model.root);
    const pos = at ?? rngs.spawn.pick(this.level.enemySpawns).clone().add(new THREE.Vector3(rngs.spawn.range(-1.5, 1.5), 0, rngs.spawn.range(-1.5, 1.5)));
    const actor = new Actor('enemy', model, this.physics, def.hp * diff.hp, def.poise, pos);
    actor.yaw = actor.yawTo(this.player.actor);
    const e = new Enemy(actor, def, archetype, this.combat, diff);
    this.enemies.push(e);
    this.combat.fighters.push(e);
    return e;
  }

  nextWave(): void {
    const list = WAVES[this.wave % WAVES.length]!;
    const scale = difficultyData.levels[this.difficulty].waveScale;
    const count = Math.max(1, Math.round(list.length * scale));
    for (let i = 0; i < count; i++) this.spawnEnemy(list[i % list.length]!);
    this.hud.showBanner(this.wave === 0 ? 'BRIGA!' : `ONDA ${this.wave + 1}`, 'saguão do edifício vértice', 1.6);
    this.wave++;
  }

  private fixedUpdate(dt: number): void {
    const t0 = performance.now();
    for (const e of this.enemies) e.actor.beginStep();
    this.player.actor.beginStep();
    if (this.started) {
      this.player.update(dt, this.input, this.camera);
      this.director.update(dt, this.enemies, this.player);
      for (const e of this.enemies) e.update(dt, this.player);
      this.combat.update(dt);
      this.updateFlow(dt);
    }
    this.physics.step();
    this.timings.physics = this.physics.stepMs;
    this.timings.sim = performance.now() - t0;
  }

  private updateFlow(dt: number): void {
    // remove inimigos mortos da lista de luta
    if (this.enemies.some((e) => !e.alive)) {
      this.enemies = this.enemies.filter((e) => e.alive);
      this.combat.fighters = this.combat.fighters.filter((f) => f.alive || f.kind === 'player');
    }
    if (this.enemies.length === 0 && this.waveClearTimer < 0) {
      this.waveClearTimer = 3.2;
      this.hud.showBanner('SALA LIMPA', `${this.kills} derrubados`, 2.2);
    }
    if (this.waveClearTimer >= 0) {
      this.waveClearTimer -= dt;
      if (this.waveClearTimer < 0) this.nextWave();
    }
    // morte do Márcio
    if (!this.player.alive && this.respawnTimer < 0) {
      this.player.lives--;
      this.hud.setLives(this.player.lives);
      this.makeCorpsePlayer();
      this.respawnTimer = 2.8;
      this.hud.showBanner(this.player.lives > 0 ? 'NOCAUTE' : 'FIM DE JOGO', this.player.lives > 0 ? `${this.player.lives} vidas restantes` : 'recomeçando', 2.4);
    }
    if (this.respawnTimer >= 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer < 0) {
        const c = this.corpses.find((x) => x.actor === this.player.actor);
        if (c) {
          c.ragdoll?.freeze();
          this.corpses.splice(this.corpses.indexOf(c), 1);
        }
        if (this.player.lives <= 0) {
          this.player.lives = 3;
          this.wave = 0;
          this.hud.setLives(3);
        }
        this.player.respawn(this.level.spawn);
      }
    }
  }

  private makeCorpsePlayer(): void {
    const a = this.player.actor;
    a.disableCollision();
    const rd = new Ragdoll(this.physics, a.model, new THREE.Vector3(a.push.x * 0.5, 2, a.push.z * 0.5));
    this.corpses.push({ model: a.model, ragdoll: rd, actor: a });
  }

  private tmpTarget = new THREE.Vector3();

  private frameUpdate(frameDt: number, alpha: number): void {
    const f0 = performance.now();
    this.input.poll(frameDt);
    const look = this.input.takeLook();
    this.camera.rotate(look.dx, look.dy);

    // visual dos atores
    const a0 = performance.now();
    const pa = this.player.actor;
    pa.syncVisual(alpha);
    const playerRagdoll = !pa.alive;
    if (!playerRagdoll) pa.model.update(frameDt * this.loop.timeScale);
    for (const e of this.enemies) {
      e.actor.syncVisual(alpha);
      e.actor.model.update(frameDt * this.loop.timeScale);
    }
    for (const c of this.corpses) {
      if (c.ragdoll && c.ragdoll.active) {
        c.ragdoll.sync(frameDt);
        if (c.ragdoll.settled) {
          c.ragdoll.freeze();
          // poça de sangue sob o tronco
          c.ragdoll.torsoPosition(this.tmpTarget);
          this.decals.add(this.tmpTarget.x, this.tmpTarget.z, 1.1);
        }
      }
      c.model.updateFlash(frameDt);
    }
    this.timings.anim = performance.now() - a0;

    // câmera: centro das ameaças
    let cx = 0, cz = 0, n = 0;
    for (const e of this.enemies) {
      if (e.alive && e.engaged && e.actor.distanceTo(pa) < 9) {
        cx += e.actor.pos.x;
        cz += e.actor.pos.z;
        n++;
      }
    }
    this.camera.threatCount = n;
    if (n) this.camera.threatCenter.set(cx / n, 0, cz / n);
    this.tmpTarget.copy(pa.model.root.position);
    if (!pa.alive) {
      const c = this.corpses.find((x) => x.actor === pa);
      c?.ragdoll?.torsoPosition(this.tmpTarget);
      this.tmpTarget.y = 0;
    }
    const menuOrbit = !this.started;
    if (menuOrbit) this.camera.yaw += frameDt * 0.08;
    this.camera.update(frameDt, this.tmpTarget, pa.yaw, this.player.moveSpeed > 0.5, n > 0);

    this.level.update(frameDt);
    this.particles.update(frameDt * this.loop.timeScale);
    if (this.started) {
      this.hud.setHealth(pa.hp / pa.maxHp);
      this.hud.setWolf(this.wolfMeter / 100, false);
      const tgt = this.player.currentTarget;
      this.hud.update(frameDt, this.enemies, this.renderer.camera, tgt && tgt.kind === 'enemy' ? (tgt as Enemy) : null);
    }
    const r0 = performance.now();
    this.renderer.render(frameDt);
    this.timings.render = performance.now() - r0;
    this.timings.frame = performance.now() - f0;
  }
}
