import * as THREE from 'three';
import {
  BloomEffect,
  ChromaticAberrationEffect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  BrightnessContrastEffect,
  HueSaturationEffect,
} from 'postprocessing';
import { PRESETS, type QualityName, type QualityPreset, detectQuality, rendererString } from './quality';
import { clamp } from '../../core/math';

/** Renderer + pós-processo + DPR dinâmico. */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 400);
  composer!: EffectComposer;
  preset!: QualityPreset;
  private bloom?: BloomEffect;
  private chroma?: ChromaticAberrationEffect;
  private dpr = 1;
  private fpsAcc = 0;
  private fpsFrames = 0;
  readonly gpuName: string;
  /** Intensidade de aberração cromática momentânea (golpes pesados). */
  chromaKick = 0;
  private readonly fixedDpr = new URLSearchParams(location.search).has('fixeddpr');

  constructor(readonly canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      preserveDrawingBuffer: new URLSearchParams(location.search).has('autotest'),
    });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping; // tonemapping no pós
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.info.autoReset = false;
    const ctx = this.gl.getContext() as WebGL2RenderingContext;
    this.gpuName = rendererString(ctx);
    this.setQuality(detectQuality(ctx));
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(name: QualityName): void {
    this.preset = PRESETS[name];
    try {
      localStorage.setItem('lobo_quality', name);
    } catch {
      /* ok */
    }
    this.dpr = Math.min(window.devicePixelRatio || 1, this.preset.maxDpr);
    this.gl.shadowMap.enabled = this.preset.shadows !== 'blob';
    this.buildComposer();
    this.resize();
  }

  private buildComposer(): void {
    this.composer?.dispose();
    const p = this.preset;
    this.composer = new EffectComposer(this.gl, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const effects = [];
    if (p.bloom) {
      this.bloom = new BloomEffect({ intensity: 0.9, luminanceThreshold: 0.82, luminanceSmoothing: 0.25, mipmapBlur: true, radius: 0.7 });
      effects.push(this.bloom);
    } else this.bloom = undefined;
    effects.push(new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
    effects.push(new HueSaturationEffect({ saturation: 0.08 }));
    effects.push(new BrightnessContrastEffect({ contrast: 0.08 }));
    effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.62 }));
    if (p.smaa) effects.push(new SMAAEffect({ preset: SMAAPreset.MEDIUM }));
    this.composer.addPass(new EffectPass(this.camera, ...effects));
    if (p.chromatic) {
      this.chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.2 });
      this.composer.addPass(new EffectPass(this.camera, this.chroma));
    } else this.chroma = undefined;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(w, h, false);
    this.composer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Resolução dinâmica: ajusta o DPR em degraus para manter a meta do preset. */
  private adaptDpr(frameDt: number): void {
    this.fpsAcc += frameDt;
    this.fpsFrames++;
    if (this.fpsAcc < 1.5) return;
    const fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    const maxDpr = Math.min(window.devicePixelRatio || 1, this.preset.maxDpr);
    let next = this.dpr;
    if (fps < this.preset.targetFps - 6) next = this.dpr - 0.1;
    else if (fps > this.preset.targetFps + 1 && this.dpr < maxDpr) next = this.dpr + 0.05;
    next = clamp(next, this.preset.minDpr, maxDpr);
    if (Math.abs(next - this.dpr) > 0.01) {
      this.dpr = next;
      this.resize();
    }
  }

  get pixelRatio(): number {
    return this.dpr;
  }

  render(frameDt: number): void {
    if (this.chroma) {
      this.chromaKick = Math.max(0, this.chromaKick - frameDt * 6);
      const o = 0.0006 + this.chromaKick * 0.006;
      this.chroma.offset.set(o, o * 0.6);
    }
    this.gl.info.reset();
    this.composer.render(frameDt);
    if (!this.fixedDpr) this.adaptDpr(frameDt);
  }
}
