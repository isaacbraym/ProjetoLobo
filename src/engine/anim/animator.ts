import * as THREE from 'three';
import type { AnimLibrary } from './animLibrary';
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

export type LocoSlot = 'idle' | 'walk' | 'jog' | 'sprint' | 'strafeL' | 'strafeR';
const SLOTS: LocoSlot[] = ['idle', 'walk', 'jog', 'sprint', 'strafeL', 'strafeR'];

interface Retiring {
  action: THREE.AnimationAction;
  slot: LocoSlot;
}

/**
 * Animador por personagem:
 * - locomoção misturada por velocidade (idle/andar/correr/sprint) + strafe lateral, cadência dos pés
 *   sincronizada com a velocidade MEDIDA de cada clipe (sem pé deslizando);
 * - troca do conjunto de locomoção com crossfade (humano ↔ lobisomem);
 * - "one-shot" por cima (golpes, reações, esquiva) com crossfade e eventos por tempo.
 * A soma dos pesos fica sempre ≥ 1 (nunca mistura com a pose de bind = sem "estalo" de pose T).
 */
export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private slots: Partial<Record<LocoSlot, THREE.AnimationAction>> = {};
  private slotClip: Partial<Record<LocoSlot, string>> = {};
  private w: Record<LocoSlot, number> = { idle: 1, walk: 0, jog: 0, sprint: 0, strafeL: 0, strafeR: 0 };
  private retiring: Retiring[] = [];
  private swapT = 1;
  private shot: ActiveShot | null = null;
  private shotActions = new Set<THREE.AnimationAction>();
  private locoWeight = 1;
  /** Velocidade planar atual (m/s) para mistura da locomoção. */
  speed = 0;
  /** Componente lateral do movimento relativo à frente (−1 esquerda … +1 direita) para strafe. */
  strafe = 0;
  /** Pausa local (hitstop): o relógio deste personagem para. */
  freeze = 0;
  /** Multiplicador local do tempo (slow-mo pessoal). */
  timeScale = 1;
  private lodAcc = 0;
  lodHz = 60;
  private speedRef: Partial<Record<LocoSlot, number>> = {};

  constructor(root: THREE.Object3D, private lib: AnimLibrary, idle = 'idle') {
    this.mixer = new THREE.AnimationMixer(root);
    this.setLocoSet({ idle, walk: 'walk', jog: 'jog', sprint: 'sprint', strafeL: 'strafeL', strafeR: 'strafeR' }, true);
  }

  /** Troca clipes de locomoção (ex.: lobisomem). Crossfade de 0,3 s, sem buraco de peso. */
  setLocoSet(set: Partial<Record<LocoSlot, string>>, instant = false): void {
    for (const slot of SLOTS) {
      const name = set[slot];
      if (!name || !this.lib.has(name) || this.slotClip[slot] === name) continue;
      const old = this.slots[slot];
      const a = this.mixer.clipAction(this.lib.get(name));
      a.reset();
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.play();
      a.setEffectiveWeight(0);
      if (old && !instant) {
        // continua em fase: começa no mesmo ponto normalizado do ciclo
        a.time = (old.time / old.getClip().duration) * a.getClip().duration;
        this.retiring.push({ action: old, slot });
      } else if (old) old.stop();
      this.slots[slot] = a;
      this.slotClip[slot] = name;
      this.speedRef[slot] = this.lib.locoSpeed[name] ?? this.lib.locoSpeed[slot];
    }
    this.swapT = instant ? 1 : 0;
  }

  /** Compatível com versões antigas: troca só o idle. */
  setIdle(name: string): void {
    this.setLocoSet({ idle: name });
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
    const fade = opts.fade ?? 0.1;
    const prev = this.shot;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = opts.speed ?? 1;
    action.time = opts.start ?? 0;
    action.setEffectiveWeight(1);
    action.play();
    if (prev && prev.action !== action) prev.action.fadeOut(fade);
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
  stopShot(fade = 0.15): void {
    if (this.shot && !this.shot.done) {
      this.shot.action.fadeOut(fade);
      this.shot.done = true;
    }
  }

  has(name: string): boolean {
    return this.lib.has(name);
  }

  clipDuration(name: string): number {
    return this.lib.has(name) ? this.lib.get(name).duration : 0;
  }

  /** Muda a velocidade do one-shot atual (telegrafia → golpe). */
  setShotSpeed(v: number): void {
    if (this.shot && !this.shot.done) this.shot.action.timeScale = v;
  }

  update(dt: number): void {
    if (this.freeze > 0) {
      this.freeze -= dt;
      return;
    }
    const sdt = dt * this.timeScale;
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
          s.action.fadeOut(s.opts.fadeOut ?? 0.2);
          s.done = true;
        } else {
          s.action.paused = true;
        }
        s.opts.onEnd?.();
        if (s.opts.hold) s.done = true;
      }
    }
    let sum = 0;
    for (const a of this.shotActions) {
      const w = a.enabled ? a.getEffectiveWeight() : 0;
      if (w <= 0 && !a.isRunning() && a !== s?.action) this.shotActions.delete(a);
      sum += w;
    }
    if (s && s.opts.hold && s.done) sum = 1;
    this.locoWeight = clamp(1 - sum, 0, 1);
    this.applyLocoWeights(step);
    this.mixer.update(step);
  }

  private updateLoco(dt: number): void {
    const v = this.speed;
    const ws = this.speedRef.walk ?? 1.25;
    const js = this.speedRef.jog ?? 3.4;
    const ss = this.speedRef.sprint ?? 5.6;
    let i = 0, w = 0, j = 0, s = 0;
    if (v < 0.12) i = 1;
    else if (v < ws) { const t = v / ws; i = 1 - t; w = t; }
    else if (v < js) { const t = (v - ws) / (js - ws); w = 1 - t; j = t; }
    else { const t = clamp((v - js) / (ss - js), 0, 1); j = 1 - t; s = t; }
    // strafe: quando anda de lado, troca a parte "para frente" pelo clipe lateral
    let sl = 0, sr = 0;
    const lateral = clamp(Math.abs(this.strafe), 0, 1);
    if (v > 0.25 && lateral > 0.35 && (this.slots.strafeL || this.slots.strafeR)) {
      const k = clamp((lateral - 0.35) / 0.45, 0, 1);
      const moving = 1 - i;
      if (this.strafe < 0) sl = moving * k;
      else sr = moving * k;
      w *= 1 - k;
      j *= 1 - k;
      s *= 1 - k;
    }
    const h = 0.08;
    this.w.idle = damp(this.w.idle, i, h, dt);
    this.w.walk = damp(this.w.walk, w, h, dt);
    this.w.jog = damp(this.w.jog, j, h, dt);
    this.w.sprint = damp(this.w.sprint, s, h, dt);
    this.w.strafeL = damp(this.w.strafeL, sl, h, dt);
    this.w.strafeR = damp(this.w.strafeR, sr, h, dt);
    // cadência dos pés = velocidade real / velocidade nativa do clipe (medida no retarget)
    const sync = (slot: LocoSlot, native: number) => {
      const a = this.slots[slot];
      if (a) a.timeScale = clamp(v / native, 0.55, 1.7);
    };
    sync('walk', ws);
    sync('jog', js);
    sync('sprint', ss);
    sync('strafeL', this.speedRef.strafeL ?? 1.6);
    sync('strafeR', this.speedRef.strafeR ?? 1.6);
  }

  private applyLocoWeights(dt: number): void {
    const k = this.locoWeight;
    if (this.swapT < 1) this.swapT = Math.min(1, this.swapT + dt / 0.3);
    const inT = this.swapT;
    for (const slot of SLOTS) {
      const a = this.slots[slot];
      if (!a) continue;
      const isNew = this.retiring.some((r) => r.slot === slot);
      a.setEffectiveWeight(this.w[slot] * k * (isNew ? inT : 1));
    }
    for (const r of this.retiring) r.action.setEffectiveWeight(this.w[r.slot] * k * (1 - inT));
    if (inT >= 1 && this.retiring.length) {
      for (const r of this.retiring) r.action.stop();
      this.retiring.length = 0;
    }
  }
}
