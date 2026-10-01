import * as THREE from 'three';
import { marbleFloor, plaster, carpet } from '../../engine/render/proceduralTextures';
import { brushedMetal, cardboard, ceilingTiles, concrete, fabric, terrazzo, tiles, vinyl, woodSlats, woodWall } from './levelTextures';

/**
 * Paleta de materiais do andar (por chave). Geometria do nível tem UV em metros: texturas já vêm com repeat = 1/tamanho.
 * Chaves `c:#rrggbb` ou `c:#rrggbb:rugosidade` criam um material liso sob demanda (props com cor por parâmetro).
 */
const S = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
const glow = (r: number, g: number, b: number, k: number) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b).multiplyScalar(k), toneMapped: false });

/** Copia a textura com outro repeat (a mesma imagem em escalas diferentes). */
function scaled(t: THREE.Texture, size: number): THREE.Texture {
  const c = t.clone();
  c.repeat.set(1 / size, 1 / size);
  c.needsUpdate = true;
  return c;
}

const FACTORY: Record<string, () => THREE.Material> = {
  // ---- pisos ----
  marble: () => {
    const m = marbleFloor(1);
    return S({ map: scaled(m.map, 3.2), roughnessMap: scaled(m.rough, 3.2), roughness: 1, color: 0x6b655f, envMapIntensity: 2.2 });
  },
  cafeTile: () => S({ map: terrazzo().map, roughness: 0.42, envMapIntensity: 1.2 }),
  vinyl: () => S({ map: vinyl().map, roughness: 0.6, envMapIntensity: 0.9 }),
  carpet: () => S({ map: scaled(carpet(1), 2), roughness: 0.98, color: 0x8a90a8 }),
  wcTile: () => {
    const t = tiles('wcFloor', 0.3, '#d6d4cf', '#8d8a85');
    return S({ map: t.map, normalMap: t.normal, roughness: 0.35, envMapIntensity: 1.1 });
  },
  concrete: () => S({ map: concrete().map, roughness: 0.92 }),
  // ---- paredes ----
  woodPanel: () => S({ map: woodWall().map, roughness: 0.55, envMapIntensity: 0.8 }),
  plasterCool: () => S({ map: scaled(plaster(1, 0.92), 3), roughness: 0.92, color: 0xb9bcc4 }),
  plasterWarm: () => S({ map: scaled(plaster(1, 0.95), 3), roughness: 0.9, color: 0xd8c7b2 }),
  wallTile: () => {
    const t = tiles('wcWall', 0.2, '#e9ece9', '#b5b8b6');
    return S({ map: t.map, normalMap: t.normal, roughness: 0.25, envMapIntensity: 1.2 });
  },
  concreteWall: () => S({ map: concrete('#9a9894').map, roughness: 0.95 }),
  // ---- tetos ----
  atrium: () => S({ color: 0x1b1a1f, roughness: 0.9 }),
  tiles: () => S({ map: ceilingTiles().map, roughness: 0.95 }),
  woodSlat: () => S({ map: woodSlats().map, roughness: 0.75 }),
  // ---- props ----
  stone: () => S({ color: 0xcfc8be, roughness: 0.25, envMapIntensity: 1.2 }),
  stoneDark: () => S({ color: 0x2f2c2a, roughness: 0.3, envMapIntensity: 1.3 }),
  metalDark: () => S({ color: 0x22222a, metalness: 0.85, roughness: 0.32 }),
  brushed: () => S({ map: brushedMetal().map, color: 0xb8bac0, metalness: 0.9, roughness: 0.3 }),
  chrome: () => S({ color: 0xdadde2, metalness: 1, roughness: 0.12 }),
  glass: () => new THREE.MeshPhysicalMaterial({ color: 0x9fc4d8, roughness: 0.05, transparent: true, opacity: 0.2, envMapIntensity: 1.6, depthWrite: false }),
  glassDark: () => new THREE.MeshPhysicalMaterial({ color: 0x1a2a32, roughness: 0.08, transparent: true, opacity: 0.55, envMapIntensity: 1.4, depthWrite: false }),
  woodDark: () => S({ color: 0x4a2e1c, roughness: 0.5, envMapIntensity: 0.8 }),
  woodLight: () => S({ color: 0xa47a52, roughness: 0.55 }),
  leatherBrown: () => S({ color: 0x4a2a1a, roughness: 0.5 }),
  leatherBlack: () => S({ color: 0x18161a, roughness: 0.45 }),
  fabricGrey: () => S({ map: fabric('#55585e').map, roughness: 0.95 }),
  fabricBlue: () => S({ map: fabric('#2c3e5c').map, roughness: 0.95 }),
  fabricRed: () => S({ map: fabric('#6e2424').map, roughness: 0.95 }),
  plasticWhite: () => S({ color: 0xe6e6e2, roughness: 0.45 }),
  plasticBlack: () => S({ color: 0x141416, roughness: 0.5 }),
  plasticGrey: () => S({ color: 0x6d7074, roughness: 0.5 }),
  plasticRed: () => S({ color: 0xb81419, roughness: 0.35 }),
  plasticOrange: () => S({ color: 0xff6a12, roughness: 0.45 }),
  plasticBlue: () => S({ color: 0x2c64c8, roughness: 0.4 }),
  plasticYellow: () => S({ color: 0xf2c21a, roughness: 0.45 }),
  cardboard: () => S({ map: cardboard().map, roughness: 0.9 }),
  paper: () => S({ color: 0xeeebe4, roughness: 0.9, side: THREE.DoubleSide }),
  ceramic: () => S({ color: 0xf2f2ee, roughness: 0.18, envMapIntensity: 1.3 }),
  mirror: () => S({ color: 0xc8d0d6, metalness: 1, roughness: 0.04, envMapIntensity: 2 }),
  foliage: () => S({ color: 0x2f5a2c, roughness: 0.8 }),
  foliageDark: () => S({ color: 0x1d3d1f, roughness: 0.85 }),
  soil: () => S({ color: 0x2a1d14, roughness: 1 }),
  potDark: () => S({ color: 0x2a2624, roughness: 0.6 }),
  rubber: () => S({ color: 0x1a1a1a, roughness: 0.9 }),
  brass: () => S({ color: 0xb08a4a, metalness: 0.9, roughness: 0.3 }),
  velvet: () => S({ color: 0x7a0c1a, roughness: 0.8 }),
  tapeYellow: () => S({ color: 0xf5c400, roughness: 0.5, side: THREE.DoubleSide }),
  paintWhite: () => S({ color: 0xdedcd6, roughness: 0.7 }),
  paintGrey: () => S({ color: 0x5c5f63, roughness: 0.6 }),
  screenDark: () => S({ color: 0x0b0d10, roughness: 0.15, metalness: 0.2, envMapIntensity: 1.5 }),
  // ---- luzes (emissivo, não sofre tonemapping → bloom) ----
  ledWarm: () => glow(1.0, 0.78, 0.52, 3.2),
  ledCool: () => glow(0.55, 0.75, 1.0, 2.4),
  ledWhite: () => glow(1.0, 0.98, 0.94, 2.6),
  ledRed: () => glow(1.0, 0.12, 0.15, 3.0),
  ledGreen: () => glow(0.2, 1.0, 0.45, 2.6),
  ledAmber: () => glow(1.0, 0.6, 0.15, 2.8),
  screenBlue: () => glow(0.25, 0.45, 0.9, 1.3),
};

export class LevelMaterials {
  private cache = new Map<string, THREE.Material>();

  get(key: string): THREE.Material {
    let m = this.cache.get(key);
    if (m) return m;
    if (key.startsWith('c:')) {
      const [, col, rough] = key.split(':');
      m = S({ color: new THREE.Color(col!), roughness: rough ? Number(rough) : 0.6 });
    } else {
      const f = FACTORY[key];
      if (!f) throw new Error(`material de nível desconhecido: ${key}`);
      m = f();
    }
    m.name = key;
    this.cache.set(key, m);
    return m;
  }

  /** Materiais que projetam sombra quando estáticos (os grandes e opacos). */
  casts(key: string): boolean {
    return !/^(led|screen|glass|paper|tape|marble|cafeTile|vinyl|carpet|wcTile|concrete$|atrium|tiles|woodSlat)/.test(key);
  }

  all(): THREE.Material[] {
    return [...this.cache.values()];
  }
}
