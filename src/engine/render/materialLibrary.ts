import * as THREE from 'three';
import { Rng } from '../../core/rng';

/**
 * Biblioteca de materiais por NOME (vindo do Blender): troca os materiais básicos do glTF por versões
 * com detalhe procedural gerado no navegador (zero download): malha de polo, sarja de jeans, íris, barba/cabelo
 * com transparência nas bordas (cor de vértice), pele com variação.
 */
const texCache = new Map<string, THREE.Texture>();

function canvasTex(key: string, size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, srgb = true, repeat = 1): THREE.Texture {
  let t = texCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d')!, size);
    t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  t.repeat.set(repeat, repeat);
  return t;
}

/** Normal map de tecido a partir de uma função de altura. */
function heightToNormal(key: string, size: number, h: (x: number, y: number) => number, strength: number): THREE.Texture {
  return canvasTex(key, size, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const H = new Float32Array(s * s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) H[y * s + x] = h(x, y);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const l = H[y * s + ((x - 1 + s) % s)]!;
        const r = H[y * s + ((x + 1) % s)]!;
        const u = H[((y - 1 + s) % s) * s + x]!;
        const d = H[((y + 1) % s) * s + x]!;
        let nx = (l - r) * strength;
        let ny = (u - d) * strength;
        const nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        const i = (y * s + x) * 4;
        img.data[i] = (nx * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz / len) * 0.5 * 255 + 127;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, false);
}

const knitNormal = () =>
  heightToNormal('knit', 128, (x, y) => {
    // malha piquê da polo: favos pequenos
    const cx = (x % 8) - 4;
    const cy = (y % 8) - 4 + ((Math.floor(x / 8) % 2) * 4);
    return Math.max(0, 1 - Math.hypot(cx, ((cy + 8) % 8) - 4) / 4);
  }, 2.2);

const denimNormal = () =>
  heightToNormal('denim', 128, (x, y) => {
    // sarja diagonal 3x1
    const d = (x + y) % 6;
    return d < 4 ? 1 : 0;
  }, 1.4);

function denimColor(base: THREE.Color): THREE.Texture {
  return canvasTex('denimC' + base.getHexString(), 256, (ctx, s) => {
    const img = ctx.createImageData(s, s);
    const rng = new Rng(9);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const twill = ((x + y) % 4 < 2 ? 1.06 : 0.94) * (0.9 + rng.next() * 0.2);
        const fade = 1 + Math.sin(y * 0.05) * 0.04;
        const i = (y * s + x) * 4;
        img.data[i] = Math.min(255, base.r * 255 * twill * fade * 1.1);
        img.data[i + 1] = Math.min(255, base.g * 255 * twill * fade * 1.05);
        img.data[i + 2] = Math.min(255, base.b * 255 * twill * fade);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

function irisTexture(iris: string): THREE.Texture {
  return canvasTex('iris' + iris, 256, (ctx, s) => {
    ctx.fillStyle = '#ece6de';
    ctx.fillRect(0, 0, s, s);
    // veias suaves nas bordas
    const g0 = ctx.createRadialGradient(s / 2, s / 2, s * 0.25, s / 2, s / 2, s * 0.6);
    g0.addColorStop(0, 'rgba(255,255,255,0)');
    g0.addColorStop(1, 'rgba(190,120,110,0.35)');
    ctx.fillStyle = g0;
    ctx.fillRect(0, 0, s, s);
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.02, s / 2, s / 2, s * 0.17);
    g.addColorStop(0, '#000');
    g.addColorStop(0.32, '#000');
    g.addColorStop(0.36, iris);
    g.addColorStop(0.85, '#2a1508');
    g.addColorStop(1, '#120a05');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s / 2, s / 2, s * 0.17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.arc(s * 0.46, s * 0.45, s * 0.025, 0, Math.PI * 2);
    ctx.fill();
  });
}

function strandsTexture(): THREE.Texture {
  return canvasTex('strands', 256, (ctx, s) => {
    const rng = new Rng(4);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      const x = rng.next() * s;
      const y = rng.next() * s;
      const l = 6 + rng.next() * 14;
      const v = Math.floor(90 + rng.next() * 140);
      ctx.strokeStyle = `rgb(${v},${v},${v})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng.next() - 0.5) * 3, y + l);
      ctx.stroke();
    }
  }, true, 6);
}

/** Fios curtos e finos (corte rente / barba): pouco contraste, para virar textura de pelo e não "cabelo molhado". */
function fineStrandsTexture(): THREE.Texture {
  return canvasTex('fineStrands', 256, (ctx, s) => {
    const rng = new Rng(11);
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5200; i++) {
      const x = rng.next() * s;
      const y = rng.next() * s;
      const l = 2 + rng.next() * 5;
      const v = Math.floor(110 + rng.next() * 110);
      ctx.strokeStyle = `rgb(${v},${v},${v})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng.next() - 0.5) * 2.5, y + l);
      ctx.stroke();
    }
  }, true, 10);
}

