import * as THREE from 'three';
import { init, NavMeshQuery, type NavMesh } from '@recast-navigation/core';
import { generateSoloNavMesh } from '@recast-navigation/generators';

/**
 * Navmesh (recast-navigation, DEC-0001) gerada no carregamento a partir das caixas de colisão estáticas do andar
 * (o chão grande é a superfície andável; paredes, móveis e portas trancadas viram obstáculos). Inimigos, reféns e o
 * bot de teste pedem o próximo ponto do caminho — com cache por agente (recalcula a 4 Hz ou se o destino andar).
 */
export interface NavBox {
  cx: number;
  cy: number;
  cz: number;
  hx: number;
  hy: number;
  hz: number;
  ry: number;
}

/** Raio de erosão da navmesh (a cápsula tem 0,34 m; o controlador desliza no resto). */
const AGENT_R = 0.32;

export class NavWorld {
  private query: NavMeshQuery;
  readonly polys: number;
  private half = { x: 1.5, y: 2, z: 1.5 };

  private constructor(
    readonly navMesh: NavMesh,
    readonly buildMs: number,
  ) {
    this.query = new NavMeshQuery(navMesh);
    this.polys = navMesh.getMaxTiles();
  }

  static async build(boxes: NavBox[]): Promise<NavWorld | null> {
    const t0 = performance.now();
    await init();
    const pos: number[] = [];
    const idx: number[] = [];
    const c = new THREE.Vector3();
    const corners = [
      [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
      [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1],
    ];
    // faces da caixa com normal para fora (ordem anti-horária vista de fora; recast usa y para cima)
    const faces = [
      [4, 7, 6, 5], // topo (+y)
      [0, 1, 2, 3], // base
      [0, 4, 5, 1], // -z
      [2, 6, 7, 3], // +z
      [0, 3, 7, 4], // -x
      [1, 5, 6, 2], // +x
    ];
    for (const b of boxes) {
      const base = pos.length / 3;
      const cs = Math.cos(b.ry), sn = Math.sin(b.ry);
      for (const [sx, sy, sz] of corners) {
        const lx = sx! * b.hx, lz = sz! * b.hz;
        c.set(b.cx + lx * cs + lz * sn, b.cy + sy! * b.hy, b.cz - lx * sn + lz * cs);
        pos.push(c.x, c.y, c.z);
      }
      for (const [a, b1, c1, d] of faces) idx.push(base + a!, base + b1!, base + c1!, base + a!, base + c1!, base + d!);
    }
    // célula de 10 cm: o vão das catracas (1,06 m) precisa sobrar depois da erosão pelo raio do agente
    const cs = 0.1, ch = 0.1;
    const res = generateSoloNavMesh(pos, idx, {
      cs,
      ch,
      walkableSlopeAngle: 45,
      walkableHeight: Math.ceil(1.75 / ch),
      walkableClimb: Math.floor(0.3 / ch),
      walkableRadius: Math.floor(AGENT_R / cs),
      maxEdgeLen: 12,
      maxSimplificationError: 1.3,
      minRegionArea: 8,
      mergeRegionArea: 20,
      maxVertsPerPoly: 6,
      detailSampleDist: 6,
      detailSampleMaxError: 1,
    });
    if (!res.success) {
      console.warn('[nav] falhou:', res.error);
      return null;
    }
    return new NavWorld(res.navMesh, performance.now() - t0);
  }

  /** Caminho reto (cantos) de `from` a `to`; vazio se não houver. */
  path(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3[] {
    const r = this.query.computePath({ x: from.x, y: 0, z: from.z }, { x: to.x, y: 0, z: to.z }, { halfExtents: this.half });
    if (!r.success || !r.path.length) return [];
    return r.path.map((p) => new THREE.Vector3(p.x, 0, p.z));
  }

  /** Ponto andável mais próximo. */
  closest(p: THREE.Vector3, out: THREE.Vector3): boolean {
    const r = this.query.findClosestPoint({ x: p.x, y: 0, z: p.z }, { halfExtents: { x: 3, y: 3, z: 3 } });
    if (!r.success) return false;
    out.set(r.point.x, 0, r.point.z);
    return true;
  }
}

/** Seguidor de caminho por agente: guarda o caminho e devolve o próximo canto. */
export class NavFollower {
  private corners: THREE.Vector3[] = [];
  private idx = 0;
  private age = 99;
  private goal = new THREE.Vector3(1e9, 0, 1e9);
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();

  constructor(private nav: NavWorld) {}

  /** Próximo ponto para ir de (fx,fz) a (tx,tz). Devolve false se não há caminho (vai reto). */
  next(fx: number, fz: number, tx: number, tz: number, out: THREE.Vector3, dt = 1 / 60): boolean {
    this.age += dt;
    this.to.set(tx, 0, tz);
    if (this.age > 0.25 || this.goal.distanceToSquared(this.to) > 0.6 || !this.corners.length) {
      this.age = 0;
      this.goal.copy(this.to);
      this.from.set(fx, 0, fz);
      this.corners = this.nav.path(this.from, this.to);
      this.idx = 1;
    }
    if (this.corners.length < 2) {
      out.set(tx, 0, tz);
      return false;
    }
    // avança os cantos já alcançados
    while (this.idx < this.corners.length - 1 && Math.hypot(this.corners[this.idx]!.x - fx, this.corners[this.idx]!.z - fz) < 0.35) this.idx++;
    const c = this.corners[Math.min(this.idx, this.corners.length - 1)]!;
    out.set(c.x, 0, c.z);
    return true;
  }
}
