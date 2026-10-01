/**
 * Entrada abstrata: teclado/mouse, gamepad e toque viram as mesmas ações.
 * Ações de "pressionar" vão para um buffer curto (150–200 ms) consumido pelo combate.
 */
export type ButtonAction = 'light' | 'heavy' | 'kick' | 'dodge' | 'interact' | 'drop' | 'wolf' | 'pause' | 'sprint';

const KEYMAP: Record<string, ButtonAction> = {
  KeyF: 'kick',
  Space: 'dodge',
  KeyE: 'interact',
  KeyQ: 'drop',
  KeyR: 'wolf',
  Escape: 'pause',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  KeyJ: 'light',
  KeyK: 'heavy',
};

interface Buffered {
  action: ButtonAction;
  t: number;
}

export class Input {
  /** Movimento no plano (-1..1). y positivo = para frente. */
  moveX = 0;
  moveY = 0;
  /** Delta de câmera acumulado desde o último consumo (radianos aproximados). */
  lookDX = 0;
  lookDY = 0;
  readonly held = new Set<ButtonAction>();
  private buffer: Buffered[] = [];
  private keys = new Set<string>();
  bufferWindow = 0.18;
  private now = 0;
  pointerLocked = false;
  mouseSensitivity = 0.0024;
  usingGamepad = false;
  usingTouch = false;
  private padPrev: boolean[] = [];
  /** Estado virtual vindo dos controles de toque. */
  touchMove = { x: 0, y: 0 };
  heavyHeldTime = 0;

  constructor(private canvas: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.held.clear();
    });
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });
  }

  requestPointerLock(): void {
    if (this.usingTouch) return;
    try {
      const p = this.canvas.requestPointerLock() as unknown;
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
    } catch {
      /* navegador recusou */
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    this.usingGamepad = false;
    const a = KEYMAP[e.code];
    if (a) {
      this.press(a);
      if (a === 'dodge' || a === 'sprint') e.preventDefault();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    const a = KEYMAP[e.code];
    if (a) this.release(a);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.usingTouch) return;
    if (!this.pointerLocked) {
      this.requestPointerLock();
    }
    if (e.button === 0) this.press('light');
    else if (e.button === 2) this.press('heavy');
    else if (e.button === 1) this.press('kick');
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.release('light');
    else if (e.button === 2) this.release('heavy');
    else if (e.button === 1) this.release('kick');
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.lookDX += e.movementX * this.mouseSensitivity;
    this.lookDY += e.movementY * this.mouseSensitivity;
  };

  press(a: ButtonAction): void {
    if (!this.held.has(a)) {
      this.buffer.push({ action: a, t: this.now });
      if (this.buffer.length > 8) this.buffer.shift();
    }
    this.held.add(a);
  }

  release(a: ButtonAction): void {
    this.held.delete(a);
  }

  /** Chamado uma vez por frame antes da simulação. */
  poll(dt: number): void {
    this.now += dt;
    // expira buffer
    while (this.buffer.length && this.now - this.buffer[0]!.t > this.bufferWindow) this.buffer.shift();

    let mx = 0;
    let my = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my -= 1;
    if (mx !== 0 || my !== 0) {
      const l = Math.hypot(mx, my);
      mx /= l;
      my /= l;
    }
    if (this.usingTouch && (this.touchMove.x !== 0 || this.touchMove.y !== 0)) {
      mx = this.touchMove.x;
      my = this.touchMove.y;
    }
    this.pollGamepad(dt, (x, y) => {
      if (Math.hypot(x, y) > 0.15) {
        mx = x;
        my = y;
      }
    });
    this.moveX = mx;
    this.moveY = my;
    if (this.held.has('heavy')) this.heavyHeldTime += dt;
  }

  private pollGamepad(dt: number, setMove: (x: number, y: number) => void): void {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85);
    const lx = dz(pad.axes[0] ?? 0);
    const ly = dz(pad.axes[1] ?? 0);
    const rx = dz(pad.axes[2] ?? 0);
    const ry = dz(pad.axes[3] ?? 0);
    if (lx || ly || rx || ry || pad.buttons.some((b) => b.pressed)) this.usingGamepad = true;
    if (!this.usingGamepad) return;
    setMove(lx, -ly);
    this.lookDX += rx * 2.6 * dt;
    this.lookDY += ry * 1.8 * dt;
    // mapeamento padrão (Xbox): 0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 LT, 7 RT, 9 Start, 10 L3
    const map: [number, ButtonAction][] = [
      [0, 'dodge'],
      [1, 'kick'],
      [2, 'light'],
      [3, 'heavy'],
      [5, 'interact'],
      [4, 'drop'],
      [9, 'pause'],
      [10, 'sprint'],
    ];
    for (const [i, a] of map) {
      const p = !!pad.buttons[i]?.pressed;
      if (p && !this.padPrev[i]) this.press(a);
      if (!p && this.padPrev[i]) this.release(a);
      this.padPrev[i] = p;
    }
    const lt = (pad.buttons[6]?.value ?? 0) > 0.5;
    const rt = (pad.buttons[7]?.value ?? 0) > 0.5;
    const both = lt && rt;
    if (both && !this.padPrev[99]) this.press('wolf');
    if (!both && this.padPrev[99]) this.release('wolf');
    this.padPrev[99] = both;
    // analógico no máximo = correr
    if (Math.hypot(lx, ly) > 0.95) this.held.add('sprint');
    else if (!this.padPrev[10] && !this.keys.has('ShiftLeft')) this.held.delete('sprint');
  }

  /** Consome a ação mais antiga do buffer que esteja em `accept`. */
  consume(accept: (a: ButtonAction) => boolean): ButtonAction | null {
    for (let i = 0; i < this.buffer.length; i++) {
      const b = this.buffer[i]!;
      if (accept(b.action)) {
        this.buffer.splice(i, 1);
        return b.action;
      }
    }
    return null;
  }

  peek(a: ButtonAction): boolean {
    return this.buffer.some((b) => b.action === a);
  }

  clearBuffer(): void {
    this.buffer.length = 0;
  }

  takeLook(): { dx: number; dy: number } {
    const r = { dx: this.lookDX, dy: this.lookDY };
    this.lookDX = 0;
    this.lookDY = 0;
    return r;
  }

  isHeld(a: ButtonAction): boolean {
    return this.held.has(a);
  }
}
