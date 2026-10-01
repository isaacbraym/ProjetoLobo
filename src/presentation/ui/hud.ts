import * as THREE from 'three';
import type { Enemy } from '../../game/ai/enemy';

/** HUD em DOM: vida, vidas, barra do lobo, combo, avisos e barras sobre os inimigos. */
export class Hud {
  readonly el: HTMLDivElement;
  private hpFill: HTMLDivElement;
  private hpGhost: HTMLDivElement;
  private wolfBar: HTMLDivElement;
  private wolfFill: HTMLDivElement;
  private lives: HTMLDivElement;
  private combo: HTMLDivElement;
  private comboNum: HTMLSpanElement;
  private banner: HTMLDivElement;
  private hint: HTMLDivElement;
  private vignette: HTMLDivElement;
  private bars = new Map<Enemy, HTMLDivElement>();
  private barLayer: HTMLDivElement;
  private bannerTimer = 0;
  private v = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <div class="hud__tl">
        <div class="hud__name">MÁRCIO <div class="hud__lives"></div></div>
        <div class="bar"><div class="bar__ghost"></div><div class="bar__fill"></div></div>
        <div class="bar bar--wolf"><div class="bar__fill"></div></div>
      </div>
      <div class="hud__combo"><span>0</span><small>COMBO</small></div>
      <div class="hud__banner"></div>
      <div class="hud__hint"></div>
      <div class="hud__bars"></div>`;
    root.appendChild(this.el);
    this.vignette = document.createElement('div');
    this.vignette.className = 'vignette-hit';
    root.appendChild(this.vignette);
    const q = <T extends Element>(s: string) => this.el.querySelector(s) as T;
    this.hpFill = q('.bar:not(.bar--wolf) .bar__fill');
    this.hpGhost = q('.bar__ghost');
    this.wolfBar = q('.bar--wolf');
    this.wolfFill = q('.bar--wolf .bar__fill');
    this.lives = q('.hud__lives');
    this.combo = q('.hud__combo');
    this.comboNum = q('.hud__combo span');
    this.banner = q('.hud__banner');
    this.hint = q('.hud__hint');
    this.barLayer = q('.hud__bars');
  }

  setHealth(f: number): void {
    const s = `scaleX(${Math.max(0, Math.min(1, f))})`;
    this.hpFill.style.transform = s;
    this.hpGhost.style.transform = s;
  }

  setLives(n: number, max = 3): void {
    if (this.lives.childElementCount !== max) this.lives.innerHTML = Array.from({ length: max }, () => '<div class="hud__life"></div>').join('');
    Array.from(this.lives.children).forEach((c, i) => c.classList.toggle('off', i >= n));
  }

  setWolf(f: number, active: boolean): void {
    this.wolfFill.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`;
    this.wolfBar.classList.toggle('full', f >= 1 && !active);
    this.wolfBar.classList.toggle('active', active);
  }

  setCombo(n: number): void {
    this.combo.classList.toggle('on', n >= 3);
    this.comboNum.textContent = String(n);
  }

  showBanner(text: string, sub = '', seconds = 2): void {
    this.banner.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ''}`;
    this.banner.classList.add('on');
    this.bannerTimer = seconds;
  }

  setHint(text: string | null): void {
    if (text) this.hint.textContent = text;
    this.hint.classList.toggle('on', !!text);
  }

  damageFlash(): void {
    this.vignette.style.transition = 'none';
    this.vignette.style.opacity = '1';
    void this.vignette.offsetWidth;
    this.vignette.style.transition = 'opacity .45s';
    this.vignette.style.opacity = '0';
  }

  update(dt: number, enemies: Enemy[], camera: THREE.Camera, target: Enemy | null): void {
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.classList.remove('on');
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const e of enemies) {
      let bar = this.bars.get(e);
      const show = e.alive && (e.engaged && (e.lastHitTime < 4 || e === target || e.telegraphAmount > 0));
      if (!bar) {
        bar = document.createElement('div');
        bar.style.cssText = 'position:absolute;left:0;top:0;width:64px;pointer-events:none;transition:opacity .2s;will-change:transform';
        bar.innerHTML = `<div style="display:flex;gap:3px;justify-content:center;margin-bottom:3px">${'<i style="width:6px;height:6px;transform:rotate(45deg);background:#ffb02e;display:block"></i>'.repeat(e.def.tier)}</div>
          <div style="height:5px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.25)"><div class="f" style="height:100%;background:${e.def.bar};transform-origin:left"></div></div>
          <div class="tg" style="margin:4px auto 0;width:16px;height:16px;border-radius:50%;background:#ff2d43;box-shadow:0 0 12px #ff2d43;opacity:0;transform:scale(.4)"></div>`;
        this.barLayer.appendChild(bar);
        this.bars.set(e, bar);
      }
      if (!show) {
        bar.style.opacity = '0';
        if (!e.alive) {
          bar.remove();
          this.bars.delete(e);
        }
        continue;
      }
      e.actor.model.boneWorld('Head', this.v);
      this.v.y += 0.45;
      this.v.project(camera);
      if (this.v.z > 1) {
        bar.style.opacity = '0';
        continue;
      }
      const x = (this.v.x * 0.5 + 0.5) * w - 32;
      const y = (-this.v.y * 0.5 + 0.5) * h - 20;
      bar.style.opacity = '1';
      bar.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
      (bar.querySelector('.f') as HTMLDivElement).style.transform = `scaleX(${e.actor.hp / e.actor.maxHp})`;
      const tg = bar.querySelector('.tg') as HTMLDivElement;
      tg.style.opacity = String(e.telegraphAmount);
      tg.style.transform = `scale(${0.4 + e.telegraphAmount * 0.6})`;
    }
  }
}
