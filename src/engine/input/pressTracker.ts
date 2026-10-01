/**
 * Toque × segurar para os "poucos botões" (DEC-0016), sem esperar para decidir:
 *  - `strike` (soco/chute): o TOQUE sai na hora em que aperta ('tap'); se continuar segurando por `holdAt`,
 *    vira CARGA ('charge'); ao soltar carregado sai o GOLPE FORTE ('release', com o tempo de carga).
 *  - `shift` (esquiva/correr): soltar antes de `holdAt` = ESQUIVA ('tap' no soltar); segurar = CORRER
 *    (`holding` fica verdadeiro enquanto segura depois de `holdAt`).
 * Puro (sem DOM): o tempo vem de fora, o que permite teste unitário e uso igual por mouse, gamepad e toque.
 */
export type PressMode = 'strike' | 'shift';
export type PressEvent = { kind: 'tap' } | { kind: 'charge' } | { kind: 'release'; held: number };

export class PressTracker {
  down = false;
  /** Tempo segurando (s) na pressão atual. */
  held = 0;
  /** Já passou de `holdAt` nesta pressão. */
  holding = false;

  constructor(
    readonly mode: PressMode,
    readonly holdAt = 0.22,
  ) {}

  press(out: PressEvent[]): void {
    if (this.down) return;
    this.down = true;
    this.held = 0;
    this.holding = false;
    if (this.mode === 'strike') out.push({ kind: 'tap' });
  }

  release(out: PressEvent[]): void {
    if (!this.down) return;
    this.down = false;
    if (this.mode === 'strike') {
      if (this.holding) out.push({ kind: 'release', held: this.held });
    } else if (!this.holding) out.push({ kind: 'tap' });
    this.holding = false;
  }

  update(dt: number, out: PressEvent[]): void {
    if (!this.down) return;
    this.held += dt;
    if (!this.holding && this.held >= this.holdAt) {
      this.holding = true;
      if (this.mode === 'strike') out.push({ kind: 'charge' });
    }
  }

  /** Perdeu o foco/janela: solta sem gerar golpe. */
  cancel(): void {
    this.down = false;
    this.holding = false;
    this.held = 0;
  }
}
