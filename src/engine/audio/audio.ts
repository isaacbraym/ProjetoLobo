import { rngs } from '../../core/rng';
import { assetUrl } from '../assets/loader';

/**
 * Mixer WebAudio: buses music/sfx/voice/ui, ducking da música quando a voz toca (transformação),
 * sons de impacto sintetizados (até a biblioteca de SFX CC0 entrar) e arquivos decodificados.
 */
export class AudioSystem {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private music!: GainNode;
  private musicDuck!: GainNode;
  private musicFilter!: BiquadFilterNode;
  private sfx!: GainNode;
  private voice!: GainNode;
  private noise!: AudioBuffer;
  private buffers = new Map<string, AudioBuffer>();
  private voicesActive = 0;
  volume = { master: 0.9, music: 0.6, sfx: 0.9, voice: 1.0 };

  /** Precisa de um gesto do usuário (política dos navegadores). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume.master;
    this.master.connect(comp).connect(ctx.destination);
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicDuck = ctx.createGain();
    this.music = ctx.createGain();
    this.music.gain.value = this.volume.music;
    this.music.connect(this.musicDuck).connect(this.musicFilter).connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.volume.sfx;
    this.sfx.connect(this.master);
    this.voice = ctx.createGain();
    this.voice.gain.value = this.volume.voice;
    this.voice.connect(this.master);
    const len = ctx.sampleRate * 1;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  get musicBus(): GainNode | null {
    return this.ctx ? this.music : null;
  }

  async loadBuffer(id: string, path: string): Promise<void> {
    if (!this.ctx || this.buffers.has(id)) return;
    try {
      const res = await fetch(assetUrl(path));
      const arr = await res.arrayBuffer();
      this.buffers.set(id, await this.ctx.decodeAudioData(arr));
    } catch (e) {
      console.warn('[audio] falha ao carregar', path, e);
    }
  }

  /**
   * Toca uma voz com ducking forte da música (−18 dB, ataque 40 ms, liberação 600 ms) + passa-baixa.
   * Usado pelo "FALA LOBINHO" da transformação.
   */
  playVoice(id: string, duckDb = -18): number {
    const ctx = this.ctx;
    const buf = this.buffers.get(id);
    if (!ctx || !buf) return 0;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voice);
    const now = ctx.currentTime;
    const duck = Math.pow(10, duckDb / 20);
    const g = this.musicDuck.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(duck, now + 0.04);
    g.setValueAtTime(duck, now + buf.duration);
    g.linearRampToValueAtTime(1, now + buf.duration + 0.6);
    const f = this.musicFilter.frequency;
    f.cancelScheduledValues(now);
    f.setValueAtTime(f.value, now);
    f.exponentialRampToValueAtTime(700, now + 0.06);
    f.setValueAtTime(700, now + buf.duration);
    f.exponentialRampToValueAtTime(20000, now + buf.duration + 0.6);
    src.start(now);
    return buf.duration;
  }

  /** Nível atual de ducking (para testes automáticos): 1 = sem ducking. */
  get duckLevel(): number {
    return this.musicDuck ? this.musicDuck.gain.value : 1;
  }

  playBuffer(id: string, volume = 1, rate = 1): void {
    const ctx = this.ctx;
    const buf = this.buffers.get(id);
    if (!ctx || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = volume;
    src.connect(g).connect(this.sfx);
    src.start();
  }

  /** SFX sintetizado por nome lógico (data/audio no futuro mapeia nome → arquivos). */
  play(name: string, intensity = 1): void {
    const ctx = this.ctx;
    if (!ctx || this.voicesActive > 24) return;
    const r = rngs.audio;
    const pitch = r.range(0.9, 1.12);
    switch (name) {
      case 'punch':
        this.thump(70 * pitch, 0.12, 0.9 * intensity);
        this.noiseHit(1800 * pitch, 1.2, 0.07, 0.55 * intensity);
        this.noiseHit(4200 * pitch, 3, 0.02, 0.25 * intensity);
        break;
      case 'punchHeavy':
        this.thump(55 * pitch, 0.22, 1.2 * intensity);
        this.noiseHit(1200 * pitch, 0.9, 0.12, 0.7 * intensity);
        this.noiseHit(3000 * pitch, 2, 0.04, 0.35 * intensity);
        break;
      case 'kick':
        this.thump(60 * pitch, 0.18, 1.1 * intensity);
        this.noiseHit(900 * pitch, 0.8, 0.1, 0.6 * intensity);
        break;
      case 'whoosh':
        this.sweep(600 * pitch, 2400 * pitch, 0.16, 0.18 * intensity);
        break;
      case 'whooshHeavy':
        this.sweep(300 * pitch, 1500 * pitch, 0.26, 0.3 * intensity);
        break;
      case 'bodyfall':
        this.thump(48 * pitch, 0.3, 0.9 * intensity);
        this.noiseHit(500, 0.7, 0.15, 0.35 * intensity);
        break;
      case 'step':
        this.noiseHit(2200 * pitch, 2, 0.03, 0.06 * intensity);
        break;
      case 'ui':
        this.thump(660, 0.05, 0.2);
        break;
    }
  }

  private track(node: AudioScheduledSourceNode): void {
    this.voicesActive++;
    node.onended = () => this.voicesActive--;
  }

  private thump(freq: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 2.2, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    this.track(o);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseHit(freq: number, q: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.playbackRate.value = rngs.audio.range(0.8, 1.2);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    this.track(s);
    s.start(t, rngs.audio.range(0, 0.5));
    s.stop(t + dur + 0.02);
  }

  private sweep(f0: number, f1: number, dur: number, vol: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    this.track(s);
    s.start(t, rngs.audio.range(0, 0.5));
    s.stop(t + dur + 0.02);
  }
}

export const audio = new AudioSystem();
