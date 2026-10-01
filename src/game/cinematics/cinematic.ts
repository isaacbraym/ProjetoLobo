import * as THREE from 'three';
import type { Game } from '../game';
import type { Actor } from '../actors/actor';
import type { Enemy } from '../ai/enemy';
import type { CinematicDef, CinematicEvent } from '../data/cinematicSchema';
import type { CineOverlay } from '../../presentation/ui/cineOverlay';
import { audio } from '../../engine/audio/audio';

/**
 * Tocador de cinemáticas dirigidas por dados (data/cinematics/*.json): câmera por chaves (com cortes secos e
 * suavização por segmento), profundidade de campo e luz de borda no ator, ações de atores (posicionar, andar, idle,
 * clipe, objetos na mão, largar), grupos que aparecem, legendas, título, som e tremor. Pulável depois de
 * `skippableAfter` (qualquer tecla/clique/toque). Reutilizável (intro do boss).
 */
type PropId = 'phone' | 'coffee';

interface Walk {
  actor: Actor;
  path: THREE.Vector3[];
  idx: number;
  speed: number;
  faceEnd?: number;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

export class CinematicPlayer {
  active = false;
  t = 0;
  private def: CinematicDef | null = null;
  private fired: boolean[] = [];
  private walks = new Map<Actor, Walk>();
  private scripted = new Set<Enemy>();
  private props = new Map<string, THREE.Object3D>();
  /** objetos na mão: ator, mão (osso), dedo de referência (ponto da pegada) */
  private held = new Map<THREE.Object3D, { actor: Actor; hand: string; finger: string; prop: PropId }>();
  private falling: { obj: THREE.Object3D; vy: number; spin: number; prop: PropId }[] = [];
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private dofTarget: string | null = null;
  private rimTarget: string | null = null;
  private skipArmed = false;
  private skipRequested = false;
  onEnd: (() => void) | null = null;

  constructor(
    private game: Game,
    private overlay: CineOverlay,
    /** luz de borda (criada no setup para não mudar a contagem de luzes → sem recompilar shader) */
    private rim: THREE.PointLight,
  ) {
    const req = () => {
      if (this.active && this.skipArmed) this.skipRequested = true;
    };
    window.addEventListener('keydown', req);
    window.addEventListener('mousedown', req);
    window.addEventListener('touchstart', req, { passive: true });
  }

  play(def: CinematicDef): void {
    this.def = def;
    this.active = true;
    this.t = 0;
    this.fired = def.events.map(() => false);
    this.walks.clear();
    this.skipArmed = false;
    this.skipRequested = false;
    this.overlay.show(true);
    this.game.hud.el.classList.add('hidden');
    this.game.player.setCine(true);
    this.game.camera.cineSnap = true;
    if (this.game.encounters) this.game.encounters.paused = true;
    this.fire(0);
    this.applyCamera();
  }

  // ---------- atores ----------
  private actor(ref: string): Actor | null {
    if (ref === 'marcio') return this.game.player.actor;
    const enc = this.game.encounters;
    if (!enc) return null;
    if (ref.startsWith('refem:')) return enc.hostages.find((h) => h.id === ref.slice(6))?.actor ?? null;
    const [gid, idx] = ref.split(':');
    const e = enc.groups.find((g) => g.id === gid)?.members[Number(idx)];
    if (!e) return null;
    if (!this.scripted.has(e)) {
      e.scripted = true;
      this.scripted.add(e);
    }
    return e.actor;
  }

  private setGroupVisible(gid: string, on: boolean): void {
    const enc = this.game.encounters;
    if (!enc) return;
    const g = enc.groups.find((x) => x.id === gid);
    g?.members.forEach((e) => {
      e.hidden = !on;
      e.actor.model.setVisible(on);
    });
    enc.hostages.filter((h) => h.groupId === gid).forEach((h) => {
      h.hidden = !on;
      h.actor.model.setVisible(on);
    });
  }

