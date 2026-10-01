/**
 * Entrada abstrata (DEC-0016, "poucos botões"): teclado/mouse, gamepad e toque viram as mesmas ações.
 *  - Clique esquerdo = soco (toque sai na hora; segurar carrega e soltar = soco forte).
 *  - Clique direito = chute (idem: chute forte). Shift = esquiva (toque) / correr (segurar).
 *  - Ctrl ou C = contextual (agarrar/pegar/finalizar) · Espaço ou F = especial (lobo) · G = câmera-mira ↔ livre.
 * Ações de "apertar" vão para um buffer curto (150–200 ms) consumido pelo combate.
 */
import { PressTracker, type PressEvent } from './pressTracker';

export type ButtonAction = 'light' | 'heavy' | 'kick' | 'kickHeavy' | 'dodge' | 'interact' | 'special' | 'camToggle' | 'pause' | 'sprint';
export type StrikeKind = 'punch' | 'kick';
export type CamMode = 'aim' | 'free';

const KEYMAP: Record<string, ButtonAction> = {
  ControlLeft: 'interact',
  ControlRight: 'interact',
  KeyC: 'interact',
  Space: 'special',
  KeyF: 'special',
  KeyG: 'camToggle',
  Escape: 'pause',
  // aliases silenciosos (esquema antigo; não aparecem no menu)
  KeyE: 'interact',
  KeyR: 'special',
};

