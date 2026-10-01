/** Loop com simulação em passo fixo (60 Hz) e render interpolado. */
export interface LoopCallbacks {
  fixedUpdate(dt: number): void;
  frameUpdate(frameDt: number, alpha: number): void;
}

export class FixedLoop {
  readonly step = 1 / 60;
  /** Escala global do tempo de simulação (slow-mo de finalização/transformação). */
  timeScale = 1;
  /** Pausa a simulação mas continua chamando frameUpdate (menus, câmera). */
  paused = false;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  /** Tempo de simulação acumulado (s). */
  simTime = 0;
  frameCount = 0;

  constructor(private cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      let frameDt = (now - this.last) / 1000;
      this.last = now;
      if (frameDt > 0.25) frameDt = 0.25; // aba voltou do segundo plano
      this.advance(frameDt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Avança manualmente (usado por testes determinísticos). */
  advance(frameDt: number): void {
    if (!this.paused) {
      this.acc += frameDt * this.timeScale;
      let steps = 0;
      while (this.acc >= this.step && steps < 4) {
        this.cb.fixedUpdate(this.step);
        this.simTime += this.step;
        this.acc -= this.step;
        steps++;
      }
      if (steps === 4) this.acc = 0;
    }
    this.frameCount++;
    this.cb.frameUpdate(frameDt, this.paused ? 1 : this.acc / this.step);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
