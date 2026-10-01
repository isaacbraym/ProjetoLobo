import type { Input, ButtonAction } from '../../engine/input/input';

/** Controles de toque: analógico flutuante (esq.), arrastar para câmera (dir.), botões de ação. */
export function installTouchControls(root: HTMLElement, input: Input): { setWolfReady(v: boolean): void; el: HTMLElement } {
  const el = document.createElement('div');
  el.className = 'touch';
  el.innerHTML = `
    <div class="touch__zone touch__zone--left"></div>
    <div class="touch__zone touch__zone--right"></div>
    <div class="touch__stick"><div class="touch__knob"></div></div>
    <div class="touch__btns">
      <div class="tbtn tbtn--light" data-a="light">SOCO</div>
      <div class="tbtn tbtn--heavy" data-a="heavy">FORTE</div>
      <div class="tbtn tbtn--kick" data-a="kick">CHUTE</div>
      <div class="tbtn tbtn--dodge" data-a="dodge">ESQUIVA</div>
      <div class="tbtn tbtn--interact" data-a="interact">PEGAR</div>
      <div class="tbtn tbtn--wolf" data-a="wolf">LOBO</div>
    </div>
    <div class="tbtn tbtn--pause" data-a="pause">❚❚</div>`;
  root.appendChild(el);
  input.usingTouch = true;
  const left = el.querySelector('.touch__zone--left') as HTMLDivElement;
  const right = el.querySelector('.touch__zone--right') as HTMLDivElement;
  const stick = el.querySelector('.touch__stick') as HTMLDivElement;
  const knob = el.querySelector('.touch__knob') as HTMLDivElement;
  let stickId: number | null = null;
  let sx = 0, sy = 0;
  const R = 56;
  left.addEventListener('pointerdown', (e) => {
    stickId = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    stick.style.left = sx + 'px';
    stick.style.top = sy + 'px';
    stick.classList.add('on');
    left.setPointerCapture(e.pointerId);
  });
  left.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    let dx = e.clientX - sx;
    let dy = e.clientY - sy;
    const l = Math.hypot(dx, dy);
    if (l > R) {
      dx = (dx / l) * R;
      dy = (dy / l) * R;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    input.touchMove.x = dx / R;
    input.touchMove.y = -dy / R;
    if (Math.hypot(dx, dy) > R * 0.95) input.held.add('sprint');
    else input.held.delete('sprint');
  });
  const endStick = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    input.touchMove.x = input.touchMove.y = 0;
    input.held.delete('sprint');
    stick.classList.remove('on');
    knob.style.transform = 'translate(-50%,-50%)';
  };
  left.addEventListener('pointerup', endStick);
  left.addEventListener('pointercancel', endStick);

  let camId: number | null = null;
  let lx = 0, ly = 0;
  right.addEventListener('pointerdown', (e) => {
    camId = e.pointerId;
    lx = e.clientX;
    ly = e.clientY;
    right.setPointerCapture(e.pointerId);
  });
  right.addEventListener('pointermove', (e) => {
    if (e.pointerId !== camId) return;
    input.lookDX += (e.clientX - lx) * 0.006;
    input.lookDY += (e.clientY - ly) * 0.004;
    lx = e.clientX;
    ly = e.clientY;
  });
  const endCam = (e: PointerEvent) => {
    if (e.pointerId === camId) camId = null;
  };
  right.addEventListener('pointerup', endCam);
  right.addEventListener('pointercancel', endCam);

  el.querySelectorAll<HTMLDivElement>('.tbtn').forEach((b) => {
    const a = b.dataset.a as ButtonAction;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      b.classList.add('down');
      input.press(a);
      navigator.vibrate?.(8);
    });
    const up = () => {
      b.classList.remove('down');
      input.release(a);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
  });
  const wolf = el.querySelector('.tbtn--wolf') as HTMLDivElement;
  return { setWolfReady: (v) => wolf.classList.toggle('ready', v), el };
}
