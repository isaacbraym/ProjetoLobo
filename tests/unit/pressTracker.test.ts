import { describe, expect, it } from 'vitest';
import { PressTracker, type PressEvent } from '../../src/engine/input/pressTracker';

/** Simula uma pressão de `held` segundos em passos de 1/60 s e devolve os eventos em ordem. */
function hold(t: PressTracker, held: number): PressEvent['kind'][] {
  const out: PressEvent[] = [];
  t.press(out);
  for (let s = 0; s < held - 1e-9; s += 1 / 60) t.update(1 / 60, out);
  t.release(out);
  return out.map((e) => e.kind);
}

describe('PressTracker — soco/chute (toque sai na hora, segurar = forte)', () => {
  it('toque rápido: só o golpe leve, emitido no aperto', () => {
    const t = new PressTracker('strike', 0.22);
    const out: PressEvent[] = [];
    t.press(out);
    expect(out.map((e) => e.kind)).toEqual(['tap']); // antes de soltar
    t.update(0.08, out);
    t.release(out);
    expect(out.map((e) => e.kind)).toEqual(['tap']);
  });

  it('segurar: leve na hora, carga ao passar do limite, forte ao soltar com o tempo segurado', () => {
    const t = new PressTracker('strike', 0.22);
    const out: PressEvent[] = [];
    t.press(out);
    for (let i = 0; i < 30; i++) t.update(1 / 60, out); // 0,5 s
    t.release(out);
    expect(out.map((e) => e.kind)).toEqual(['tap', 'charge', 'release']);
    const rel = out[2] as Extract<PressEvent, { kind: 'release' }>;
    expect(rel.held).toBeCloseTo(0.5, 2);
  });

  it('carga só uma vez por pressão e não repete o toque', () => {
    const t = new PressTracker('strike', 0.22);
    expect(hold(t, 1.2)).toEqual(['tap', 'charge', 'release']);
    expect(hold(t, 0.1)).toEqual(['tap']);
  });

  it('press repetido sem soltar é ignorado (tecla com repetição)', () => {
    const t = new PressTracker('strike');
    const out: PressEvent[] = [];
    t.press(out);
    t.press(out);
    expect(out).toHaveLength(1);
  });
});

describe('PressTracker — Shift (toque = esquiva, segurar = correr)', () => {
  it('toque: esquiva ao soltar, sem correr', () => {
    const t = new PressTracker('shift', 0.22);
    const out: PressEvent[] = [];
    t.press(out);
    expect(out).toHaveLength(0);
    t.update(0.1, out);
    expect(t.holding).toBe(false);
    t.release(out);
    expect(out.map((e) => e.kind)).toEqual(['tap']);
  });

  it('segurar: corre enquanto segura e não esquiva ao soltar', () => {
    const t = new PressTracker('shift', 0.22);
    const out: PressEvent[] = [];
    t.press(out);
    for (let i = 0; i < 20; i++) t.update(1 / 60, out);
    expect(t.holding).toBe(true);
    t.release(out);
    expect(out).toHaveLength(0);
    expect(t.holding).toBe(false);
  });

  it('cancelar (perdeu o foco) não gera evento', () => {
    const t = new PressTracker('shift');
    const out: PressEvent[] = [];
    t.press(out);
    t.cancel();
    t.release(out);
    expect(out).toHaveLength(0);
  });
});