  private makeProp(id: PropId): THREE.Object3D {
    const g = new THREE.Group();
    if (id === 'phone') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.009), new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.3, metalness: 0.4 }));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.138), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.75, 1.0).multiplyScalar(1.6), toneMapped: false }));
      scr.position.z = 0.0051;
      g.add(body, scr);
      void 0;
    } else {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.043, 0.034, 0.13, 14), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.5 }));
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.04, 0.05, 14), new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8 }));
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.014, 14), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4 }));
      lid.position.y = 0.071;
      g.add(cup, sleeve, lid);
      void 0;
    }
    g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return g;
  }

  private attach(ref: string, id: PropId): void {
    const a = this.actor(ref);
    if (!a) return;
    // a pose "segurar o celular" (Idle_Torch_Loop) ergue a mão esquerda: celular na esquerda, café na direita
    const side = id === 'phone' ? 'l' : 'r';
    const p = this.makeProp(id);
    this.game.renderer.scene.add(p);
    this.props.set(`${ref}:${id}`, p);
    this.held.set(p, { actor: a, hand: `hand_${side}`, finger: `middle_01_${side}`, prop: id });
    this.placeHeld(p);
  }

  /** Posiciona um objeto segurado: ponto da pegada entre a mão e o dedo médio; orientação em espaço de mundo. */
  private placeHeld(p: THREE.Object3D): void {
    const h = this.held.get(p);
    if (!h) return;
    const m = h.actor.model;
    m.boneWorld(h.hand, _v);
    if (m.bone(h.finger)) m.boneWorld(h.finger, _w);
    else _w.copy(_v);
    p.position.copy(_v).lerp(_w, 0.6);
    if (h.prop === 'phone') {
      this.headOf('marcio', _w);
      p.position.y += 0.02;
      p.lookAt(_w);
    } else {
      p.position.y -= 0.03;
      p.rotation.set(0, h.actor.yaw, 0);
    }
  }

  /** Depois da animação (pose final do quadro): objetos acompanham as mãos sem atraso. */
  lateUpdate(): void {
    if (!this.active) return;
    for (const p of this.held.keys()) this.placeHeld(p);
  }

  private detach(ref: string, id: PropId, drop: boolean): void {
    const key = `${ref}:${id}`;
    const p = this.props.get(key);
    if (!p) return;
    this.props.delete(key);
    this.held.delete(p);
    if (!drop) {
      p.removeFromParent();
      return;
    }
    // larga: cai girando de onde estava
    this.falling.push({ obj: p, vy: 0.4, spin: 9, prop: id });
  }

  // ---------- eventos ----------
  private fire(t: number): void {
    const def = this.def!;
    def.events.forEach((e, i) => {
      if (this.fired[i] || e.t > t) return;
      this.fired[i] = true;
      this.run(e);
    });
  }

  private run(e: CinematicEvent): void {
    switch (e.do) {
      case 'place': {
        const a = this.actor(e.actor);
        if (!a) break;
        a.teleport(new THREE.Vector3(e.x, 0, e.z));
        a.yaw = a.prevYaw = e.yaw;
        this.walks.delete(a);
        break;
      }
      case 'walk': {
        const a = this.actor(e.actor);
        if (a) this.walks.set(a, { actor: a, path: e.to.map(([x, z]) => new THREE.Vector3(x, 0, z)), idx: 0, speed: e.speed, faceEnd: e.faceEnd });
        break;
      }
      case 'idle': {
        const a = this.actor(e.actor);
        a?.model.animator.setLocoSet({ idle: e.clip });
        break;
      }
      case 'anim': {
        const a = this.actor(e.actor);
        a?.model.animator.play(e.clip, { speed: e.speed ?? 1, start: e.start ?? 0, end: e.end, fade: 0.15, fadeOut: 0.25 });
        break;
      }
      case 'upper': {
        const a = this.actor(e.actor);
        a?.model.animator.setUpper(e.clip);
        break;
      }
      case 'attach':
        this.attach(e.actor, e.prop);
        break;
      case 'detach':
        this.detach(e.actor, e.prop, false);
        break;
      case 'drop':
        this.detach(e.actor, e.prop, true);
        break;
      case 'hideGroup':
        this.setGroupVisible(e.group, false);
        break;
      case 'showGroup':
        this.setGroupVisible(e.group, true);
        break;
      case 'caption':
        this.overlay.say(e.text, e.who, e.style ?? 'line', e.dur);
        break;
      case 'title':
        this.overlay.showTitle(e.text, e.sub, e.dur);
        break;
      case 'sound':
        audio.play(e.id, e.vol ?? 1);
        break;
      case 'shake':
        this.game.camera.addTrauma(e.amount);
        break;
      case 'end':
        break;
    }
  }

  // ---------- câmera ----------
  private anchorPos = new Map<string, THREE.Vector3>();
  private ka = new THREE.Vector3();
  private kb = new THREE.Vector3();
  private la = new THREE.Vector3();
  private lb = new THREE.Vector3();

  /** Converte pos/look de uma chave para o mundo (ancorada = no referencial da cabeça do ator, suavizado). */
  private keyWorld(key: CinematicDef['camera'][number], pos: THREE.Vector3, look: THREE.Vector3): void {
    if (!key.anchor) {
      pos.set(...key.pos);
      look.set(...key.look);
      return;
    }
    const a = this.actor(key.anchor);
    let h = this.anchorPos.get(key.anchor);
    if (!h) this.anchorPos.set(key.anchor, (h = new THREE.Vector3()));
    if (!a) {
      pos.set(...key.pos);
      look.set(...key.look);
      return;
    }
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const rx = -Math.cos(a.yaw), rz = Math.sin(a.yaw);
    const at = (v: readonly [number, number, number], out: THREE.Vector3) => out.set(h!.x + rx * v[0] + fx * v[2], h!.y + v[1], h!.z + rz * v[0] + fz * v[2]);
    at(key.pos, pos);
    at(key.look, look);
  }

  private updateAnchors(dt: number): void {
    for (const [ref, h] of this.anchorPos) {
      if (!this.headOf(ref, _v)) continue;
      if (h.lengthSq() === 0) h.copy(_v);
      else h.lerp(_v, Math.min(1, dt * 6));
    }
  }

  private applyCamera(dt = 0): void {
    const keys = this.def!.camera;
    let i = 0;
    for (let k = 0; k < keys.length; k++) if (keys[k]!.t <= this.t) i = k;
    const a = keys[i]!;
    const b = keys[i + 1];
    // âncoras: cabeça suavizada (a câmera não treme com o balanço da animação)
    for (const k of [a, b]) if (k?.anchor && !this.anchorPos.has(k.anchor)) this.anchorPos.set(k.anchor, new THREE.Vector3());
    this.updateAnchors(a.cut && this.t - a.t < 0.05 ? 1 : dt);
    let fov = a.fov;
    this.keyWorld(a, this.ka, this.la);
    if (b && !b.cut && b.t > a.t) {
      const k = ease(Math.min(1, Math.max(0, (this.t - a.t) / (b.t - a.t))));
      this.keyWorld(b, this.kb, this.lb);
      this.camPos.lerpVectors(this.ka, this.kb, k);
      this.camLook.lerpVectors(this.la, this.lb, k);
      fov = a.fov + (b.fov - a.fov) * k;
    } else {
      this.camPos.copy(this.ka);
      this.camLook.copy(this.la);
    }
    this.game.camera.cine = { pos: this.camPos, look: this.camLook, fov, blend: 1 };
  }

  private headOf(ref: string, out: THREE.Vector3): boolean {
    const a = this.actor(ref);
    if (!a) return false;
    a.model.boneWorld('Head', out);
    out.y += 0.06;
    return true;
  }

  private applyLook(): void {
    const def = this.def!;
    // profundidade de campo e luz de borda: último estado com t ≤ agora
    let dof: (typeof def.dof)[number] | null = null;
    for (const d of def.dof) if (d.t <= this.t) dof = d;
    this.dofTarget = dof && dof.on ? dof.target ?? 'marcio' : null;
    if (this.dofTarget && this.headOf(this.dofTarget, _v)) this.game.renderer.setDof(true, _v, dof?.bokeh ?? 2.5);
    else this.game.renderer.setDof(false);
    let rim: (typeof def.rim)[number] | null = null;
    for (const r of def.rim) if (r.t <= this.t) rim = r;
    this.rimTarget = rim && rim.on ? rim.target ?? 'marcio' : null;
    if (this.rimTarget && this.headOf(this.rimTarget, _v)) {
      // atrás da cabeça em relação à câmera: contorno quente no rosto e nos ombros
      _w.copy(_v).sub(this.camPos).setY(0).normalize();
      this.rim.position.copy(_v).addScaledVector(_w, 0.75).add(new THREE.Vector3(0, 0.25, 0));
      this.rim.color.set(rim?.color ?? '#ffb36e');
      this.rim.intensity = rim?.intensity ?? 6;
      this.rim.distance = 3;
    } else this.rim.intensity = 0;
  }

  // ---------- passo fixo: atores andando ----------
  fixedUpdate(dt: number): void {
    if (!this.active) return;
    for (const [a, w] of this.walks) {
      const wp = w.path[w.idx]!;
      const dx = wp.x - a.pos.x, dz = wp.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const step = w.speed * dt;
      if (d <= step) {
        a.scriptMove(wp.x, wp.z);
        w.idx++;
        if (w.idx >= w.path.length) {
          this.walks.delete(a);
          a.model.animator.speed = 0;
          if (w.faceEnd !== undefined) a.yaw = w.faceEnd;
          continue;
        }
      } else {
        a.scriptMove(a.pos.x + (dx / d) * step, a.pos.z + (dz / d) * step);
        const target = Math.atan2(dx, dz);
        let dy = target - a.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        a.yaw += dy * Math.min(1, dt * 8);
      }
      a.model.animator.speed = w.speed;
    }
    // objetos largados caem
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i]!;
      f.vy -= 9.8 * dt;
      f.obj.position.y += f.vy * dt;
      f.obj.rotation.x += f.spin * dt;
      if (f.obj.position.y <= 0.05) {
        f.obj.position.y = 0.05;
        f.obj.rotation.set(Math.PI / 2, f.obj.rotation.y, 0);
        if (f.prop === 'coffee') this.spill(f.obj.position);
        this.falling.splice(i, 1);
      }
    }
  }

  private spill(p: THREE.Vector3): void {
    const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), new THREE.MeshStandardMaterial({ color: 0x3a2412, roughness: 0.12, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(p.x + 0.12, 0.006, p.z + 0.05);
    puddle.scale.set(1.3, 0.8, 1);
    this.game.renderer.scene.add(puddle);
    audio.play('whoosh', 0.3);
  }

  // ---------- por frame (tempo real) ----------
  update(realDt: number): void {
    if (!this.active || !this.def) return;
    this.t += realDt;
    if (!this.skipArmed && this.t >= this.def.skippableAfter) {
      this.skipArmed = true;
      this.overlay.setSkippable(true);
    }
    if (this.skipRequested) {
      this.skip();
      return;
    }
    this.fire(this.t);
    this.applyCamera(realDt);
    this.applyLook();
    this.overlay.update(realDt);
    if (this.t >= this.def.duration) this.finish();
  }

  /** Pula: aplica o que falta (posições finais, grupos visíveis, guarda de luta) e termina. */
  skip(): void {
    if (!this.def) return;
    this.fire(Infinity);
    for (const [a, w] of this.walks) {
      const end = w.path[w.path.length - 1]!;
      a.teleport(end);
      a.model.animator.speed = 0;
      if (w.faceEnd !== undefined) a.yaw = a.prevYaw = w.faceEnd;
    }
    this.walks.clear();
    for (const f of this.falling) {
      f.obj.position.y = 0.05;
      if (f.prop === 'coffee') this.spill(f.obj.position);
    }
    this.falling.length = 0;
    this.finish();
  }

  private finish(): void {
    this.active = false;
    this.overlay.show(false);
    this.game.renderer.setDof(false);
    this.rim.intensity = 0;
    for (const p of this.props.values()) p.removeFromParent();
    this.props.clear();
    this.held.clear();
    for (const e of this.scripted) e.scripted = false;
    this.scripted.clear();
    const pa = this.game.player.actor;
    pa.model.animator.setLocoSet({ idle: 'idleCombat' });
    pa.model.animator.setUpper(null);
    this.anchorPos.clear();
    // a câmera de jogo volta suave para trás do Márcio
    this.game.camera.yaw = pa.yaw - Math.PI;
    this.game.camera.pitch = 0.32;
    this.game.camera.cine = null;
    this.game.player.setCine(false);
    this.game.input.clearBuffer();
    this.game.hud.el.classList.remove('hidden');
    if (this.game.encounters) {
      this.game.encounters.paused = false;
      this.game.encounters.alertIntroGroups();
    }
    this.onEnd?.();
  }
}
