import * as THREE from 'three';
import type { AnimLibrary } from './animLibrary';
import { LOCO_SPEED } from './animLibrary';
import { clamp, damp } from '../../core/math';

export interface OneShotOpts {
  fade?: number;
  speed?: number;
  /** Início do clipe em segundos. */
  start?: number;
  /** Corta o clipe nesse tempo (s) e devolve para a locomoção. */
  end?: number;
  fadeOut?: number;
  /** Eventos por tempo do clipe (s): chamados uma vez cada. */
  events?: { t: number; fn: () => void }[];
  onEnd?: () => void;
  /** Segura a última pose em vez de voltar à locomoção (morte, knockdown). */
  hold?: boolean;
}

interface ActiveShot {
  action: THREE.AnimationAction;
  opts: OneShotOpts;
  fired: boolean[];
  end: number;
  done: boolean;
}

/**
 * Animador por personagem: base de locomoção misturada por velocidade (idle/walk/jog/sprint)
 * + um "one-shot" por cima (golpes, reações, esquiva) com crossfade e eventos por tempo.
 */
export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private loco: Record<string, THREE.AnimationAction> = {};
  private idleName: string;
  private shot: ActiveShot | null = null;
  private shotActions = new Set<THREE.AnimationAction>();
  private locoWeight = 1;
  /** Velocidade planar atual (m/s) para mistura da locomoção. */
  speed = 0;
  /** Pausa local (hitstop): o relógio deste personagem para. */
  freeze = 0;
  /** Multiplicador local do tempo (slow-mo pessoal). */
  timeScale = 1;
  /** Acumulador para LOD de animação (atualiza a N Hz). */
  private lodAcc = 0;
  lodHz = 60;

  constructor(root: THREE.Object3D, private lib: AnimLibrary, idle = 'idle') {
    this.mixer = new THREE.AnimationMixer(root);
    this.idleName = idle;
    for (const n of [idle, 'walk', 'jog', 'sprint']) {
      if (!lib.has(n)) continue;
      const a = this.mixer.clipAction(lib.get(n));
      a.play();
      a.setEffectiveWeight(n === idle ? 1 : 0);
      this.loco[n] = a;
    }
  }

  setIdle(name: string): void {
    if (name === this.idleName || !this.lib.has(name)) return;
    const old = this.loco[this.idleName];
    const a = this.mixer.clipAction(this.lib.get(name));
    a.play();
    a.setEffectiveWeight(old ? old.getEffectiveWeight() : 1);
    if (old) {
      old.setEffectiveWeight(0);
      old.stop();
    }
    delete this.loco[this.idleName];
    this.idleName = name;
    this.loco[name] = a;
  }

  get busy(): boolean {
    return !!this.shot && !this.shot.done;
  }

  get shotName(): string | null {
    return this.shot && !this.shot.done ? this.shot.action.getClip().name : null;
  }

  get shotTime(): number {
    return this.shot ? this.shot.action.time : 0;
  }

  play(name: string, opts: OneShotOpts = {}): THREE.AnimationAction {
    const clip = this.lib.get(name);
    const fade = opts.fade ?? 0.08;
    const prev = this.shot;
    const action = this.mixer.clipAction(clip);
    // Se o mesmo clipe está tocando, reinicia limpo (combos que repetem o golpe).
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = opts.speed ?? 1;
    action.time = opts.start ?? 0;
    action.setEffectiveWeight(1);
    action.play();
    if (prev && prev.action !== action && !prev.done) prev.action.fadeOut(fade);
    else if (prev && prev.action !== action) prev.action.fadeOut(fade);
    action.fadeIn(fade);
    this.shotActions.add(action);
    this.shot = {
      action,
      opts,
      fired: (opts.events ?? []).map(() => false),
      end: Math.min(opts.end ?? clip.duration, clip.duration),
      done: false,
    };
    return action;
  }

  /** Interrompe o one-shot atual e volta para a locomoção. */
  stopShot(fade = 0.12): void {
    if (this.shot && !this.shot.done) {
      this.shot.action.fadeOut(fade);
      this.shot.done = true;
    }
  }

  update(dt: number): void {
    if (this.freeze > 0) {
      this.freeze -= dt;
      return;
    }
    const sdt = dt * this.timeScale;
    // LOD: acumula e só avança o mixer na frequência alvo
    this.lodAcc += sdt;
    const minStep = this.lodHz >= 60 ? 0 : 1 / Math.max(1, this.lodHz);
    if (this.lodHz <= 0 || this.lodAcc < minStep) return;
    const step = this.lodAcc;
    this.lodAcc = 0;

    this.updateLoco(step);
    const s = this.shot;
    if (s && !s.done) {
      const t = s.action.time;
      const evs = s.opts.events;
      if (evs) {
        for (let i = 0; i < evs.length; i++) {
          if (!s.fired[i] && t >= evs[i]!.t) {
            s.fired[i] = true;
            evs[i]!.fn();
          }
        }
      }
      if (t >= s.end - 1e-3 || (!s.action.isRunning() && !s.opts.hold)) {
        if (!s.opts.hold) {
          s.action.fadeOut(s.opts.fadeOut ?? 0.15);
          s.done = true;
        } else {
          s.action.paused = true;
        }
        s.opts.onEnd?.();
        if (s.opts.hold) s.done = true;
      }
    }
    // Locomoção completa o peso que os one-shots não ocupam (soma ≈ 1 → nunca mistura com a pose de bind).
    let sum = 0;
    for (const a of this.shotActions) {
      const w = a.enabled ? a.getEffectiveWeight() : 0;
      if (w <= 0 && !a.isRunning() && a !== s?.action) this.shotActions.delete(a);
      sum += w;
    }
    if (s && s.opts.hold && s.done) sum = 1;
    this.locoWeight = clamp(1 - sum, 0, 1);
    this.applyLocoWeights();
    this.mixer.update(step);
  }

  private wIdle = 1;
  private wWalk = 0;
  private wJog = 0;
  private wSprint = 0;

  private updateLoco(dt: number): void {
    const v = this.speed;
    const ws = LOCO_SPEED.walk!;
    const js = LOCO_SPEED.jog!;
    const ss = LOCO_SPEED.sprint!;
    let i = 0, w = 0, j = 0, s = 0;
    if (v < 0.15) i = 1;
    else if (v < ws) { const t = v / ws; i = 1 - t; w = t; }
    else if (v < js) { const t = (v - ws) / (js - ws); w = 1 - t; j = t; }
    else { const t = clamp((v - js) / (ss - js), 0, 1); j = 1 - t; s = t; }
    const h = 0.06;
    this.wIdle = damp(this.wIdle, i, h, dt);
    this.wWalk = damp(this.wWalk, w, h, dt);
    this.wJog = damp(this.wJog, j, h, dt);
    this.wSprint = damp(this.wSprint, s, h, dt);
    // sincroniza cadência com a velocidade real
    const sync = (a: THREE.AnimationAction | undefined, native: number) => {
      if (a) a.timeScale = clamp(v / native, 0.6, 1.6);
    };
    sync(this.loco.walk, ws);
    sync(this.loco.jog, js);
    sync(this.loco.sprint, ss);
  }

  private applyLocoWeights(): void {
    const k = this.locoWeight;
    this.loco[this.idleName]?.setEffectiveWeight(this.wIdle * k);
    this.loco.walk?.setEffectiveWeight(this.wWalk * k);
    this.loco.jog?.setEffectiveWeight(this.wJog * k);
    this.loco.sprint?.setEffectiveWeight(this.wSprint * k);
  }
}
