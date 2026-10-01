import * as THREE from 'three';

export interface ScreenTexture {
  texture: THREE.CanvasTexture;
  update(dt: number): void;
}

const HEADLINES = [
  'PRÉDIO SITIADO NO CENTRO — REFÉNS NO EDIFÍCIO VÉRTICE',
  'TESTEMUNHAS RELATAM "UM TIOZÃO DE POLO VERDE" ENTRANDO SOZINHO',
  'POLÍCIA AGUARDA NEGOCIAÇÃO — CRIMINOSOS EXIGEM RESGATE',
  'AÇÕES DA VÉRTICE DESPENCAM 38% NO PREGÃO',
  'URGENTE: GRITOS E UIVOS OUVIDOS NO TÉRREO',
];

/** Telejornal procedural para TVs (10 fps). Conteúdo é ambientação, substituível por vídeo depois. */
export function createNewsScreen(): ScreenTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 288;
  const ctx = c.getContext('2d')!;
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  let t = Math.random() * 10;
  let acc = 0;
  let headline = Math.floor(Math.random() * HEADLINES.length);
  const draw = () => {
    const g = ctx.createLinearGradient(0, 0, 512, 288);
    g.addColorStop(0, '#0c1a3a');
    g.addColorStop(1, '#1d0d1f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 288);
    // "câmera aérea" do prédio
    ctx.fillStyle = '#1a2440';
    ctx.fillRect(160, 40, 190, 170);
    for (let y = 50; y < 200; y += 14) for (let x = 172; x < 340; x += 16) {
      ctx.fillStyle = Math.sin(x * 0.3 + y + t * 2) > 0.6 ? '#ffcf7a' : '#2b3a66';
      ctx.fillRect(x, y, 9, 7);
    }
    // luzes de viatura
    ctx.fillStyle = Math.sin(t * 10) > 0 ? '#ff2d43' : '#2d6bff';
    ctx.fillRect(120 + Math.sin(t) * 6, 200, 26, 8);
    ctx.fillRect(380, 204, 26, 8);
    // tarja AO VIVO
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(16, 16, 92, 26);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px "Barlow Condensed", sans-serif';
    ctx.fillText('● AO VIVO', 24, 35);
    // letreiro
    ctx.fillStyle = '#c8102e';
    ctx.fillRect(0, 226, 512, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "Barlow Condensed", sans-serif';
    const text = HEADLINES[headline]!;
    const w = ctx.measureText(text).width;
    const x = 512 - ((t * 90) % (w + 512));
    ctx.fillText(text, x, 248);
    ctx.fillStyle = '#0b0a0d';
    ctx.fillRect(0, 256, 512, 32);
    ctx.fillStyle = '#ffb02e';
    ctx.font = 'bold 16px "Barlow Condensed", sans-serif';
    ctx.fillText('JORNAL DA CIDADE  •  21:47', 14, 278);
    if (x < -w + 10) headline = (headline + 1) % HEADLINES.length;
    texture.needsUpdate = true;
  };
  draw();
  return {
    texture,
    update(dt: number) {
      t += dt;
      acc += dt;
      if (acc >= 0.1) {
        acc = 0;
        draw();
      }
    },
  };
}
