import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import clipmapJson from '../../../data/anim/clipmap.json';

/** Metadado medido no retarget (tools/blender/retarget_mixamo.py → public/assets/anims/mixamo_meta.json). */
export interface ClipMeta {
  duration: number;
  loop: boolean;
  speed: number;
  hit?: Record<string, { t: number; reach: number }>;
  endsLying?: boolean;
}

const CLIPMAP = (clipmapJson as { clips: Record<string, string[]> }).clips;
const LOCO_FALLBACK = (clipmapJson as { locoSpeedFallback: Record<string, number> }).locoSpeedFallback;

/** Compatibilidade: velocidades padrão (substituídas pelo metadado medido quando existe). */
export const LOCO_SPEED: Record<string, number> = { ...LOCO_FALLBACK };

/**
 * Biblioteca de clipes compartilhada por todos os humanos (esqueleto único estilo UE).
 * Nome canônico → primeiro clipe existente da lista em data/anim/clipmap.json. Clipes Mixamo também ficam
 * disponíveis pelo próprio nome (mx_*). Translação horizontal da pelve é removida (o deslocamento vem do
 * controlador: warp, knockback, esquiva); a altura da pelve fica (agachar, cair, deitar).
 */
export class AnimLibrary {
  readonly clips = new Map<string, THREE.AnimationClip>();
  readonly sourceOf = new Map<string, string>();
  readonly meta = new Map<string, ClipMeta>();
  /** velocidade nativa (m/s) de cada clipe de locomoção, para sincronizar a cadência dos pés */
  locoSpeed: Record<string, number> = { ...LOCO_FALLBACK };
  restPelvis: THREE.Vector3 | null = null;
  private derived = new Map<string, AnimLibrary>();

  addFromGltf(gltf: GLTF, metaJson?: Record<string, ClipMeta>): void {
    const byName = new Map(gltf.animations.map((c) => [c.name.replace(/_Armature$/, ''), c]));
    const pel = gltf.scene.getObjectByName('pelvis');
    if (pel && !this.restPelvis) this.restPelvis = pel.position.clone();
    for (const [canon, list] of Object.entries(CLIPMAP)) {
      const src = list.find((n) => byName.has(n));
      if (!src) continue;
      this.clips.set(canon, sanitize(byName.get(src)!.clone(), canon, src.startsWith('mx_')));
      this.sourceOf.set(canon, src);
      const m = metaJson?.[src];
      if (m) this.meta.set(canon, m);
    }
    for (const [name, c] of byName) {
      if (!name.startsWith('mx_') || this.clips.has(name)) continue;
      this.clips.set(name, sanitize(c.clone(), name, true));
      const m = metaJson?.[name];
      if (m) this.meta.set(name, m);
    }
    // velocidades medidas (só valem se o clipe original andava de verdade)
    for (const slot of Object.keys(LOCO_FALLBACK)) {
      const m = this.meta.get(slot);
      if (m && m.speed > 0.3) this.locoSpeed[slot] = m.speed;
    }
  }

  get(name: string): THREE.AnimationClip {
    const c = this.clips.get(name);
    if (!c) throw new Error(`Clip não encontrado: ${name}`);
    return c;
  }

  has(name: string): boolean {
    return this.clips.has(name);
  }

  /** Subclipe por tempo (s). */
  derive(name: string, from: string, start: number, end: number): void {
    const src = this.get(from);
    const fps = 30;
    this.clips.set(name, THREE.AnimationUtils.subclip(src, name, Math.round(start * fps), Math.round(end * fps), fps));
  }

  /**
   * Clipes ajustados a outro esqueleto (mesmas rotações de repouso, juntas em outro lugar): desloca a trilha da
   * pelve pela diferença de posição de repouso — senão personagens mais altos/baixos flutuam ou afundam.
   */
  derivedFor(modelRestPelvis: THREE.Vector3): AnimLibrary {
    if (!this.restPelvis) return this;
    const d = modelRestPelvis.clone().sub(this.restPelvis);
    if (d.lengthSq() < 1e-6) return this;
    const key = `${d.x.toFixed(3)},${d.y.toFixed(3)},${d.z.toFixed(3)}`;
    let lib = this.derived.get(key);
    if (lib) return lib;
    lib = new AnimLibrary();
    lib.restPelvis = modelRestPelvis.clone();
    lib.locoSpeed = this.locoSpeed;
    for (const [k, v] of this.meta) lib.meta.set(k, v);
    for (const [k, v] of this.sourceOf) lib.sourceOf.set(k, v);
    for (const [name, clip] of this.clips) {
      const tracks = clip.tracks.map((t) => {
        if (t.name !== 'pelvis.position') return t;
        const c = t.clone();
        const v = c.values;
        for (let i = 0; i < v.length; i += 3) {
          v[i] = v[i]! + d.x;
          v[i + 1] = v[i + 1]! + d.y;
          v[i + 2] = v[i + 2]! + d.z;
        }
        return c;
      });
      lib.clips.set(name, new THREE.AnimationClip(name, clip.duration, tracks));
    }
    this.derived.set(key, lib);
    return lib;
  }
}

function sanitize(clip: THREE.AnimationClip, name: string, mixamo: boolean): THREE.AnimationClip {
  clip.name = name;
  clip.tracks = clip.tracks.filter((t) => {
    if (t.name.endsWith('.scale')) return false;
    if (t.name.endsWith('.position')) return t.name.startsWith('pelvis.');
    return true;
  });
  // No espaço do osso root (Z para cima, estilo UE): x/y = plano do chão, z = altura.
  const keep = mixamo ? 0 : 0.35;
  for (const t of clip.tracks) {
    if (t.name === 'pelvis.position') {
      const v = t.values;
      const x0 = v[0]!;
      const y0 = v[1]!;
      for (let i = 0; i < v.length; i += 3) {
        v[i] = x0 + (v[i]! - x0) * keep;
        v[i + 1] = y0 + (v[i + 1]! - y0) * keep;
      }
    }
  }
  clip.resetDuration();
  return clip;
}
