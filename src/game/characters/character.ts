import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Animator } from '../../engine/anim/animator';
import type { AnimLibrary } from '../../engine/anim/animLibrary';

export interface CharacterLook {
  /** Cor principal (roupa) e secundária (juntas/pele) para o manequim provisório. */
  main: THREE.ColorRepresentation;
  joints: THREE.ColorRepresentation;
  scale?: number;
  width?: number;
}

/** Instância visual de um humano: modelo skinned + ossos + animador. Sem regra de jogo. */
export class CharacterModel {
  readonly root = new THREE.Group();
  readonly model: THREE.Object3D;
  readonly bones = new Map<string, THREE.Bone>();
  readonly animator: Animator;
  readonly meshes: THREE.SkinnedMesh[] = [];
  private flashMats: THREE.MeshStandardMaterial[] = [];
  private flashT = 0;

  constructor(gltf: GLTF, lib: AnimLibrary, look: CharacterLook, idle = 'idle') {
    this.model = skeletonClone(gltf.scene);
    const s = look.scale ?? 1;
    this.model.scale.set(s * (look.width ?? 1), s, s * (look.width ?? 1));
    this.root.add(this.model);
    this.model.traverse((o) => {
      if ((o as THREE.Bone).isBone) this.bones.set(o.name, o as THREE.Bone);
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false; // bounds do skinned mesh não acompanham a animação
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const newMats = mats.map((mat) => {
          const src = mat as THREE.MeshStandardMaterial;
          const isJoint = /joint/i.test(src.name);
          const nm = new THREE.MeshStandardMaterial({
            name: src.name,
            color: isJoint ? look.joints : look.main,
            roughness: isJoint ? 0.35 : 0.6,
            metalness: isJoint ? 0.4 : 0.05,
            emissive: new THREE.Color(0, 0, 0),
          });
          this.flashMats.push(nm);
          return nm;
        });
        m.material = Array.isArray(m.material) ? newMats : newMats[0]!;
        this.meshes.push(m);
      }
    });
    this.animator = new Animator(this.model, lib, idle);
  }

  bone(name: string): THREE.Bone | undefined {
    return this.bones.get(name);
  }

  /** Posição de mundo de um osso (para hitboxes, VFX). */
  boneWorld(name: string, out: THREE.Vector3): THREE.Vector3 {
    const b = this.bones.get(name);
    if (b) b.getWorldPosition(out);
    else this.root.getWorldPosition(out);
    return out;
  }

  /** Flash de acerto no material (feedback de impacto). */
  flash(intensity = 1): void {
    this.flashT = 0.12 * intensity;
  }

  update(dt: number): void {
    this.animator.update(dt);
    this.updateFlash(dt);
  }

  /** Decaimento do flash de acerto (também usado em corpos, sem animador). */
  updateFlash(dt: number): void {
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / 0.12);
      for (const m of this.flashMats) m.emissive.setRGB(k * 1.2, k * 0.25, k * 0.2);
      if (this.flashT <= 0) for (const m of this.flashMats) m.emissive.setRGB(0, 0, 0);
    }
  }

  setVisible(v: boolean): void {
    this.root.visible = v;
  }
}
