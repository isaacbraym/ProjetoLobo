import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Biblioteca de clipes compartilhada por todos os humanos (esqueleto único estilo UE).
 * Nomes canônicos → clipe-fonte. Trilhas de translação são removidas (exceto pelve, em Y) para que
 * todo clipe fique "no lugar"; o deslocamento vem do controlador (com warp no combate).
 */
export const CLIP_SOURCES: Record<string, string> = {
  idle: 'Idle_Loop',
  idleCombat: 'Sword_Idle',
  walk: 'Walk_Loop',
  jog: 'Jog_Fwd_Loop',
  sprint: 'Sprint_Loop',
  jab: 'Punch_Jab',
  cross: 'Punch_Cross',
  heavySlam: 'Sword_Attack',
  roll: 'Roll',
  hitChest: 'Hit_Chest',
  hitHead: 'Hit_Head',
  death: 'Death01',
  pickup: 'PickUp_Table',
  push: 'Push_Loop',
  crouchIdle: 'Crouch_Idle_Loop',
  interact: 'Interact',
  talk: 'Idle_Talking_Loop',
  sitIdle: 'Sitting_Idle_Loop',
  jumpStart: 'Jump_Start',
  jumpLoop: 'Jump_Loop',
  jumpLand: 'Jump_Land',
  dance: 'Dance_Loop',
  fixKneel: 'Fixing_Kneeling',
};

/** Velocidade de deslocamento nativa de cada clipe de locomoção (m/s), para sincronizar a cadência dos pés. */
export const LOCO_SPEED: Record<string, number> = { walk: 1.25, jog: 3.4, sprint: 5.6 };

export class AnimLibrary {
  readonly clips = new Map<string, THREE.AnimationClip>();

  addFromGltf(gltf: GLTF, sources: Record<string, string> = CLIP_SOURCES): void {
    const byName = new Map(gltf.animations.map((c) => [c.name, c]));
    for (const [canon, src] of Object.entries(sources)) {
      const c = byName.get(src);
      if (!c) continue;
      this.clips.set(canon, sanitize(c.clone(), canon));
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

  /** Subclipe por tempo (s), usado para recortar recuperação longa de golpes. */
  derive(name: string, from: string, start: number, end: number): void {
    const src = this.get(from);
    const fps = 30;
    const c = THREE.AnimationUtils.subclip(src, name, Math.round(start * fps), Math.round(end * fps), fps);
    this.clips.set(name, c);
  }
}

function sanitize(clip: THREE.AnimationClip, name: string): THREE.AnimationClip {
  clip.name = name;
  clip.tracks = clip.tracks.filter((t) => {
    if (t.name.endsWith('.scale')) return false;
    if (t.name.endsWith('.position')) return t.name.startsWith('pelvis.');
    return true;
  });
  // pelve: mantém só o movimento vertical/lateral relativo (remove deriva horizontal no plano do chão)
  for (const t of clip.tracks) {
    if (t.name === 'pelvis.position') {
      const v = t.values;
      const x0 = v[0]!;
      const y0 = v[1]!;
      for (let i = 0; i < v.length; i += 3) {
        // No espaço do root (Z-up estilo UE): x/y = plano do chão, z = altura.
        v[i] = x0 + (v[i]! - x0) * 0.35;
        v[i + 1] = y0 + (v[i + 1]! - y0) * 0.35;
      }
    }
  }
  clip.resetDuration();
  return clip;
}
