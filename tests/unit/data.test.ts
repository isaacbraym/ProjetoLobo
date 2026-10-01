import { describe, expect, it } from 'vitest';
import { archetypesData, attacksData, difficultyData } from '../../src/game/data/gameData';

describe('dados de combate', () => {
  it('toda dificuldade tem telegrafia ≥ 0,25 s (leitura justa, L-04)', () => {
    for (const d of Object.values(difficultyData.levels)) expect(d.telegraph).toBeGreaterThanOrEqual(0.25);
  });
  it('dificuldade muda mais que HP (tokens, dano, telegrafia)', () => {
    const { easy, hard } = difficultyData.levels;
    expect(hard.tokens).toBeGreaterThan(easy.tokens);
    expect(hard.telegraph).toBeLessThan(easy.telegraph);
    expect(hard.hp / easy.hp).toBeLessThan(1.35);
  });
  it('ataques do jogador são mais rápidos que os do inimigo equivalente', () => {
    const p = attacksData.attacks.p_jab!;
    const e = attacksData.attacks.e_jab!;
    expect((p.hitAt - p.start) / p.speed).toBeLessThan((e.hitAt - e.start) / e.speed + 0.01);
  });
  it('Heavy custa mais fichas', () => {
    expect(archetypesData.archetypes.heavy!.tokenCost).toBeGreaterThan(archetypesData.archetypes.thug!.tokenCost);
  });
});
