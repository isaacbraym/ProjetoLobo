/** Presets de qualidade: um jogo, sistemas escaláveis (docs/PERFORMANCE_PLAN.md §4). */
export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityPreset {
  name: QualityName;
  maxDpr: number;
  minDpr: number;
  shadows: 'blob' | 'single' | 'full';
  shadowMapSize: number;
  bloom: boolean;
  smaa: boolean;
  ssao: boolean;
  chromatic: boolean;
  textureMax: number;
  animLod: [near: number, mid: number, far: number];
  maxActiveEnemies: number;
  ragdollPool: number;
  decalPool: number;
  particleMax: number;
  furShells: number;
  targetFps: number;
}

export const PRESETS: Record<QualityName, QualityPreset> = {
  low: {
    name: 'low', maxDpr: 1.0, minDpr: 0.6, shadows: 'blob', shadowMapSize: 512, bloom: false, smaa: false, ssao: false,
    chromatic: false, textureMax: 512, animLod: [30, 15, 0], maxActiveEnemies: 4, ragdollPool: 2, decalPool: 64,
    particleMax: 600, furShells: 0, targetFps: 30,
  },
  medium: {
    name: 'medium', maxDpr: 1.5, minDpr: 0.75, shadows: 'single', shadowMapSize: 1024, bloom: true, smaa: false, ssao: false,
    chromatic: false, textureMax: 1024, animLod: [60, 20, 10], maxActiveEnemies: 6, ragdollPool: 3, decalPool: 128,
    particleMax: 1500, furShells: 8, targetFps: 50,
  },
  high: {
    name: 'high', maxDpr: 1.5, minDpr: 0.85, shadows: 'single', shadowMapSize: 2048, bloom: true, smaa: true, ssao: false,
    chromatic: true, textureMax: 2048, animLod: [60, 30, 15], maxActiveEnemies: 10, ragdollPool: 6, decalPool: 256,
    particleMax: 4000, furShells: 16, targetFps: 58,
  },
  ultra: {
    name: 'ultra', maxDpr: 2.0, minDpr: 1.0, shadows: 'full', shadowMapSize: 2048, bloom: true, smaa: true, ssao: true,
    chromatic: true, textureMax: 2048, animLod: [60, 60, 30], maxActiveEnemies: 12, ragdollPool: 8, decalPool: 384,
    particleMax: 6000, furShells: 16, targetFps: 58,
  },
};

export function isTouchDevice(): boolean {
  return typeof window !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window) && matchMedia('(pointer: coarse)').matches;
}

/** Escolha inicial heurística pelo renderer; o jogador pode trocar no menu. */
export function detectQuality(gl: WebGL2RenderingContext | null): QualityName {
  const forced = new URLSearchParams(location.search).get('quality') as QualityName | null;
  if (forced && forced in PRESETS) return forced;
  try {
    const saved = localStorage.getItem('lobo_quality') as QualityName | null;
    if (saved && saved in PRESETS) return saved;
  } catch {
    /* sem storage */
  }
  if (!gl) return 'low';
  let renderer = '';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  if (ext) renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  const r = renderer.toLowerCase();
  if (isTouchDevice()) {
    if (/apple gpu|adreno \(tm\) (7|8)\d\d|mali-g7[1-9]|mali-g[89]\d|immortalis/.test(r)) return 'medium';
    return 'low';
  }
  if (/rtx|radeon rx [67]\d\d\d|radeon pro|arc a7/.test(r)) return 'high';
  if (/intel|uhd|iris|swiftshader|llvmpipe/.test(r)) return 'medium';
  return 'high';
}

export function rendererString(gl: WebGL2RenderingContext | null): string {
  if (!gl) return 'none';
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown';
}
