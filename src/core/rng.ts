/** RNG determinístico (mulberry32). Um por subsistema para cenários reproduzíveis. */
export class Rng {
  private s: number;
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  seed(seed: number): void {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  /** Escolha ponderada; evita repetir `avoid` quando houver alternativa. */
  weighted<T>(items: readonly T[], weight: (t: T) => number, avoid?: T): T {
    const pool = items.length > 1 && avoid !== undefined ? items.filter((i) => i !== avoid) : items;
    let total = 0;
    for (const i of pool) total += Math.max(0, weight(i));
    let r = this.next() * total;
    for (const i of pool) {
      r -= Math.max(0, weight(i));
      if (r <= 0) return i;
    }
    return pool[pool.length - 1]!;
  }
}

export const rngs = {
  combat: new Rng(101),
  ai: new Rng(202),
  vfx: new Rng(303),
  spawn: new Rng(404),
  audio: new Rng(505),
};

export function reseedAll(seed: number): void {
  let i = 0;
  for (const r of Object.values(rngs)) r.seed(seed * 7919 + ++i * 104729);
}
