import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Physics } from '../../engine/physics/physics';
import type { Renderer } from '../../engine/render/renderer';
import { marbleFloor, plaster, signTexture, woodPanels } from '../../engine/render/proceduralTextures';
import { createNewsScreen, type ScreenTexture } from './screens';

export interface LevelHandle {
  root: THREE.Group;
  spawn: THREE.Vector3;
  enemySpawns: THREE.Vector3[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  update(dt: number): void;
  keyLight: THREE.DirectionalLight;
}

const W = 16; // meia largura (x)
const D = 12; // meia profundidade (z)
const H = 7.2;

/** Saguão de teste: átrio corporativo do Edifício Vértice (sandbox do combate até o gerador de andares do M6). */
export function buildSandboxLobby(renderer: Renderer, physics: Physics): LevelHandle {
  const root = new THREE.Group();
  root.name = 'SandboxLobby';
  const scene = renderer.scene;

  // ---------- ambiente / reflexos ----------
  const pmrem = new THREE.PMREMGenerator(renderer.gl);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.22;
  scene.background = new THREE.Color(0x0d0c10);
  scene.fog = new THREE.Fog(0x141118, 26, 70);

  // ---------- materiais ----------
  const floorTex = marbleFloor(8);
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex.map, roughnessMap: floorTex.rough, roughness: 1, metalness: 0.0, envMapIntensity: 2.2, color: 0x6b655f });
  const wallMat = new THREE.MeshStandardMaterial({ map: plaster(4, 0.92), roughness: 0.92, color: 0x8a8790 });
  const woodMat = new THREE.MeshStandardMaterial({ map: woodPanels(6, 2), roughness: 0.55, envMapIntensity: 0.8 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x1b1a1f, roughness: 0.9 });
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x22222a, metalness: 0.85, roughness: 0.32 });
  const brushed = new THREE.MeshStandardMaterial({ color: 0x9a9aa2, metalness: 0.9, roughness: 0.28 });
  const stoneDesk = new THREE.MeshStandardMaterial({ color: 0xcfc8be, roughness: 0.25, envMapIntensity: 1.2 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x9fc4d8, roughness: 0.05, metalness: 0, transmission: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.5, depthWrite: false });
  const ledWarm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.52).multiplyScalar(3.2), toneMapped: false });
  const ledCool = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.75, 1.0).multiplyScalar(2.4), toneMapped: false });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5a2c, roughness: 0.8 });
  const potMat = new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.6 });
  const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3b2418, roughness: 0.55 });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, opts: { cast?: boolean; receive?: boolean; ry?: number } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    if (opts.ry) m.rotation.y = opts.ry;
    m.castShadow = opts.cast ?? false;
    m.receiveShadow = opts.receive ?? true;
    root.add(m);
    return m;
  };

  // ---------- piso, teto, paredes ----------
  const floor = add(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(-Math.PI / 2), floorMat, 0, 0, 0);
  floor.name = 'floor';
  physics.addStaticBox(0, -0.5, 0, W, 0.5, D);
  add(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(Math.PI / 2), ceilMat, 0, H, 0, { receive: false });

  // parede norte: painel de madeira atrás da recepção
  add(new THREE.PlaneGeometry(W * 2, H), woodMat, 0, H / 2, -D);
  // paredes leste/oeste: gesso
  add(new THREE.PlaneGeometry(D * 2, H).rotateY(-Math.PI / 2), wallMat, W, H / 2, 0);
  add(new THREE.PlaneGeometry(D * 2, H).rotateY(Math.PI / 2), wallMat, -W, H / 2, 0);
  physics.addStaticBox(0, H / 2, -D - 0.25, W, H / 2, 0.25);
  physics.addStaticBox(W + 0.25, H / 2, 0, 0.25, H / 2, D);
  physics.addStaticBox(-W - 0.25, H / 2, 0, 0.25, H / 2, D);
  physics.addStaticBox(0, H / 2, D + 0.25, W, H / 2, 0.25);

  // fachada sul de vidro com montantes e "cidade" noturna atrás
  const cityTex = makeNightCity();
  const cityMat = new THREE.MeshBasicMaterial({ map: cityTex, toneMapped: true });
  add(new THREE.PlaneGeometry(W * 2.6, H * 1.6), cityMat, 0, H * 0.55, D + 6, { receive: false, ry: Math.PI });
  add(new THREE.PlaneGeometry(W * 2, H), glassMat, 0, H / 2, D, { receive: false, ry: Math.PI });
  const mullions: THREE.BufferGeometry[] = [];
  for (let x = -W; x <= W + 0.01; x += 2.66) mullions.push(new THREE.BoxGeometry(0.12, H, 0.18).translate(x, H / 2, D));
  mullions.push(new THREE.BoxGeometry(W * 2, 0.14, 0.18).translate(0, 3.2, D));
  add(mergeGeometries(mullions)!, darkMetal, 0, 0, 0, { cast: true });

  // rodapés e frisos (pegam luz e dão escala)
  const trims: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(D * 2, 0.14, 0.04).rotateY(Math.PI / 2).translate(W - 0.02, 0.07, 0),
    new THREE.BoxGeometry(D * 2, 0.14, 0.04).rotateY(Math.PI / 2).translate(-W + 0.02, 0.07, 0),
    new THREE.BoxGeometry(W * 2, 0.14, 0.04).translate(0, 0.07, -D + 0.02),
  ];
  add(mergeGeometries(trims)!, darkMetal, 0, 0, 0);

  // ---------- colunas (instanciadas) ----------
  const colGeo = new THREE.BoxGeometry(0.9, H, 0.9);
  const colPositions: [number, number][] = [
    [-9, -5], [9, -5], [-9, 5], [9, 5],
  ];
  const cols = new THREE.InstancedMesh(colGeo, stoneDesk, colPositions.length);
  const tmp = new THREE.Object3D();
  colPositions.forEach(([x, z], i) => {
    tmp.position.set(x, H / 2, z);
    tmp.updateMatrix();
    cols.setMatrixAt(i, tmp.matrix);
    physics.addStaticBox(x, H / 2, z, 0.45, H / 2, 0.45);
  });
  cols.castShadow = true;
  cols.receiveShadow = true;
  root.add(cols);
  // anéis de LED nas colunas
  const ringGeo = mergeGeometries(colPositions.map(([x, z]) => new THREE.BoxGeometry(0.94, 0.05, 0.94).translate(x, 3.0, z)))!;
  add(ringGeo, ledWarm, 0, 0, 0, { receive: false });

  // ---------- teto: painéis de luz em grade + sancas de LED ----------
  const panelGeos: THREE.BufferGeometry[] = [];
  for (let x = -12; x <= 12; x += 4) for (let z = -8; z <= 8; z += 4) panelGeos.push(new THREE.BoxGeometry(2.2, 0.04, 0.5).translate(x, H - 0.03, z));
  add(mergeGeometries(panelGeos)!, ledCool, 0, 0, 0, { receive: false });
  const coveGeos = [
    new THREE.BoxGeometry(W * 2, 0.04, 0.06).translate(0, H - 0.25, -D + 0.08),
    new THREE.BoxGeometry(0.06, 0.04, D * 2).translate(W - 0.08, H - 0.25, 0),
    new THREE.BoxGeometry(0.06, 0.04, D * 2).translate(-W + 0.08, H - 0.25, 0),
  ];
  add(mergeGeometries(coveGeos)!, ledWarm, 0, 0, 0, { receive: false });

  // ---------- recepção ----------
  const deskZ = -D + 3.2;
  const desk = mergeGeometries([
    new THREE.BoxGeometry(8, 1.1, 1.0).translate(0, 0.55, 0),
    new THREE.BoxGeometry(8.2, 0.06, 1.2).translate(0, 1.13, 0.05),
  ])!;
  add(desk, stoneDesk, 0, 0, deskZ, { cast: true });
  add(new THREE.BoxGeometry(8.0, 0.03, 0.02), ledWarm, 0, 0.12, deskZ + 0.51, { receive: false });
  physics.addStaticBox(0, 0.55, deskZ, 4, 0.55, 0.5);
  // monitores na recepção
  for (const x of [-2.5, 0, 2.5]) {
    add(new THREE.BoxGeometry(0.55, 0.34, 0.03), darkMetal, x, 1.42, deskZ - 0.15, { cast: true });
    add(new THREE.PlaneGeometry(0.5, 0.29), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.45, 0.9).multiplyScalar(1.3), toneMapped: false }), x, 1.42, deskZ - 0.13, { receive: false });
  }
  // logo da empresa com luz de fundo
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 2.25),
    new THREE.MeshBasicMaterial({ map: signTexture('VÉRTICE', 'CORPORATE TOWER'), transparent: true, toneMapped: false, color: new THREE.Color(1.6, 1.5, 1.4) }),
  );
  logo.position.set(0, 4.6, -D + 0.05);
  root.add(logo);
  add(new THREE.PlaneGeometry(10.5, 3.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.6, 0.3).multiplyScalar(0.5), transparent: true, opacity: 0.25, toneMapped: false, depthWrite: false }), 0, 4.6, -D + 0.03, { receive: false });

  // ---------- catracas de segurança (perto da entrada) ----------
  const gateGeos: THREE.BufferGeometry[] = [];
  for (let i = -3; i <= 3; i++) {
    if (i === 0) continue;
    gateGeos.push(new THREE.BoxGeometry(0.22, 1.0, 1.4).translate(i * 1.3, 0.5, D - 4));
  }
  add(mergeGeometries(gateGeos)!, brushed, 0, 0, 0, { cast: true });
  for (let i = -3; i <= 3; i++) if (i !== 0) physics.addStaticBox(i * 1.3, 0.5, D - 4, 0.11, 0.5, 0.7);
  const gateLeds = mergeGeometries([-3, -2, -1, 1, 2, 3].map((i) => new THREE.BoxGeometry(0.24, 0.03, 1.2).translate(i * 1.3, 1.01, D - 4)))!;
  add(gateLeds, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.12, 0.15).multiplyScalar(3), toneMapped: false }), 0, 0, 0, { receive: false });

  // ---------- mezanino oeste com guarda-corpo de vidro ----------
  add(new THREE.BoxGeometry(5, 0.35, D * 2 - 2), stoneDesk, -W + 2.5, 3.6, 0, { cast: true });
  add(new THREE.BoxGeometry(0.04, 1.0, D * 2 - 2), glassMat, -W + 5, 4.3, 0, { receive: false });
  add(new THREE.BoxGeometry(0.08, 0.06, D * 2 - 2), brushed, -W + 5, 4.82, 0);
  add(new THREE.BoxGeometry(5, 0.03, 0.03), ledWarm, -W + 2.5, 3.41, D - 1.05, { receive: false });

  // ---------- plantas e sofás ----------
  const plants: [number, number][] = [[-12.5, -9], [12.5, -9], [-6, 9.5], [6, 9.5], [13.5, 2], [13.5, -2]];
  for (const [x, z] of plants) {
    add(new THREE.CylinderGeometry(0.45, 0.35, 0.8, 16), potMat, x, 0.4, z, { cast: true });
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 1), leafMat);
    bush.position.set(x, 1.35, z);
    bush.scale.set(1, 1.3, 1);
    bush.castShadow = true;
    root.add(bush);
    physics.addStaticBox(x, 0.6, z, 0.45, 0.6, 0.45);
  }
  for (const [x, z, ry] of [[13.2, 6.5, -Math.PI / 2], [13.2, -6.5, -Math.PI / 2]] as const) {
    const sofa = mergeGeometries([
      new THREE.BoxGeometry(2.6, 0.45, 0.95).translate(0, 0.32, 0),
      new THREE.BoxGeometry(2.6, 0.55, 0.22).translate(0, 0.7, -0.38),
    ])!;
    add(sofa, leatherMat, x, 0, z, { cast: true, ry });
    physics.addStaticBox(x, 0.45, z, 0.5, 0.45, 1.3);
  }

  // ---------- TVs com telejornal procedural ----------
  const screens: ScreenTexture[] = [];
  for (const [x, z, ry] of [[W - 0.06, -3, -Math.PI / 2], [-W + 0.06, 3, Math.PI / 2]] as const) {
    const s = createNewsScreen();
    screens.push(s);
    add(new THREE.BoxGeometry(3.3, 1.9, 0.08), darkMetal, x, 2.4, z, { ry });
    const scr = add(new THREE.PlaneGeometry(3.15, 1.77), new THREE.MeshBasicMaterial({ map: s.texture, toneMapped: false }), x + (ry < 0 ? -0.05 : 0.05), 2.4, z, { receive: false, ry });
    scr.name = 'tv';
  }

  // ---------- luzes ----------
  scene.add(new THREE.HemisphereLight(0x9fb0ff, 0x1a120c, 0.18));
  const key = new THREE.DirectionalLight(0xffe2c0, 2.6);
  key.position.set(6, 14, 8);
  key.target.position.set(0, 0, 0);
  key.castShadow = renderer.preset.shadows !== 'blob';
  key.shadow.mapSize.set(renderer.preset.shadowMapSize, renderer.preset.shadowMapSize);
  const sc = key.shadow.camera;
  sc.left = -14;
  sc.right = 14;
  sc.top = 14;
  sc.bottom = -14;
  sc.near = 1;
  sc.far = 40;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.03;
  root.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x7fa8ff, 1.6);
  rim.position.set(-4, 6, 16);
  root.add(rim);
  const warm1 = new THREE.PointLight(0xffa860, 30, 14, 2);
  warm1.position.set(0, 3.2, deskZ + 1.5);
  root.add(warm1);
  const red = new THREE.PointLight(0xff2a3a, 9, 8, 2);
  red.position.set(0, 1.6, D - 4);
  root.add(red);

  scene.add(root);

  let t = 0;
  return {
    root,
    spawn: new THREE.Vector3(0, 0, 6),
    enemySpawns: [new THREE.Vector3(-4, 0, -3), new THREE.Vector3(4, 0, -3.5), new THREE.Vector3(0, 0, -5.5), new THREE.Vector3(-6, 0, 1), new THREE.Vector3(6, 0, 1)],
    bounds: { minX: -W + 0.6, maxX: W - 0.6, minZ: -D + 0.6, maxZ: D - 0.6 },
    keyLight: key,
    update(dt: number) {
      t += dt;
      for (const s of screens) s.update(dt);
      red.intensity = 6 + Math.sin(t * 3.2) * 3;
    },
  };
}

function makeNightCity(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#0a1024');
  g.addColorStop(0.6, '#1b2350');
  g.addColorStop(1, '#3a2a40');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);
  let seed = 9;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const w = 30 + rnd() * 70;
    const h = 120 + rnd() * 330;
    const x = rnd() * 1024;
    ctx.fillStyle = `rgb(${12 + rnd() * 14},${14 + rnd() * 14},${26 + rnd() * 20})`;
    ctx.fillRect(x, 512 - h, w, h);
    for (let wy = 512 - h + 8; wy < 500; wy += 10) {
      for (let wx = x + 4; wx < x + w - 4; wx += 8) {
        if (rnd() < 0.32) {
          ctx.fillStyle = rnd() < 0.8 ? 'rgba(255,214,150,0.9)' : 'rgba(150,200,255,0.9)';
          ctx.fillRect(wx, wy, 4, 5);
        }
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
