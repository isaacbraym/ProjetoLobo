import { GATE_HASH, GATE_LENGTH, GATE_SALT } from './gateHash';

const STORAGE_KEY = 'lobo_gate_v1';

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isLocalHost(): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

export function gateBypassed(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.has('autotest') && isLocalHost()) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === GATE_HASH;
  } catch {
    return false;
  }
}

/** Mostra o gate e resolve quando a senha estiver correta. Nada pesado é carregado antes disso. */
export function showGate(root: HTMLElement): Promise<void> {
  if (gateBypassed()) return Promise.resolve();
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'gate';
    el.innerHTML = `
      <div class="gate__box">
        <h1 class="gate__title">MÁRCIO</h1>
        <div class="gate__sub">acesso restrito</div>
        <div class="gate__pins">${Array.from({ length: GATE_LENGTH }, (_, i) => `<input class="gate__pin" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="Dígito ${i + 1}" />`).join('')}</div>
        <div class="gate__msg">digite a senha</div>
      </div>`;
    root.appendChild(el);
    const pins = Array.from(el.querySelectorAll<HTMLInputElement>('.gate__pin'));
    const msg = el.querySelector<HTMLDivElement>('.gate__msg')!;
    pins[0]?.focus();

    const check = async () => {
      const value = pins.map((p) => p.value).join('');
      if (value.length < GATE_LENGTH) return;
      const h = await sha256Hex(GATE_SALT + value);
      if (h === GATE_HASH) {
        try {
          localStorage.setItem(STORAGE_KEY, GATE_HASH);
        } catch {
          /* modo privado */
        }
        msg.textContent = 'bem-vindo';
        msg.classList.remove('err');
        el.classList.add('ok');
        setTimeout(() => {
          el.remove();
          resolve();
        }, 600);
      } else {
        msg.textContent = 'senha errada';
        msg.classList.add('err');
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        pins.forEach((p) => {
          p.value = '';
          p.classList.remove('filled');
        });
        pins[0]?.focus();
      }
    };

    pins.forEach((pin, i) => {
      pin.addEventListener('input', () => {
        pin.value = pin.value.replace(/\D/g, '').slice(-1);
        pin.classList.toggle('filled', pin.value !== '');
        if (pin.value && i < pins.length - 1) pins[i + 1]!.focus();
        void check();
      });
      pin.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !pin.value && i > 0) {
          pins[i - 1]!.focus();
          pins[i - 1]!.value = '';
          pins[i - 1]!.classList.remove('filled');
        }
      });
      pin.addEventListener('paste', (e) => {
        const t = (e.clipboardData?.getData('text') ?? '').replace(/\D/g, '');
        if (!t) return;
        e.preventDefault();
        pins.forEach((p, j) => {
          p.value = t[j] ?? '';
          p.classList.toggle('filled', p.value !== '');
        });
        void check();
      });
    });
  });
}
