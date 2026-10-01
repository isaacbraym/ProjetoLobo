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
}

export function applyMaterialLibrary(root: THREE.Object3D, opts: MaterialOverrides = {}): THREE.MeshStandardMaterial[] {
  const created: THREE.MeshStandardMaterial[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const name = src.name || '';
    const color = src.color ? src.color.clone() : new THREE.Color(0.5, 0.5, 0.5);
    let m: THREE.MeshStandardMaterial;
    switch (name) {
      case 'M_Skin':
        m = new THREE.MeshPhysicalMaterial({ name, color, roughness: 0.62, sheen: 0.25, sheenColor: new THREE.Color(0.9, 0.5, 0.4), sheenRoughness: 0.6 });
        break;
      case 'M_Lips':
        m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.42 });
        break;
      case 'M_Polo':
      case 'M_Shirt':
        m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.9, normalMap: knitNormal(), normalScale: new THREE.Vector2(0.45, 0.45) });
        (m.normalMap as THREE.Texture).repeat.set(28, 28);
        break;
      case 'M_Jeans':
      case 'M_Pants':
        m = new THREE.MeshStandardMaterial({ name, color: 0xffffff, map: denimColor(color), roughness: 0.88, normalMap: denimNormal(), normalScale: new THREE.Vector2(0.5, 0.5) });
        (m.map as THREE.Texture).repeat.set(10, 10);
        (m.normalMap as THREE.Texture).repeat.set(24, 24);
        break;
      case 'M_Shoes':
        m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.55 });
        break;
      case 'M_Hair':
        m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.42, metalness: 0.05, vertexColors: true, transparent: true, alphaTest: 0.02, roughnessMap: strandsTexture() });
        break;
      case 'M_Beard':
        m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.75, vertexColors: true, transparent: true, depthWrite: false, alphaMap: strandsTexture(), map: strandsTexture() });
        break;
      case 'M_Eye':
        centerEyeUv(mesh);
        m = new THREE.MeshPhysicalMaterial({ name, color: 0xffffff, map: irisTexture(opts.iris ?? '#5a3a1e'), roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 });
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
