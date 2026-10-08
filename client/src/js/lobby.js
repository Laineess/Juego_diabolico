// Pantalla de entrada: nickname, selector de color y vista previa.

const PRESET_COLORS = [
  '#e53935', '#fb8c00', '#fdd835', '#43a047',
  '#00acc1', '#1e88e5', '#8e24aa', '#f06292',
];

export class Lobby {
  constructor({ onPlay, onColorChange }) {
    this.onPlay = onPlay;
    this.onColorChange = onColorChange;

    this.root = document.getElementById('lobby');
    this.nickInput = document.getElementById('nick-input');
    this.colorInput = document.getElementById('color-input');
    this.swatches = document.getElementById('color-swatches');
    this.playBtn = document.getElementById('play-btn');
    this.status = document.getElementById('lobby-status');

    this.color = '#4fc3f7';
    this.buildSwatches();

    this.colorInput.addEventListener('input', () => {
      this.setColor(this.colorInput.value);
      this.markSelected(null);
    });
    this.playBtn.addEventListener('click', () => this.play());
    this.nickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.play();
    });
  }

  buildSwatches() {
    for (const color of PRESET_COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch';
      b.style.background = color;
      b.title = color;
      b.addEventListener('click', () => {
        this.setColor(color);
        this.markSelected(b);
      });
      this.swatches.appendChild(b);
    }
    this.markSelected(null);
  }

  markSelected(btn) {
    for (const el of this.swatches.children) el.classList.remove('selected');
    if (btn) btn.classList.add('selected');
  }

  setColor(color) {
    this.color = color;
    this.colorInput.value = color;
    this.onColorChange?.(color);
  }

  setStatus(msg) {
    this.status.textContent = msg || '';
  }

  setBusy(busy) {
    this.playBtn.disabled = busy;
    this.playBtn.textContent = busy ? 'CONECTANDO…' : 'JUGAR';
  }

  play() {
    const nick = this.nickInput.value.trim();
    if (nick.length < 2) {
      this.setStatus('Escribe un nickname de al menos 2 caracteres.');
      this.nickInput.focus();
      return;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(this.color)) {
      this.setStatus('Elige un color válido.');
      return;
    }
    this.setStatus('');
    this.setBusy(true);
    this.onPlay?.(nick, this.color);
  }

  hide() { this.root.classList.add('hidden'); }

  show() {
    this.root.classList.remove('hidden');
    this.setBusy(false);
  }
}
