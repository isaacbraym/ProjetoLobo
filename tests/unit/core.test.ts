import { describe, expect, it } from 'vitest';
import { Rng } from '../../src/core/rng';
import { angleDiff, damp } from '../../src/core/math';
import { EventBus } from '../../src/core/events';
import { FixedLoop } from '../../src/core/loop';

describe('Rng', () => {
  it('é determinístico por seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('weighted evita repetir a última opção quando há alternativa', () => {
    const r = new Rng(1);
    for (let i = 0; i < 200; i++) expect(r.weighted(['a', 'b'], () => 1, 'a')).toBe('b');
  });
});

describe('math', () => {
  it('angleDiff fica em (-PI, PI]', () => {
    expect(angleDiff(0, Math.PI * 1.5)).toBeCloseTo(-Math.PI / 2);
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6);
  });
  it('damp converge sem ultrapassar', () => {
    let v = 0;
    for (let i = 0; i < 600; i++) v = damp(v, 10, 0.1, 1 / 60);
    expect(v).toBeGreaterThan(9.99);
    expect(v).toBeLessThanOrEqual(10);
  });
});

describe('EventBus', () => {
  it('entrega e permite cancelar inscrição', () => {
    const bus = new EventBus<{ X: { n: number } }>();
    let got = 0;
    const off = bus.on('X', (e) => (got += e.n));
    bus.emit('X', { n: 2 });
    off();
    bus.emit('X', { n: 5 });
    expect(got).toBe(2);
  });
});

describe('FixedLoop', () => {
  it('roda passos fixos e respeita timeScale', () => {
    let steps = 0;
    const loop = new FixedLoop({ fixedUpdate: () => steps++, frameUpdate: () => {} });
    loop.advance(1 / 60 + 1e-6);
    expect(steps).toBe(1);
    loop.timeScale = 0.5;
    loop.advance(1 / 60);
    loop.advance(1 / 60);
    expect(steps).toBe(2);
  });
});
