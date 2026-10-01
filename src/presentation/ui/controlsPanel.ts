/**
 * Menu → CONTROLES (DEC-0016): tabela clara por dispositivo, com ícones de mouse/teclas/botões desenhados em SVG/CSS,
 * o modo de câmera atual, a dica do G, o "segurar = forte", o "clique direito no corpo para comer" e o aviso do Ctrl.
 */
type Device = 'kbm' | 'pad' | 'touch';

const mouse = (btn: 'left' | 'right' | 'middle') => `
  <svg class="ico ico--mouse" viewBox="0 0 40 56" aria-hidden="true">
    <rect x="2" y="2" width="36" height="52" rx="18" class="m-body"/>
    <path d="M20 2 V22 M2 22 H38" class="m-line"/>
    <path d="M2 22 V20 A18 18 0 0 1 20 2 V22 Z" class="${btn === 'left' ? 'm-hot' : 'm-btn'}"/>
    <path d="M38 22 V20 A18 18 0 0 0 20 2 V22 Z" class="${btn === 'right' ? 'm-hot' : 'm-btn'}"/>
    <rect x="17" y="8" width="6" height="10" rx="3" class="${btn === 'middle' ? 'm-hot' : 'm-wheel'}"/>
  </svg>`;
const key = (k: string, wide = false) => `<kbd class="key${wide ? ' key--wide' : ''}">${k}</kbd>`;
const pad = (b: string, cls = '') => `<span class="padbtn ${cls}">${b}</span>`;
const tbtn = (b: string) => `<span class="tchip">${b}</span>`;

interface Row {
  ico: string;
  act: string;
  note?: string;
}

const ROWS: Record<Device, Row[]> = {
  kbm: [
    { ico: `${key('W')}${key('A')}${key('S')}${key('D')}`, act: 'Mover' },
    { ico: mouse('left'), act: 'Soco', note: 'toque = soco rápido · <b>segure e solte</b> = SOCO FORTE (carrega)' },
    { ico: mouse('right'), act: 'Chute', note: 'toque = chute · <b>segure e solte</b> = CHUTE FORTE' },
    { ico: key('Shift', true), act: 'Esquiva / correr', note: 'toque = rolamento · segure = correr' },
    { ico: `${key('Ctrl', true)}<span class="or">ou</span>${key('C')}`, act: 'Agarrar · pegar · finalizar', note: 'contextual (aparece a dica na tela)' },
    { ico: `${key('Espaço', true)}<span class="or">ou</span>${key('F')}`, act: 'Especial', note: 'barra cheia = vira LOBISOMEM · como lobo = rugido em área' },
    { ico: mouse('right'), act: 'Lobo: devorar', note: '<b>clique direito em cima de um corpo</b> (ou inimigo caído): cura e mais tempo de lobo' },
    { ico: key('G'), act: 'Trocar câmera', note: 'câmera-mira ↔ câmera livre' },
    { ico: key('Esc'), act: 'Pausa' },
  ],
  pad: [
    { ico: pad('L', 'padbtn--stick'), act: 'Mover', note: 'no máximo (ou L3) = correr' },
    { ico: pad('R', 'padbtn--stick'), act: 'Câmera' },
    { ico: pad('X', 'padbtn--x'), act: 'Soco', note: 'segure e solte = SOCO FORTE' },
    { ico: pad('B', 'padbtn--b'), act: 'Chute', note: 'segure e solte = CHUTE FORTE · lobo perto de corpo = devorar' },
    { ico: pad('A', 'padbtn--a'), act: 'Esquiva' },
    { ico: pad('RB', 'padbtn--bumper'), act: 'Agarrar · pegar · finalizar' },
    { ico: `${pad('LT', 'padbtn--bumper')}+${pad('RT', 'padbtn--bumper')}`, act: 'Especial (lobisomem)' },
    { ico: pad('☰', 'padbtn--bumper'), act: 'Pausa' },
  ],
  touch: [
    { ico: tbtn('◎'), act: 'Mover', note: 'analógico em qualquer lugar da esquerda; empurre até o fim para correr' },
    { ico: tbtn('↔'), act: 'Câmera', note: 'arraste na metade direita' },
    { ico: tbtn('SOCO'), act: 'Soco', note: 'segure e solte = SOCO FORTE' },
    { ico: tbtn('CHUTE'), act: 'Chute', note: 'segure e solte = CHUTE FORTE · lobo perto de corpo = devorar' },
    { ico: tbtn('ESQUIVA'), act: 'Esquiva' },
    { ico: tbtn('PEGAR'), act: 'Agarrar · pegar · finalizar' },
    { ico: tbtn('LOBO'), act: 'Especial (lobisomem)' },
  ],
};

export function createControlsPanel(opts: { camMode: () => 'aim' | 'free'; touch: boolean; onClose: () => void }): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'controls';
  const tabs: [Device, string][] = [['kbm', 'Mouse + teclado'], ['pad', 'Controle'], ['touch', 'Toque']];
  const render = (dev: Device) => {
    const cam = opts.camMode();
    el.innerHTML = `
      <div class="controls__box" role="dialog" aria-label="Controles">
        <div class="controls__head">
          <h2>CONTROLES</h2>
          <button class="controls__close" aria-label="Fechar">✕</button>
        </div>
        <div class="controls__tabs">${tabs.map(([d, n]) => `<button class="chip ${d === dev ? 'on' : ''}" data-dev="${d}">${n}</button>`).join('')}</div>
        <div class="controls__rows">${ROWS[dev].map((r) => `<div class="crow"><div class="crow__ico">${r.ico}</div><div class="crow__act">${r.act}</div><div class="crow__note">${r.note ?? ''}</div></div>`).join('')}</div>
        ${dev === 'kbm' ? `
        <div class="controls__notes">
          <div class="cnote"><b>Câmera atual: ${cam === 'aim' ? 'CÂMERA-MIRA' : 'CÂMERA LIVRE'}</b> — ${cam === 'aim' ? 'o cursor fica visível e <b>escolhe em quem bater</b> (o inimigo sob o cursor fica destacado; sem inimigo, o golpe vai para onde o cursor aponta). A câmera segue o Márcio e gira devagar com o cursor na borda (ou arrastando com o botão do meio).' : 'o mouse gira a câmera (cursor preso); o golpe vai no inimigo na direção em que você anda/olha.'} Aperte <b>G</b> para trocar.</div>
          <div class="cnote cnote--warn">⚠ <b>Ctrl + W fecha a aba</b> do navegador. Ao clicar JOGAR o jogo entra em <b>tela cheia</b> e trava o teclado (Chrome/Edge) para o Ctrl funcionar; se preferir, use <b>C</b> no lugar do Ctrl.</div>
        </div>` : ''}
      </div>`;
    el.querySelectorAll<HTMLButtonElement>('[data-dev]').forEach((b) => b.addEventListener('click', () => render(b.dataset.dev as Device)));
    el.querySelector('.controls__close')!.addEventListener('click', () => opts.onClose());
  };
  render(opts.touch ? 'touch' : 'kbm');
  el.addEventListener('click', (e) => {
    if (e.target === el) opts.onClose();
  });
  return el;
}
