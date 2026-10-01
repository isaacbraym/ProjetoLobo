import './presentation/ui/styles.css';
import { showGate } from './presentation/ui/gate';
import { isTouchDevice, type QualityName } from './engine/render/quality';
import { audio } from './engine/audio/audio';

const params = new URLSearchParams(location.search);
const AUTOTEST = params.has('autotest') && ['localhost', '127.0.0.1'].includes(location.hostname);

const TIPS = [
  'Soco leve encadeia até 4 golpes. Misture com FORTE e CHUTE para variar a sequência.',
  'Quando o indicador vermelho acender sobre um capanga, ESQUIVE no tempo certo: câmera lenta e contra-ataque.',
  'O Brutamontes aguenta socos leves sem parar o golpe. Use FORTE ou CHUTE para quebrar a postura.',
  'A barra laranja é a raiva do Márcio. Quando encher... FALA LOBINHO.',
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
      game.input.requestPointerLock();
    }
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
    <div class="menu__row" data-controls style="display:none;max-width:560px;line-height:1.5">
      ${touch ? 'Analógico à esquerda · arraste à direita para a câmera · SOCO / FORTE / CHUTE / ESQUIVA.' : 'WASD mover · Mouse câmera · Clique esq. SOCO · Clique dir. FORTE · F CHUTE · Espaço ESQUIVA · Shift correr · R LOBO · Gamepad suportado.'}
    </div>`;
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
  menu.querySelector('[data-act="controls"]')!.addEventListener('click', () => {
    const c = menu.querySelector('[data-controls]') as HTMLDivElement;
    c.style.display = c.style.display === 'none' ? 'block' : 'none';
  });
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
