/** Sobreposição de cinemática: faixas pretas (letterbox), legendas, título estilizado e dica de pular. */
export class CineOverlay {
  readonly el: HTMLDivElement;
  private caption: HTMLDivElement;
  private title: HTMLDivElement;
  private skip: HTMLDivElement;
  private capT = 0;
  private titleT = 0;

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'cine';
    this.el.innerHTML = `
      <div class="cine__bar cine__bar--top"></div>
      <div class="cine__bar cine__bar--bottom"></div>
      <div class="cine__caption"></div>
      <div class="cine__title"></div>
      <div class="cine__skip">qualquer tecla para pular</div>`;
    root.appendChild(this.el);
    this.caption = this.el.querySelector('.cine__caption') as HTMLDivElement;
    this.title = this.el.querySelector('.cine__title') as HTMLDivElement;
    this.skip = this.el.querySelector('.cine__skip') as HTMLDivElement;
  }

  show(on: boolean): void {
    this.el.classList.toggle('on', on);
    if (!on) {
      this.caption.classList.remove('on');
      this.title.classList.remove('on');
      this.skip.classList.remove('on');
    }
  }

  setSkippable(on: boolean): void {
    this.skip.classList.toggle('on', on);
  }

  say(text: string, who: string | undefined, style: 'line' | 'location' = 'line', dur = 2.5): void {
    this.caption.className = `cine__caption cine__caption--${style}`;
    this.caption.innerHTML = who ? `<b>${who}</b> ${text}` : text;
    void this.caption.offsetWidth;
    this.caption.classList.add('on');
    this.capT = dur;
  }

  showTitle(text: string, sub = '', dur = 3): void {
    this.title.innerHTML = `<span>${text}</span>${sub ? `<small>${sub}</small>` : ''}`;
    this.title.classList.remove('on');
    void this.title.offsetWidth;
    this.title.classList.add('on');
    this.titleT = dur;
  }

  update(dt: number): void {
    if (this.capT > 0) {
      this.capT -= dt;
      if (this.capT <= 0) this.caption.classList.remove('on');
    }
    if (this.titleT > 0) {
      this.titleT -= dt;
      if (this.titleT <= 0) this.title.classList.remove('on');
    }
  }
}
