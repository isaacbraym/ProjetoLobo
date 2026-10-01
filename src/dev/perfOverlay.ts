import type { Game } from '../game/game';

/** Overlay de performance (?perf=1). Também alimenta window.__LOBO__.perf(). */
export class PerfOverlay {
  private el: HTMLDivElement;
  private acc = 0;
  private frames = 0;
  private worst = 0;
  fps = 0;
  private samples: number[] = [];

  constructor(private game: Game, visible: boolean) {
    this.el = document.createElement('div');
    this.el.className = 'perf';
    if (!visible) this.el.style.display = 'none';
    document.body.appendChild(this.el);
  }

  tick(dt: number): void {
    this.acc += dt;
    this.frames++;
    this.worst = Math.max(this.worst, dt);
    this.samples.push(dt * 1000);
    if (this.samples.length > 600) this.samples.shift();
    if (this.acc < 0.5) return;
    this.fps = this.frames / this.acc;
    const g = this.game;
    const info = g.renderer.gl.info;
    const t = g.timings;
    this.el.textContent =
      `FPS ${this.fps.toFixed(0)}  pior ${(this.worst * 1000).toFixed(1)}ms  ${g.renderer.preset.name} dpr ${g.renderer.pixelRatio.toFixed(2)}\n` +
      `sim ${t.sim.toFixed(2)} fis ${t.physics.toFixed(2)} anim ${t.anim.toFixed(2)} rend ${t.render.toFixed(2)} ms\n` +
      `draw ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k  tex ${info.memory.textures}  geo ${info.memory.geometries}\n` +
      `inimigos ${g.enemies.length}  corpos ${g.corpses.length}  gpu ${g.renderer.gpuName.slice(0, 48)}`;
    this.acc = 0;
    this.frames = 0;
    this.worst = 0;
  }

  report(): Record<string, unknown> {
    const s = [...this.samples].sort((a, b) => a - b);
    const pct = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0;
    const info = this.game.renderer.gl.info;
    const avg = s.reduce((a, b) => a + b, 0) / Math.max(1, s.length);
    return {
      fps: Math.round(this.fps),
      frameAvgMs: +avg.toFixed(2),
      p95Ms: +pct(0.95).toFixed(2),
      p99Ms: +pct(0.99).toFixed(2),
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      preset: this.game.renderer.preset.name,
      dpr: this.game.renderer.pixelRatio,
      gpu: this.game.renderer.gpuName,
      timings: { ...this.game.timings },
      enemies: this.game.enemies.length,
      corpses: this.game.corpses.length,
      heapMB: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
        ? Math.round((performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize / 1048576)
        : null,
    };
  }
}
