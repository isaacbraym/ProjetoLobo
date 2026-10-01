import * as THREE from 'three';

/**
 * Autoria de animação por poses-chave em ESPAÇO DO PERSONAGEM (Y para cima, frente = +Z, direita = −X).
 * Cada chave aplica rotações eixo-ângulo a ossos sobre uma pose-base amostrada de outro clipe.
 * Ossos são processados de pai para filho; filhos herdam a rotação do pai (como numa marionete).
 * Usado para golpes que não existem nas bibliotecas livres (gancho, uppercut, chute), finalizações etc.
 */
export interface PoseKey {
  t: number;
  /** osso → [eixoX, eixoY, eixoZ, graus] em espaço do personagem. */
  rot?: Record<string, [number, number, number, number]>;
  /** deslocamento da pelve em metros (espaço do personagem). */
  pelvis?: [number, number, number];
}

export interface AuthoredClipDef {
  base: string;
  baseTime: number;
  duration: number;
  keys: PoseKey[];
}

const _q = new THREE.Quaternion();
const _qa = new THREE.Quaternion();
const _v = new THREE.Vector3();

export function authorClip(name: string, model: THREE.Object3D, baseClip: THREE.AnimationClip, def: AuthoredClipDef): THREE.AnimationClip {
  // 1) pose-base: aplica o clipe-base no tempo pedido
  const mixer = new THREE.AnimationMixer(model);
  const act = mixer.clipAction(baseClip);
  act.play();
  act.time = def.baseTime;
  mixer.update(0);
  model.updateMatrixWorld(true);

  const bones: THREE.Bone[] = [];
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  }); // traverse = ordem pai→filho
  const baseLocal = new Map<THREE.Bone, THREE.Quaternion>();
  for (const b of bones) baseLocal.set(b, b.quaternion.clone());
  const pelvis = bones.find((b) => b.name === 'pelvis');
  const basePelvisPos = pelvis ? pelvis.position.clone() : new THREE.Vector3();
  // rotação de mundo do pai da pelve (para converter deslocamento do personagem em local)
  const pelvisParentWorld = new THREE.Quaternion();
  pelvis?.parent?.getWorldQuaternion(pelvisParentWorld);
  const pelvisParentScale = new THREE.Vector3(1, 1, 1);
  pelvis?.parent?.getWorldScale(pelvisParentScale);

  const rootWorld = new THREE.Quaternion();
  model.getWorldQuaternion(rootWorld);

  const times = def.keys.map((k) => k.t);
  const valuesByBone = new Map<THREE.Bone, number[]>();
  for (const b of bones) valuesByBone.set(b, []);
  const pelvisValues: number[] = [];

  for (const key of def.keys) {
    // começa da base
    const local = new Map<THREE.Bone, THREE.Quaternion>();
    for (const b of bones) local.set(b, baseLocal.get(b)!.clone());
    const world = new Map<THREE.Bone, THREE.Quaternion>();
    const parentWorld = (b: THREE.Bone): THREE.Quaternion => {
      const p = b.parent;
      if (p && (p as THREE.Bone).isBone && world.has(p as THREE.Bone)) return world.get(p as THREE.Bone)!;
      const q = new THREE.Quaternion();
      p?.getWorldQuaternion(q); // ancestral não-osso (Armature): rotação fixa
      return q;
    };
    for (const b of bones) {
      const pw = parentWorld(b);
      const w = pw.clone().multiply(local.get(b)!);
      const r = key.rot?.[b.name];
      if (r) {
        _v.set(r[0], r[1], r[2]).normalize();
        _qa.setFromAxisAngle(_v, THREE.MathUtils.degToRad(r[3]));
        w.premultiply(_qa);
        // novo local = pw⁻¹ · w
        _q.copy(pw).invert().multiply(w);
        local.set(b, _q.clone());
      }
      world.set(b, w);
    }
    for (const b of bones) {
      const q = local.get(b)!;
      valuesByBone.get(b)!.push(q.x, q.y, q.z, q.w);
    }
    if (pelvis) {
      const off = key.pelvis ?? [0, 0, 0];
      // converte deslocamento do espaço do personagem para o espaço local do pai da pelve
      _v.set(off[0], off[1], off[2]).applyQuaternion(_q.copy(pelvisParentWorld).invert());
      _v.divide(pelvisParentScale);
      pelvisValues.push(basePelvisPos.x + _v.x, basePelvisPos.y + _v.y, basePelvisPos.z + _v.z);
    }
  }

  const tracks: THREE.KeyframeTrack[] = [];
  for (const b of bones) tracks.push(new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, valuesByBone.get(b)!));
  if (pelvis) tracks.push(new THREE.VectorKeyframeTrack('pelvis.position', times, pelvisValues));
  act.stop();
  mixer.uncacheRoot(model);
  // restaura a pose-base para não deixar o modelo de referência alterado
  for (const b of bones) b.quaternion.copy(baseLocal.get(b)!);
  if (pelvis) pelvis.position.copy(basePelvisPos);
  return new THREE.AnimationClip(name, def.duration, tracks);
}
