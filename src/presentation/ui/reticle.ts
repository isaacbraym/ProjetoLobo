/**
 * Retícula da câmera-mira (DEC-0016): segue o cursor (o cursor do sistema some sobre o jogo).
 * Estados: livre (mira no chão) · alvo (inimigo sob o cursor) · devorar (lobo sobre um corpo) · carga (anel enche).
 * Na câmera livre vira um ponto discreto no centro da tela.
 */
export type ReticleState = 'idle' | 'enemy' | 'eat';

export class Reticle {
  readonly el: HTMLDivElement;
  private ring: HTMLDivElement;
  private label: HTMLDivElement;
  private state: ReticleState | null = null;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'reticle hidden';
    this.el.innerHTML = `
      <svg viewBox="-24 -24 48 48" aria-hidden="true">
        <circle class="reticle__dot" r="2.2"/>
        <path class="reticle__ticks" d="M0 -17 V-10 M0 10 V17 M-17 0 H-10 M10 0 H17"/>
        <path class="reticle__brackets" d="M-15 -8 V-15 H-8 M8 -15 H15 V-8 M15 8 V15 H8 M-8 15 H-15 V8"/>
        <path class="reticle__fang" d="M-7 -6 L-3 7 L0 -2 L3 7 L7 -6"/>
      </svg>
      <div class="reticle__ring"></div>
      <div class="reticle__label"></div>`;
    root.appendChild(this.el);
    this.ring = this.el.querySelector('.reticle__ring') as HTMLDivElement;
    this.label = this.el.querySelector('.reticle__label') as HTMLDivElement;
  }

  /** `free` = câmera livre: ponto fixo no centro. */
  update(visible: boolean, x: number, y: number, state: ReticleState, charge: number, free: boolean): void {
    this.el.classList.toggle('hidden', !visible);
    if (!visible) return;
    this.el.classList.toggle('reticle--free', free);
    this.el.style.transform = free ? 'translate(-50%, -50%)' : `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    if (state !== this.state) {
      this.state = state;
      this.el.dataset.state = state;
      this.label.textContent = state === 'eat' ? 'DEVORAR' : '';
    }
    this.ring.style.setProperty('--charge', String(Math.max(0, Math.min(1, charge))));
    this.ring.classList.toggle('on', charge > 0.01);
  }
}