/** Recentraliza a UV do olho para a íris cair no meio da malha do olho (helpers do MPFB). */
function centerEyeUv(mesh: THREE.Mesh): void {
  const uv = mesh.geometry.getAttribute('uv') as THREE.BufferAttribute | undefined;
  const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  if (!pos) return;
  // projeção planar frontal (o olho olha para +Z no espaço do modelo glTF)
  const box = new THREE.Box3().setFromBufferAttribute(pos);
  const size = box.getSize(new THREE.Vector3());
  const out = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    out[i * 2] = (pos.getX(i) - box.min.x) / size.x;
    out[i * 2 + 1] = (pos.getY(i) - box.min.y) / size.y;
  }
  if (uv) mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(out, 2));
  else mesh.geometry.setAttribute('uv', new THREE.BufferAttribute(out, 2));
}

export interface MaterialOverrides {
  iris?: string;
  /** cor por nome de material (variação por instância de inimigos/civis) */
  tint?: Record<string, string>;
  /** foto do rosto projetada (UV 'FaceProj' = uv1, máscara = alfa da cor de vértice) */
  faceMap?: THREE.Texture;
}

const ribNormal = () =>
  heightToNormal('rib', 64, (x) => (x % 4 < 2 ? 1 : 0), 1.2);
const twillNormal = () =>
  heightToNormal('twill', 64, (x, y) => ((x + y * 2) % 8 < 4 ? 1 : 0), 0.9);

/** Cinza da barba/têmporas no fallback (onde a foto não vê: nuca, embaixo do queixo). */
const PELT_GREY = new THREE.Color('#8a8582');

/**
 * Cabelo/barba do rosto v2 (casca com a foto): cor de vértice R = peso da cor da foto (de frente), G = alfa de borda,
 * B = grisalho do fallback, A = peso do recorte da foto. A foto traz no alfa a máscara de pelo → a linha do cabelo, as entradas e o desenho da
 * barba saem exatamente da foto; onde a foto não vê, cor-base amostrada da foto com fios procedurais.
 */
