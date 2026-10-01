import type { Actor, HitInfo } from '../actors/actor';

/** Contrato comum de quem luta (Márcio, inimigos, bosses). */
export interface Fighter {
  readonly actor: Actor;
  readonly kind: 'player' | 'enemy';
  /** Recebe um golpe. Retorna false se o golpe foi ignorado (invulnerável/esquiva). */
  takeHit(info: HitInfo): boolean;
  get alive(): boolean;
  /** Está atordoado/no chão (finalização, prioridade de alvo). */
  get staggered(): boolean;
}
