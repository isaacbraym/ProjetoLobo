import './presentation/ui/styles.css';
import { showGate } from './presentation/ui/gate';
import { isTouchDevice, type QualityName } from './engine/render/quality';
import { audio } from './engine/audio/audio';
import { createControlsPanel } from './presentation/ui/controlsPanel';

const params = new URLSearchParams(location.search);
const AUTOTEST = params.has('autotest') && ['localhost', '127.0.0.1'].includes(location.hostname);

const TIPS = [
  'Clique esquerdo soca, clique direito chuta. SEGURE e solte para o golpe FORTE.',
  'O mouse escolhe em quem bater: o capanga sob o cursor fica destacado. G troca para a câmera livre.',
  'Quando o indicador vermelho acender sobre um capanga, toque SHIFT na hora certa: câmera lenta e contra-ataque.',
  'O Brutamontes aguenta socos leves sem parar o golpe. Segure o clique para quebrar a postura dele.',
  'A barra laranja é a raiva do Márcio. Quando encher, ESPAÇO... FALA LOBINHO. Como lobo, clique direito num corpo para devorar.',
];

async function boot(): Promise<void> {
  const ui = document.getElementById('ui')!;
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  await showGate(ui);

  // ---- carregamento (só depois da senha) ----
  const loader = document.createElement('div');
  loader.className = 'screen loader';
  loader.innerHTML = `<div class="loader__label">CARREGANDO O PRÉDIO…</div><div class="loader__bar"><div class="loader__fill"></div></div><div class="loader__tip">${TIPS[Math.floor(Math.random() * TIPS.length)]}</div>`;
  ui.appendChild(loader);
  const fill = loader.querySelector('.loader__fill') as HTMLDivElement;
  const { Game } = await import('./game/game');
  const game = new Game(canvas, ui);
  await game.load((f) => (fill.style.width = `${Math.round(f * 100)}%`));
  fill.style.width = '100%';

  const { PerfOverlay } = await import('./dev/perfOverlay');
  const perf = new PerfOverlay(game, params.has('perf'));
  // amostra de FPS por frame
  let last = performance.now();
  const sample = () => {
    const now = performance.now();
    perf.tick((now - last) / 1000);
    last = now;
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  if (import.meta.env.DEV || AUTOTEST) {
    const { installDebugApi } = await import('./dev/debugApi');
    installDebugApi(game, perf);
  }

  loader.remove();
  game.startBackground();

  // overlay de rotação no celular em retrato
  const rotate = document.createElement('div');
  rotate.className = 'rotate';
  rotate.innerHTML = '<div><div class="rotate__phone"></div><div class="rotate__txt">GIRE O CELULAR</div></div>';
  ui.appendChild(rotate);

  const touch = isTouchDevice();
  let touchCtl: ReturnType<typeof import('./presentation/ui/touchControls').installTouchControls> | null = null;

  // ---- painel de controles (menu e pausa) ----
  const openControls = () => {
    const panel = createControlsPanel({ camMode: () => game.input.camMode, touch, onClose: () => panel.remove() });
    ui.appendChild(panel);
  };

  // ---- pausa: Esc / Start, ou o navegador soltou o cursor preso (câmera livre) ----
  let pauseEl: HTMLDivElement | null = null;
  const resume = () => {
    pauseEl?.remove();
    pauseEl = null;
    game.loop.paused = false;
    if (game.input.camMode === 'free') game.input.requestPointerLock();
  };
  const pause = () => {
    if (pauseEl || !game.started) return;
    game.loop.paused = true;
    if (document.pointerLockElement) document.exitPointerLock?.();
    pauseEl = document.createElement('div');
    pauseEl.className = 'pause';
    pauseEl.innerHTML = `<div class="pause__box"><h2>PAUSA</h2>
      <button class="menu__btn" data-p="resume">CONTINUAR</button>
      <button class="menu__btn" data-p="cam">CÂMERA: ${game.input.camMode === 'aim' ? 'MIRA' : 'LIVRE'}</button>
      <button class="menu__btn" data-p="controls">CONTROLES</button></div>`;
    ui.appendChild(pauseEl);
    pauseEl.querySelector('[data-p="resume"]')!.addEventListener('click', resume);
    pauseEl.querySelector('[data-p="controls"]')!.addEventListener('click', openControls);
    const camBtn = pauseEl.querySelector('[data-p="cam"]') as HTMLButtonElement;
    camBtn.addEventListener('click', () => {
      game.input.setCamMode(game.input.camMode === 'aim' ? 'free' : 'aim');
      if (document.pointerLockElement) document.exitPointerLock?.();
      camBtn.textContent = `CÂMERA: ${game.input.camMode === 'aim' ? 'MIRA' : 'LIVRE'}`;
    });
  };
  game.onPauseRequest = () => (pauseEl ? resume() : pause());
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && game.started && game.input.camMode === 'free' && !touch && !AUTOTEST) pause();
  });

  const begin = async () => {
    audio.unlock();
    if (touch) {
      try {
        await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      } catch {
        /* sem fullscreen (iOS) */
      }
      try {
        await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
      } catch {
        /* sem lock: overlay de rotação cobre */
      }
      rotate.classList.add('armed');
      const { installTouchControls } = await import('./presentation/ui/touchControls');
      touchCtl = installTouchControls(ui, game.input);
    } else {
      // Ctrl+W fecha a aba (Ctrl é o botão contextual): tela cheia + Keyboard Lock captura o atalho no Chrome/Edge
      try {
        await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      } catch {
        /* recusou a tela cheia: o aviso de saída ainda protege */
      }
      try {
        await (navigator as unknown as { keyboard?: { lock?: (keys?: string[]) => Promise<void> } }).keyboard?.lock?.();
      } catch {
        /* sem Keyboard Lock (Firefox/Safari): use C no lugar do Ctrl */
      }
      game.input.requestPointerLock();
    }
    window.addEventListener('beforeunload', (e) => {
      if (!game.started) return;
      e.preventDefault();
      e.returnValue = '';
    });
    game.start();
  };

  if (AUTOTEST) {
    audio.unlock();
    if (!params.has('menu')) {
      game.start();
      if (params.has('bot')) (window as unknown as { __LOBO__?: { bot(on: boolean): void } }).__LOBO__?.bot(true);
      return;
    }
  }

  // ---- menu ----
  const menu = document.createElement('div');
  menu.className = 'screen menu';
  const q = game.renderer.preset.name;
  menu.innerHTML = `
    <h1 class="menu__title">MÁRCIO</h1>
    <div class="menu__tag">o prédio errado no dia errado</div>
    <button class="menu__btn" data-act="play">JOGAR</button>
    <button class="menu__btn" data-act="controls">CONTROLES</button>
    <div class="menu__row">Dificuldade:
      <button class="chip" data-diff="easy">Fácil</button><button class="chip on" data-diff="normal">Normal</button><button class="chip" data-diff="hard">Difícil</button>
    </div>
    <div class="menu__row">Qualidade:
      ${(['low', 'medium', 'high', 'ultra'] as QualityName[]).map((n) => `<button class="chip ${n === q ? 'on' : ''}" data-q="${n}">${{ low: 'Baixa', medium: 'Média', high: 'Alta', ultra: 'Ultra' }[n]}</button>`).join('')}
    </div>
`;
  ui.appendChild(menu);
  menu.querySelectorAll<HTMLButtonElement>('[data-diff]').forEach((b) =>
    b.addEventListener('click', () => {
      menu.querySelectorAll('[data-diff]').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      game.applyDifficulty(b.dataset.diff as 'easy' | 'normal' | 'hard');
    }),
  );
  menu.querySelectorAll<HTMLButtonElement>('[data-q]').forEach((b) =>
    b.addEventListener('click', () => {
      menu.querySelectorAll('[data-q]').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      game.renderer.setQuality(b.dataset.q as QualityName);
    }),
  );
  menu.querySelector('[data-act="controls"]')!.addEventListener('click', openControls);
  menu.querySelector('[data-act="play"]')!.addEventListener('click', () => {
    menu.remove();
    void begin();
  });
  void touchCtl;
}

boot().catch((e) => {
  console.error(e);
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;color:#ff2d43;font:20px sans-serif;padding:24px;text-align:center;background:#0b0a0d;z-index:999';
  div.textContent = 'Erro ao iniciar: ' + (e instanceof Error ? e.message : String(e));
  document.body.appendChild(div);
});
