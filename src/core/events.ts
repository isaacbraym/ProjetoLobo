/** Barramento de eventos tipado. Sistemas se comunicam por eventos; o combate não conhece música, UI ou civis. */
export interface GameEvents {
  HitLanded: { attackerId: number; targetId: number; damage: number; heavy: boolean; x: number; y: number; z: number; finisher?: boolean };
  Killed: { victimId: number; killerId: number; archetype: string; tier: number };
  PlayerDamaged: { damage: number; hp: number };
  PlayerDied: { livesLeft: number };
  FinisherStarted: { targetId: number; id: string };
  PerfectDodge: { attackerId: number };
  PropDestroyed: { propId: number; material: string };
  WeaponBroken: { weaponId: string };
  CivilianHurt: { civilianId: number };
  WolfMeterFull: Record<string, never>;
  WolfStart: Record<string, never>;
  WolfEnd: Record<string, never>;
  EncounterStart: { id: string; arena: boolean };
  EncounterClear: { id: string };
  BossPhase: { bossId: string; phase: number };
  ComboChanged: { count: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus<M extends object> {
  private handlers = new Map<keyof M, Set<Handler<never>>>();

  on<K extends keyof M>(type: K, fn: Handler<M[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof M>(type: K, payload: M[K]): void {
    const set = this.handlers.get(type);
    if (!set) return;
    for (const fn of set) (fn as Handler<M[K]>)(payload);
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const events = new EventBus<GameEvents>();
