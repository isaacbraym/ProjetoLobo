import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FixedLoop } from '../core/loop';
import { events } from '../core/events';
import { rngs } from '../core/rng';
import { Renderer } from '../engine/render/renderer';
import { Physics } from '../engine/physics/physics';
import { Assets, assetUrl } from '../engine/assets/loader';
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
import { archetypesData, attacksData, difficultyData, type DifficultyName } from './data/gameData';
import authoredJson from '../../data/anim/authored.json';
import wolfJson from '../../data/werewolf.json';
import { WerewolfSystem } from './werewolf/werewolf';
import { FinisherSystem } from './combat/finishers';
import { AimPicker, type BodyRef } from './player/aim';
import { Reticle, type ReticleState } from '../presentation/ui/reticle';

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
  private marcioFace?: THREE.Texture;
  private enemyModels = new Map<string, GLTF>();
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
  wolf!: WerewolfSystem;
  finishers!: FinisherSystem;
  get wolfMeter(): number {
    return this.wolf ? this.wolf.meter : 0;
  }
  started = false;
  /** Tempo de simulação de cada sistema (ms), para o overlay de perf. */
  readonly timings = { sim: 0, anim: 0, physics: 0, render: 0, frame: 0 };
  godMode = false;
  kills = 0;
  /** Câmera-mira: o que está sob o cursor. */
  readonly aim = new AimPicker();
  private reticle!: Reticle;
  private bodies: BodyRef[] = [];
  private eaten = new WeakSet<object>();
  /** Pausa (Esc / Start): o jogo para, a UI decide o que mostrar. */
  onPauseRequest: (() => void) | null = null;

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
    try {
      // rosto v2: foto inteira em resolução nativa, arquivo sem extensão (DEC-0015) — o <img> detecta o PNG pelo
      // conteúdo. RGB = foto tratada, A = máscara de pelo (cabelo/barba) usada pelas cascas.
      this.marcioFace = await new THREE.TextureLoader().loadAsync(assetUrl('assets/characters/marcio_f'));
      this.marcioFace.flipY = false;
      this.marcioFace.colorSpace = THREE.SRGBColorSpace;
      this.marcioFace.anisotropy = 8;
      this.marcioFace.generateMipmaps = true;
    } catch {
      console.warn('[game] foto do rosto ausente');
    }
    // modelos de inimigos gerados no Blender (se faltar algum, cai no manequim)
    const models = [...new Set(Object.values(archetypesData.archetypes).map((a) => a.model).filter((m): m is string => !!m))];
    await Promise.all(
      models.map(async (m) => {
        try {
          this.enemyModels.set(m, await this.assets.load(`assets/characters/${m}.glb`));
        } catch {
          console.warn('[game] modelo ausente, usando manequim:', m);
        }
      }),
    );
    this.libMannequin.addFromGltf(gltf);
    let meta: Record<string, import('../engine/anim/animLibrary').ClipMeta> | undefined;
    try {
      const res = await fetch(assetUrl('assets/anims/mixamo_meta.json'));
      if (res.ok) meta = await res.json();
    } catch {
      /* sem metadado: usa velocidades padrão */
    }
    this.lib.addFromGltf(anims, meta);
    // golpes autorados por pose-chave (gancho, uppercut, chute) — um conjunto por esqueleto
    const authored = (authoredJson as { clips: Record<string, AuthoredClipDef> }).clips;
    const refM = skeletonClone(gltf.scene);
    const refH = skeletonClone(marcio.scene);
    for (const [name, def] of Object.entries(authored)) {
      this.libMannequin.clips.set(name, authorClip(name, refM, this.libMannequin.get(def.base), def));
      this.lib.clips.set(name, authorClip(name, refH, this.lib.get(def.base), def));
    }
    this.setupWorld();
    this.warmup();
  }

  /** Compila os shaders de todos os personagens/efeitos no loading (sem travada no primeiro inimigo/sangue). */
  warmup(): void {
    const tmp: CharacterModel[] = [];
    for (const g of this.enemyModels.values()) {
      const m = new CharacterModel(g, this.lib, null, 'idleCombat');
      m.root.position.set(0, -50, 0);
      this.renderer.scene.add(m.root);
      tmp.push(m);
    }
    this.particles.blood(0, -50, 0, 1, 0, 1);
    this.decals.add(0, 0, 0.01, -50);
    this.renderer.gl.compile(this.renderer.scene, this.renderer.camera);
    this.renderer.render(1 / 60);
    for (const m of tmp) this.renderer.scene.remove(m.root);
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
    const marcioModel = new CharacterModel(this.marcioGltf, this.lib, null, 'idleCombat', undefined, 1, this.marcioFace);
    r.scene.add(marcioModel.root);
    const pa = new Actor('player', marcioModel, this.physics, 100, 999, this.level.spawn);
    pa.yaw = Math.PI;
    this.player = new Player(pa, this.combat);
    this.combat.fighters.push(this.player);
    this.camera.yaw = 0;
    this.hud = new Hud(this.uiRoot);
    this.hud.el.classList.add('hidden');
    this.reticle = new Reticle(this.uiRoot);
    this.wolf = new WerewolfSystem(this.player, this.camera, this.loop, r, this.particles, () => this.enemies, this.uiRoot);
    this.finishers = new FinisherSystem(this.player, this.camera, this.loop, this.particles, r, () => this.enemies);
    this.player.onInteract = () => this.finishers.tryStart();
    events.on('FinisherStarted', () => this.addWolf(wolfJson.meter.perFinisher));
    this.player.onKickOverride = () => this.tryEat();
    this.player.onWolfRequest = () => {
      if (this.wolf.state === 'wolf') return this.wolf.specialRoar();
      const ok = this.wolf.trigger();
      if (!ok && this.wolf.state === 'human') {
        this.hud.setHint(`RAIVA ${Math.floor(this.wolf.meter)}%`);
        setTimeout(() => this.hud.setHint(null), 800);
      }
      return ok;
    };
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
      if (e.attackerId === this.player.actor.id) this.addWolf(e.damage * wolfJson.meter.perDamage * (1 + Math.min(this.combat.combo, 20) / 20));
    });
    events.on('Killed', (e) => {
      this.kills++;
      this.addWolf(wolfJson.meter.perKillBase + e.tier * wolfJson.meter.perKillTier);
      const enemy = this.enemies.find((x) => x.actor.id === e.victimId);
      if (enemy) this.makeCorpse(enemy.actor);
    });
    events.on('PlayerDamaged', (e) => {
      this.addWolf(e.damage * wolfJson.meter.perDamageTaken);
      this.hud.damageFlash();
      if (this.godMode) this.player.actor.hp = this.player.actor.maxHp;
    });
    events.on('PerfectDodge', () => {
      this.addWolf(wolfJson.meter.perPerfectDodge);
      this.loop.timeScale = 0.3;
      setTimeout(() => (this.loop.timeScale = 1), 320);
      this.hud.setHint('ESQUIVA PERFEITA');
      setTimeout(() => this.hud.setHint(null), 700);
    });
    events.on('ComboChanged', (e) => this.hud.setCombo(e.count));
  }

  private addWolf(v: number): void {
    this.wolf.add(v * difficultyData.levels[this.difficulty].wolfGain);
  }

  private makeCorpse(actor: Actor): void {
    actor.disableCollision();
    const pending = this.finishers?.pendingImpulse.get(actor.id);
    const imp = pending ?? new THREE.Vector3(actor.push.x * 0.4, 0.9 + Math.hypot(actor.push.x, actor.push.z) * 0.06, actor.push.z * 0.4);
    if (pending) this.finishers.pendingImpulse.delete(actor.id);
    const rd = new Ragdoll(this.physics, actor.model, imp);
    this.corpses.push({ model: actor.model, ragdoll: rd, actor });
    audio.play('bodyfall', 0.8);
  }

  /** Lobo + corpo sob o cursor (ou bem à frente, na câmera livre/gamepad) → devorar. */
  private tryEat(): boolean {
    if (this.wolf.state !== 'wolf') return false;
    const W = wolfJson.special;
    const pa = this.player.actor;
    let body = this.aim.body;
    if (body && Math.hypot(body.pos.x - pa.pos.x, body.pos.z - pa.pos.z) > W.eatLunge) body = null;
    if (!body) {
      // sem cursor: corpo mais próximo dentro do alcance e mais ou menos à frente
      let best = Infinity;
      for (const b of this.bodies) {
        const dx = b.pos.x - pa.pos.x, dz = b.pos.z - pa.pos.z;
        const d = Math.hypot(dx, dz);
        const ang = Math.abs(((Math.atan2(dx, dz) - pa.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d < W.eatRange && ang < 1.4 && d < best) (best = d), (body = b);
      }
    }
    if (!body) return false;
    const target = { pos: body.pos.clone(), key: body.key, enemy: body.enemy };
    this.eaten.add(target.key);
    this.player.startEat(target.pos, () => {
      // mordida: sangue, som, cura e mais tempo de lobo
      pa.hp = Math.min(pa.maxHp, pa.hp + W.eatHeal);
      this.wolf.feed(W.eatSeconds);
      const p = target.pos;
      this.particles.blood(p.x, p.y + 0.25, p.z, 2.2, 0, 1);
      this.decals.add(p.x, p.z, 1.3);
      audio.play('punchHeavy', 0.9);
      audio.play('bodyfall', 0.5);
      this.camera.addTrauma(0.35);
      this.renderer.chromaKick = Math.max(this.renderer.chromaKick, 0.6);
      this.hud.setHint(`+${W.eatHeal} VIDA  ·  +${W.eatSeconds}s LOBO`);
      setTimeout(() => this.hud.setHint(null), 900);
      if (target.enemy && target.enemy.alive) {
        const atk = attacksData.attacks.w_swipe2 ?? attacksData.attacks.p_slam!;
        target.enemy.takeHit({ attacker: pa, attack: { ...atk, bleed: true }, damage: 9999, dirX: 0, dirZ: 1, heavy: true });
      }
    });
    return true;
  }

  /** Corpos comestíveis: cadáveres (tronco) e inimigos caídos. Reaproveita os objetos (sem alocação por frame). */
  private refreshBodies(): void {
    let n = 0;
    const put = (key: object, x: number, y: number, z: number, enemy?: Enemy) => {
      if (this.eaten.has(key)) return;
      let b = this.bodies[n];
      if (!b) (b = { pos: new THREE.Vector3(), key }), this.bodies.push(b);
      b.key = key;
      b.pos.set(x, y, z);
      b.enemy = enemy;
      n++;
    };
    for (const c of this.corpses) {
      if (c.actor === this.player.actor) continue;
      if (c.ragdoll) c.ragdoll.torsoPosition(this.tmpBody);
      else this.tmpBody.copy(c.model.root.position);
      put(c, this.tmpBody.x, Math.max(0.15, this.tmpBody.y), this.tmpBody.z);
    }
    for (const e of this.enemies) if (e.alive && e.state === 'down') put(e, e.actor.pos.x, 0.25, e.actor.pos.z, e);
    this.bodies.length = n;
  }

  private tmpBody = new THREE.Vector3();

  /** Mira por frame: câmera-mira usa o cursor; câmera livre usa o centro da tela (só para devorar). */
  private updateAim(): void {
    const inp = this.input;
    const pa = this.player.actor;
    this.refreshBodies();
    const mouseAim = this.started && !inp.usingTouch && !inp.usingGamepad && inp.camMode === 'aim';
    const cam = this.renderer.camera;
    const h = this.renderer.gl.domElement.clientHeight || 720;
    let state: ReticleState = 'idle';
    if (mouseAim && inp.cursorInside) {
      const info = this.aim.update(cam, inp.cursorNdcX, inp.cursorNdcY, h, this.enemies, this.bodies, pa.pos);
      this.player.aim = info;
      // cursor na borda da tela gira a câmera devagar
      const ex = Math.abs(inp.cursorNdcX);
      this.camera.edgePan = ex > 0.86 ? -Math.sign(inp.cursorNdcX) * ((ex - 0.86) / 0.14) * 1.4 : 0;
    } else {
      this.aim.update(cam, 0, 0, h, [], this.bodies, pa.pos);
      this.player.aim = null;
      this.camera.edgePan = 0;
    }
    if (this.wolf.state === 'wolf' && this.aim.body !== null) state = 'eat';
    else if (this.aim.enemy && mouseAim) state = 'enemy';
    for (const e of this.enemies) e.actor.model.setHighlight(mouseAim && e === this.aim.enemy ? 1 : 0);
    this.camera.mode = inp.camMode === 'aim' && !inp.usingTouch && !inp.usingGamepad ? 'aim' : 'free';
    this.reticle.update(this.started && !this.loop.paused && !inp.usingTouch && !inp.usingGamepad && (mouseAim ? inp.cursorInside : true), inp.cursorPx.x, inp.cursorPx.y, state, this.player.chargeLevel, !mouseAim);
    document.body.classList.toggle('aim-cursor', mouseAim && !this.loop.paused);
  }

  toggleCamera(): void {
    const m = this.input.toggleCamMode();
    this.hud.toast(m === 'aim' ? '<b>CÂMERA-MIRA</b> · o mouse escolhe em quem bater · <b>G</b> troca' : '<b>CÂMERA LIVRE</b> · o mouse gira a câmera · <b>G</b> troca');
  }

  start(): void {
    this.started = true;
    this.input.gameActive = true;
    void audio.loadBuffer('fala_lobinho', 'assets/audio/transform_fala_lobinho.mp3');
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
    const gltfModel = def.model ? this.enemyModels.get(def.model) : undefined;
    const model = gltfModel
      ? new CharacterModel(gltfModel, this.lib, null, 'idleCombat', def.palette ? rngs.spawn.pick(def.palette) : undefined, def.modelScale ?? 1)
      : new CharacterModel(this.charGltf, this.libMannequin, { main: def.colors.main, joints: def.colors.joints, scale: def.scale, width: def.width }, 'idleCombat');
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
    if (this.started && this.input.consume((a) => a === 'camToggle')) this.toggleCamera();
    if (this.started && this.input.consume((a) => a === 'pause')) this.onPauseRequest?.();
    this.updateAim();

    // visual dos atores
    const a0 = performance.now();
    const pa = this.player.actor;
    pa.syncVisual(alpha);
    const playerRagdoll = !pa.alive;
    if (!playerRagdoll) pa.model.update(frameDt * (this.wolf.state === 'transforming' ? 1 : this.loop.timeScale));
    this.wolf.update(frameDt);
    this.finishers.update(frameDt);
    this.wolf.applyVisual();
    this.player.damageMul = this.wolf.damageMul;
    this.player.speedMul = this.wolf.speedMul;
    this.player.damageTakenMul = this.wolf.state === 'wolf' ? 0.5 : 1;
    for (const e of this.enemies) {
      e.actor.syncVisual(alpha);
      e.actor.model.update(frameDt * this.loop.timeScale);
    }
    for (const c of this.corpses) {
      if (c.ragdoll && c.ragdoll.active) {
        c.ragdoll.sync(frameDt);
        if (c.ragdoll.settled) {
          c.ragdoll.freeze();
          c.model.root.traverse((o) => ((o as THREE.Mesh).castShadow = false));
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
      this.hud.setWolf(this.wolf.active ? this.wolf.timerFraction : this.wolf.meter / 100, this.wolf.active);
      const fin = this.finishers.candidate();
      const inp = this.input;
      if (fin) this.hud.setHint(inp.usingTouch ? 'PEGAR  —  FINALIZAR' : inp.usingGamepad ? 'RB  —  FINALIZAR' : 'CTRL  —  FINALIZAR');
      else if (this.wolf.ready) this.hud.setHint(inp.usingTouch ? 'LOBO  —  FALA LOBINHO' : inp.usingGamepad ? 'LT + RT  —  FALA LOBINHO' : 'ESPAÇO  —  FALA LOBINHO');
      else if (this.wolf.state === 'wolf' && this.aim.body && this.player.state !== 'eat') this.hud.setHint(inp.usingTouch ? 'CHUTE NO CORPO  —  DEVORAR' : inp.usingGamepad ? 'B  —  DEVORAR' : 'CLIQUE DIREITO NO CORPO  —  DEVORAR');
      else if (!this.finishers.active) this.hud.setHint(null);
      const tgt = this.player.currentTarget;
      this.hud.update(frameDt, this.enemies, this.renderer.camera, tgt && tgt.kind === 'enemy' ? (tgt as Enemy) : null);
    }
    const r0 = performance.now();
    this.renderer.render(frameDt);
    this.timings.render = performance.now() - r0;
    this.timings.frame = performance.now() - f0;
  }
}
