import RAPIER from '@dimforge/rapier3d-compat';

export type Rapier = typeof RAPIER;

/** Grupos de colisão (16 bits de pertencimento | 16 bits de filtro). */
export const Layer = {
  STATIC: 1 << 0,
  PLAYER: 1 << 1,
  ENEMY: 1 << 2,
  CIVILIAN: 1 << 3,
  RAGDOLL: 1 << 4,
  PROP: 1 << 5,
  DEBRIS: 1 << 6,
  TRIGGER: 1 << 7,
} as const;

export function groups(member: number, filter: number): number {
  return ((member & 0xffff) << 16) | (filter & 0xffff);
}

export const G = {
  static: groups(Layer.STATIC, 0xffff),
  player: groups(Layer.PLAYER, Layer.STATIC | Layer.PROP | Layer.ENEMY | Layer.CIVILIAN),
  enemy: groups(Layer.ENEMY, Layer.STATIC | Layer.PROP | Layer.PLAYER | Layer.ENEMY | Layer.CIVILIAN),
  civilian: groups(Layer.CIVILIAN, Layer.STATIC | Layer.PROP | Layer.PLAYER | Layer.ENEMY | Layer.CIVILIAN),
  ragdoll: groups(Layer.RAGDOLL, Layer.STATIC | Layer.PROP),
  prop: groups(Layer.PROP, Layer.STATIC | Layer.PROP | Layer.PLAYER | Layer.ENEMY | Layer.RAGDOLL | Layer.DEBRIS),
  debris: groups(Layer.DEBRIS, Layer.STATIC | Layer.PROP),
  /** Raycast de câmera e de chão: só estático. */
  camera: groups(0xffff, Layer.STATIC),
};

export class Physics {
  R!: Rapier;
  world!: RAPIER.World;
  stepMs = 0;
  /** Quando não nulo, toda caixa estática criada é registrada (entrada da navmesh). */
  record: { cx: number; cy: number; cz: number; hx: number; hy: number; hz: number; ry: number }[] | null = null;

  async init(): Promise<void> {
    await RAPIER.init();
    this.R = RAPIER;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = 1 / 60;
  }

  step(): void {
    const t0 = performance.now();
    this.world.step();
    this.stepMs = performance.now() - t0;
  }

  addStaticBox(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, rotY = 0): RAPIER.Collider {
    this.record?.push({ cx, cy, cz, hx, hy, hz, ry: rotY });
    const body = this.world.createRigidBody(
      this.R.RigidBodyDesc.fixed()
        .setTranslation(cx, cy, cz)
        .setRotation({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) }),
    );
    return this.world.createCollider(this.R.ColliderDesc.cuboid(hx, hy, hz).setCollisionGroups(G.static).setFriction(0.9), body);
  }

  /** Raycast contra estático. Retorna distância ou null. */
  castRay(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxToi: number, filterGroups = G.camera): number | null {
    const ray = new this.R.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    const hit = this.world.castRay(ray, maxToi, true, undefined, filterGroups);
    return hit ? hit.timeOfImpact : null;
  }

  /** Esfera varrida contra estático (câmera). */
  castSphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, radius: number, maxToi: number): number | null {
    const shape = new this.R.Ball(radius);
    const hit = this.world.castShape(
      { x: ox, y: oy, z: oz },
      { x: 0, y: 0, z: 0, w: 1 },
      { x: dx, y: dy, z: dz },
      shape,
      0,
      maxToi,
      true,
      undefined,
      G.camera,
    );
    return hit ? hit.time_of_impact : null;
  }
}