function peltPhotoMaterial(name: string, color: THREE.Color, faceMap: THREE.Texture, g: THREE.BufferGeometry, roughness: number): THREE.MeshStandardMaterial {
  if (!g.getAttribute('faceUv')) g.setAttribute('faceUv', g.getAttribute('uv1'));
  const m = new THREE.MeshStandardMaterial({ name, color, roughness, metalness: 0, vertexColors: true, map: fineStrandsTexture(), alphaHash: true, side: THREE.DoubleSide, envMapIntensity: 0.12 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.faceMap = { value: faceMap };
    sh.uniforms.peltGrey = { value: PELT_GREY };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 faceUv; varying vec2 vFaceUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFaceUv = faceUv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D faceMap; uniform vec3 peltGrey; varying vec2 vFaceUv;')
      .replace(
        '#include <color_fragment>',
        `vec4 ph = texture2D(faceMap, vFaceUv);
        float pw = clamp(vColor.r, 0.0, 1.0);
        // variação dos fios normalizada pela média da textura (~0,36 linear): não escurece o tom-base
        float detail = clamp(diffuseColor.r / max(diffuse.r, 1e-3) / 0.36, 0.55, 1.5);
        vec3 fb = mix(diffuse, peltGrey, clamp(vColor.b, 0.0, 1.0)) * detail;
        diffuseColor.rgb = mix(fb, ph.rgb * mix(1.0, detail, 0.25), pw);
        // o recorte (linha do cabelo, entradas, desenho da barba) obedece a foto assim que ela enxerga o ponto
        diffuseColor.a = clamp(vColor.g, 0.0, 1.0) * mix(1.0, ph.a, clamp(vColor.a, 0.0, 1.0));`,
      );
  };
  m.customProgramCacheKey = () => 'pelt-photo';
  return m;
}

export function applyMaterialLibrary(root: THREE.Object3D, opts: MaterialOverrides = {}): THREE.MeshStandardMaterial[] {
  const created: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const name = src.name || '';
    const color = src.color ? src.color.clone() : new THREE.Color(0.5, 0.5, 0.5);
    const t = opts.tint?.[name];
    if (t) color.set(t);
    let m: THREE.MeshStandardMaterial;
    switch (name) {
      case 'M_Skin': {
        const phys = new THREE.MeshPhysicalMaterial({ name, color, roughness: 0.62, sheen: 0.25, sheenColor: new THREE.Color(0.9, 0.5, 0.4), sheenRoughness: 0.6 });
        const g = mesh.geometry;
        if (opts.faceMap && g.getAttribute('uv1') && g.getAttribute('color')) {
          // rosto projetado (técnica WWE 2K-lite): foto misturada à pele pela máscara por vértice
          if (!g.getAttribute('faceUv')) {
            g.setAttribute('faceUv', g.getAttribute('uv1'));
            const col = g.getAttribute('color') as THREE.BufferAttribute;
            const m = new Float32Array(col.count);
            for (let i = 0; i < col.count; i++) m[i] = col.itemSize === 4 ? col.getW(i) : 0;
            g.setAttribute('faceMask', new THREE.BufferAttribute(m, 1));
          }
          const faceMap = opts.faceMap;
          phys.onBeforeCompile = (sh) => {
            sh.uniforms.faceMap = { value: faceMap };
            sh.vertexShader = sh.vertexShader
              .replace('#include <common>', '#include <common>\nattribute vec2 faceUv; attribute float faceMask; varying vec2 vFaceUv; varying float vFaceMask;')
              .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFaceUv = faceUv; vFaceMask = faceMask;');
            sh.fragmentShader = sh.fragmentShader
              .replace('#include <common>', '#include <common>\nuniform sampler2D faceMap; varying vec2 vFaceUv; varying float vFaceMask;')
              // a foto já traz sombreamento: um pouco de "luz própria" na área da foto evita sombra dupla (olheira/queixo pretos)
              .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 faceC = texture2D(faceMap, vFaceUv);\nfloat fm = clamp(vFaceMask, 0.0, 1.0);\ndiffuseColor.rgb = mix(diffuseColor.rgb, faceC.rgb, fm);\ntotalEmissiveRadiance += faceC.rgb * fm * 0.14;');
          };
          phys.customProgramCacheKey = () => 'skin-face';
        }
        m = phys;
        break;
      }
      case 'M_Lips':
        m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.42 });
        break;
      case 'M_Tank':
        m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.92, normalMap: ribNormal(), normalScale: new THREE.Vector2(0.6, 0.6) });
        (m.normalMap as THREE.Texture).repeat.set(40, 40);
        break;
      case 'M_Pants':
        m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.9, normalMap: twillNormal(), normalScale: new THREE.Vector2(0.45, 0.45) });
        (m.normalMap as THREE.Texture).repeat.set(30, 30);
        break;
      case 'M_Polo':
      case 'M_Shirt':
        m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.9, normalMap: knitNormal(), normalScale: new THREE.Vector2(0.45, 0.45) });
        (m.normalMap as THREE.Texture).repeat.set(70, 70);
        break;
      case 'M_Jeans':
        m = new THREE.MeshStandardMaterial({ name, color: 0xffffff, map: denimColor(color), roughness: 0.88, normalMap: denimNormal(), normalScale: new THREE.Vector2(0.5, 0.5) });
        (m.map as THREE.Texture).repeat.set(10, 10);
        (m.normalMap as THREE.Texture).repeat.set(24, 24);
        break;
      case 'M_Shoes':
        m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.55 });
        break;
      case 'M_Hair':
      case 'M_Beard': {
        const g = mesh.geometry;
        if (opts.faceMap && g.getAttribute('uv1') && g.getAttribute('color')) {
          m = peltPhotoMaterial(name, color, opts.faceMap, g, name === 'M_Hair' ? 0.86 : 0.88);
          break;
        }
        m = name === 'M_Hair'
          ? new THREE.MeshStandardMaterial({ name, color, roughness: 0.72, metalness: 0, vertexColors: true, transparent: true, alphaTest: 0.02, map: strandsTexture(), envMapIntensity: 0.35 })
          : new THREE.MeshStandardMaterial({ name, color, roughness: 0.75, vertexColors: true, transparent: true, alphaTest: 0.12, map: strandsTexture() });
        break;
      }
      case 'M_Eye':
        if (opts.faceMap && mesh.geometry.getAttribute('uv1')) {
          // olho com a foto projetada (mesma UV do rosto): íris/esclera exatamente como na referência
          const fm = opts.faceMap.clone();
          fm.channel = 1;
          fm.needsUpdate = true;
          // reflexo discreto (o clearcoat forte espelhava a cidade e deixava a íris cinza-azulada) + um pouco de luz própria
          m = new THREE.MeshPhysicalMaterial({ name, color: 0xffffff, map: fm, roughness: 0.25, clearcoat: 0.45, clearcoatRoughness: 0.12, envMapIntensity: 0.25, emissive: 0xffffff, emissiveMap: fm, emissiveIntensity: 0.16 });
        } else {
          centerEyeUv(mesh);
          m = new THREE.MeshPhysicalMaterial({ name, color: 0xffffff, map: irisTexture(opts.iris ?? '#5a3a1e'), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 });
        }
        break;
      case 'M_Lash':
        m = new THREE.MeshStandardMaterial({ name, color: 0x120d0a, roughness: 0.7 });
        break;
      default:
        m = new THREE.MeshStandardMaterial({ name, color, roughness: src.roughness ?? 0.6, metalness: src.metalness ?? 0 });
    }
    mesh.material = m;
    created.push(m);
  });
  return created;
}