const CAM_KEY = 'lobo.camMode';

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
  touchSprint = false;
  private padSprint = false;
  // ---- toque × segurar ----
  readonly punch = new PressTracker('strike');
  readonly kickT = new PressTracker('strike');
  readonly shift = new PressTracker('shift');
  private events: PressEvent[] = [];
  /** Golpe sendo carregado (segurando) e há quanto tempo passou do limite. */
  charging: StrikeKind | null = null;
  /** Tempo de carga do último golpe forte solto (s além do limite). */
  lastCharge = 0;
  // ---- cursor / modo de câmera ----
  camMode: CamMode = 'aim';
  /** Cursor em coordenadas normalizadas (-1..1, y para cima) e em pixels do canvas. */
  cursorNdcX = 0;
  cursorNdcY = 0;
  cursorPx = { x: 0, y: 0 };
  cursorInside = false;
  /** Bloqueia atalhos do navegador com Ctrl/Cmd enquanto o jogo roda (Ctrl+S/D/R/F…). */
  gameActive = false;
  private middleDrag = false;

  constructor(private canvas: HTMLElement) {
    try {
      const saved = localStorage.getItem(CAM_KEY);
      if (saved === 'aim' || saved === 'free') this.camMode = saved;
    } catch {
      /* sem storage (aba privada): fica no padrão */
    }
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.held.clear();
      this.punch.cancel();
      this.kickT.cancel();
      this.shift.cancel();
      this.charging = null;
    });
    canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseleave', () => (this.cursorInside = false));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      // pedido de lock da câmera livre que terminou depois de voltar para a câmera-mira: solta
      if (this.pointerLocked && this.camMode === 'aim') document.exitPointerLock?.();
    });
  }

  requestPointerLock(): void {
    if (this.usingTouch || this.camMode !== 'free') return;
    try {
      const p = this.canvas.requestPointerLock() as unknown;
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
    } catch {
      /* navegador recusou */
    }
  }

  /** Alterna câmera-mira ↔ livre e salva a escolha. */
  toggleCamMode(): CamMode {
    this.setCamMode(this.camMode === 'aim' ? 'free' : 'aim');
    return this.camMode;
  }

  setCamMode(m: CamMode): void {
    this.camMode = m;
    try {
      localStorage.setItem(CAM_KEY, m);
    } catch {
      /* ok */
    }
    if (m === 'aim' && document.pointerLockElement) document.exitPointerLock?.();
    if (m === 'free') this.requestPointerLock();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (this.gameActive && (e.ctrlKey || e.metaKey) && e.code !== 'ControlLeft' && e.code !== 'ControlRight') e.preventDefault();
    if (this.gameActive && (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'ControlLeft' || e.code === 'ControlRight')) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    this.usingGamepad = false;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      this.shift.press(this.events);
      this.flushEvents('shift');
      e.preventDefault();
      return;
    }
    const a = KEYMAP[e.code];
    if (a) this.press(a);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !this.keys.has('ShiftLeft') && !this.keys.has('ShiftRight')) {
      this.shift.release(this.events);
      this.flushEvents('shift');
      return;
    }
    const a = KEYMAP[e.code];
    if (a) this.release(a);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (this.usingTouch) return;
    this.usingGamepad = false;
    if (this.camMode === 'free' && !this.pointerLocked) this.requestPointerLock();
    if (e.button === 0) this.strikeDown('punch');
    else if (e.button === 2) this.strikeDown('kick');
    else if (e.button === 1) {
      this.middleDrag = true; // câmera-mira: arrastar com o botão do meio gira a câmera
      e.preventDefault();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.strikeUp('punch');
    else if (e.button === 2) this.strikeUp('kick');
    else if (e.button === 1) this.middleDrag = false;
  };

  private onMouseMove = (e: MouseEvent) => {
    if (this.pointerLocked) {
      this.lookDX += e.movementX * this.mouseSensitivity;
      this.lookDY += e.movementY * this.mouseSensitivity;
      return;
    }
    const r = this.canvas.getBoundingClientRect();
    this.cursorPx.x = e.clientX - r.left;
    this.cursorPx.y = e.clientY - r.top;
    this.cursorNdcX = (this.cursorPx.x / Math.max(1, r.width)) * 2 - 1;
    this.cursorNdcY = 1 - (this.cursorPx.y / Math.max(1, r.height)) * 2;
    this.cursorInside = this.cursorPx.x >= 0 && this.cursorPx.y >= 0 && this.cursorPx.x <= r.width && this.cursorPx.y <= r.height;
    if (this.middleDrag) {
      this.lookDX += e.movementX * this.mouseSensitivity;
      this.lookDY += e.movementY * this.mouseSensitivity * 0.5;
    }
  };

  /** Soco/chute físico (mouse, gamepad, toque) apertado/solto — passa pelo toque × segurar. */
  strikeDown(k: StrikeKind): void {
    (k === 'punch' ? this.punch : this.kickT).press(this.events);
    this.flushEvents(k);
  }

  strikeUp(k: StrikeKind): void {
    (k === 'punch' ? this.punch : this.kickT).release(this.events);
    this.flushEvents(k);
  }

  private flushEvents(k: StrikeKind | 'shift'): void {
    for (const ev of this.events) {
      if (k === 'shift') {
        if (ev.kind === 'tap') this.press('dodge'), this.release('dodge');
        continue;
      }
      if (ev.kind === 'tap') this.press(k === 'punch' ? 'light' : 'kick'), this.release(k === 'punch' ? 'light' : 'kick');
      else if (ev.kind === 'charge') this.charging = k;
      else if (ev.kind === 'release') {
        this.lastCharge = Math.max(0, ev.held - (k === 'punch' ? this.punch : this.kickT).holdAt);
        if (this.charging === k) this.charging = null;
        this.press(k === 'punch' ? 'heavy' : 'kickHeavy');
        this.release(k === 'punch' ? 'heavy' : 'kickHeavy');
      }
    }
    this.events.length = 0;
  }

  /** Tempo de carga do golpe sendo segurado (s além do limite). */
  chargeTime(): number {
    if (this.charging === 'punch') return this.punch.held - this.punch.holdAt;
    if (this.charging === 'kick') return this.kickT.held - this.kickT.holdAt;
    return 0;
  }

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
    // toque × segurar avança no tempo (carga começa sozinha ao passar do limite)
    this.punch.update(dt, this.events);
    this.flushEvents('punch');
    this.kickT.update(dt, this.events);
    this.flushEvents('kick');
    this.shift.update(dt, this.events);
    this.flushEvents('shift');

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
    if (this.shift.holding || this.padSprint || this.touchSprint) this.held.add('sprint');
    else this.held.delete('sprint');
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
    // padrão Xbox: 0 A esquiva · 1 B chute (segurar = forte) · 2 X soco (segurar = forte) · 3 Y soco forte direto ·
    // 5 RB contextual · 9 Start pausa · 10 L3 correr · LT+RT especial
    const edge = (i: number, down: () => void, up: () => void) => {
      const p = !!pad.buttons[i]?.pressed;
      if (p && !this.padPrev[i]) down();
      if (!p && this.padPrev[i]) up();
      this.padPrev[i] = p;
    };
    edge(0, () => this.press('dodge'), () => this.release('dodge'));
    edge(1, () => this.strikeDown('kick'), () => this.strikeUp('kick'));
    edge(2, () => this.strikeDown('punch'), () => this.strikeUp('punch'));
    edge(3, () => this.press('heavy'), () => this.release('heavy'));
    edge(5, () => this.press('interact'), () => this.release('interact'));
    edge(9, () => this.press('pause'), () => this.release('pause'));
    edge(10, () => {}, () => {});
    const lt = (pad.buttons[6]?.value ?? 0) > 0.5;
    const rt = (pad.buttons[7]?.value ?? 0) > 0.5;
    const both = lt && rt;
    if (both && !this.padPrev[99]) this.press('special');
    if (!both && this.padPrev[99]) this.release('special');
    this.padPrev[99] = both;
    // analógico no máximo ou L3 = correr
    this.padSprint = Math.hypot(lx, ly) > 0.95 || !!this.padPrev[10];
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
