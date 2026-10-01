import * as THREE from 'three';
import type { CharacterModel } from '../characters/character';
import wolfJson from '../../../data/werewolf.json';
import { Rng } from '../../core/rng';

const W = wolfJson.body;

/**
 * Visual do Lobisomem Márcio sobre a malha do Márcio (v1, sem morph targets ainda):
 * escala de ossos (braços/mãos/peito/pescoço), postura curvada, pelo em cascas (shells) no corpo,
 * garras e orelhas que crescem, olhos âmbar. Tudo dirigido por `amount` (0 → 1).
 */
export class WolfVisual {
  amount = 0;
  private shells: THREE.SkinnedMesh[] = [];
  private shellMats: THREE.ShaderMaterial[] = [];
  private claws: THREE.Mesh[] = [];
  private ears: THREE.Mesh[] = [];
  private eyeMats: THREE.MeshStandardMaterial[] = [];
  private skinMats: THREE.MeshStandardMaterial[] = [];
  private skinBase = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private furColor = new THREE.Color(W.furColor);
  private tmpQ = new THREE.Quaternion();
  private axisX = new THREE.Vector3(1, 0, 0);

  constructor(private model: CharacterModel) {
    const body = model.meshes.find((m) => m.name === 'Body') ?? model.meshes[0];
    if (body) this.buildFur(body);
    this.buildClaws();
    this.buildEars();
    model.model.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m || !(o as THREE.Mesh).isMesh) return;
      if (m.name === 'M_Eye') this.eyeMats.push(m);
      if (m.name === 'M_Skin') {
        this.skinMats.push(m);
        this.skinBase.set(m, m.color.clone());
      }
    });
    this.apply(0);
  }

  private buildFur(body: THREE.SkinnedMesh): void {
    const tex = furNoise();
    const n = W.furShells;
    // centro da cabeça no espaço de bind (topo da malha − 11 cm): o pelo evita o rosto do Márcio
    body.geometry.computeBoundingBox();
    const bb = body.geometry.boundingBox!;
    const head = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y - 0.11, (bb.min.z + bb.max.z) / 2);
    for (let i = 1; i <= n; i++) {
      const h = i / n;
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uNoise: { value: tex },
          uLen: { value: 0 },
          uH: { value: h },
          uColor: { value: new THREE.Color(W.furColor) },
          uTip: { value: new THREE.Color(W.furTip) },
          uAmount: { value: 0 },
          uHead: { value: head },
        },
        vertexShader: /* glsl */ `
          #include <common>
          #include <skinning_pars_vertex>
          uniform float uLen; uniform float uH; uniform vec3 uHead;
          varying vec2 vUv; varying float vMask; varying vec3 vN;
          void main() {
            #include <skinbase_vertex>
            #include <beginnormal_vertex>
            #include <skinnormal_vertex>
            vec3 transformed = vec3(position);
            // pelo só abaixo da cabeça (braços, mãos, pescoço, peito) — o rosto do Márcio fica visível
            vMask = smoothstep(0.12, 0.2, distance(position, uHead));
            transformed += normalize(objectNormal) * uLen * uH * vMask;
            #include <skinning_vertex>
            vUv = uv;
            vN = normalize(normalMatrix * objectNormal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform sampler2D uNoise; uniform float uH; uniform vec3 uColor; uniform vec3 uTip; uniform float uAmount;
          varying vec2 vUv; varying float vMask; varying vec3 vN;
          void main() {
            float n = texture2D(uNoise, vUv * 38.0).r;
            if (vMask < 0.05 || n < uH * 0.95 + (1.0 - uAmount) * 1.2) discard;
            float light = 0.45 + 0.55 * max(0.0, dot(vN, normalize(vec3(0.3, 0.8, 0.5))));
            vec3 c = mix(uColor, uTip, uH) * light * (0.55 + 0.45 * uH);
            gl_FragColor = vec4(c, 1.0);
            #include <colorspace_fragment>
          }`,
        side: THREE.FrontSide,
      });
      const shell = new THREE.SkinnedMesh(body.geometry, mat);
      shell.bind(body.skeleton, body.bindMatrix);
      shell.frustumCulled = false;
      shell.visible = false;
      shell.renderOrder = 2;
      body.parent!.add(shell);
      this.shells.push(shell);
      this.shellMats.push(mat);
    }
  }

  private buildClaws(): void {
    const geo = new THREE.ConeGeometry(0.009, 0.05, 6).rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.35 });
    for (const side of ['l', 'r']) {
      for (const f of ['index', 'middle', 'ring', 'pinky', 'thumb']) {
        const bone = this.model.bone(`${f}_03_${side}`);
        if (!bone) continue;
        const c = new THREE.Mesh(geo, mat);
        // a ponta do dedo fica ao longo do eixo do osso; posiciona na ponta e aponta para fora
        c.position.set(0, 0.03, 0);
        c.rotation.set(-Math.PI / 2, 0, 0);
        c.scale.setScalar(0.001);
        bone.add(c);
        this.claws.push(c);
      }
    }
  }

  private buildEars(): void {
    const head = this.model.bone('Head');
    if (!head) return;
    const geo = new THREE.ConeGeometry(0.035, 0.11, 8);
    const mat = new THREE.MeshStandardMaterial({ color: W.furColor, roughness: 0.95 });
    for (const sx of [-1, 1]) {
      const e = new THREE.Mesh(geo, mat);
      e.position.set(sx * 0.075, 0.12, -0.01);
      e.rotation.set(0, 0, -sx * 0.35);
      e.scale.setScalar(0.001);
      head.add(e);
      this.ears.push(e);
    }
  }

  /** Aplica o estado visual (chamar DEPOIS do mixer em cada frame). */
  apply(a: number): void {
    this.amount = a;
    const k = a * a * (3 - 2 * a);
    for (const [name, s] of Object.entries(W.boneScale)) {
      const b = this.model.bone(name);
      if (b) b.scale.setScalar(1 + (s - 1) * k);
    }
    // postura curvada (aditiva sobre a animação)
    const sp = this.model.bone('spine_02');
    if (sp && k > 0.001) {
      this.tmpQ.setFromAxisAngle(this.axisX, THREE.MathUtils.degToRad(W.hunchDeg) * k);
      sp.quaternion.multiply(this.tmpQ);
    }
    const furOn = k > 0.01;
    for (const sh of this.shells) sh.visible = furOn;
    for (const m of this.shellMats) {
      m.uniforms.uLen!.value = W.furLength * k;
      m.uniforms.uAmount!.value = k;
    }
    const cs = Math.max(0.001, Math.min(1, (k - 0.3) / 0.6));
    for (const c of this.claws) c.scale.setScalar(cs);
    const es = Math.max(0.001, Math.min(1, (k - 0.15) / 0.7));
    for (const e of this.ears) e.scale.setScalar(es);
    for (const m of this.eyeMats) {
      m.emissive.set(W.eyeColor);
      m.emissiveIntensity = k * 1.6;
    }
    for (const m of this.skinMats) m.color.copy(this.skinBase.get(m)!).lerp(this.furColor, k * 0.55);
  }
}

function furNoise(): THREE.Texture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(s, s);
  const r = new Rng(77);
  for (let i = 0; i < s * s; i++) {
    const v = Math.pow(r.next(), 0.7) * 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}
