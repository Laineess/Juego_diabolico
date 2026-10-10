// Pantalla de entrada: nickname, color, partida rápida, lista de salas y
// creación de salas personalizadas (tiempo, rondas, armas, aforo).

const PRESET_COLORS = [
  '#e53935', '#fb8c00', '#fdd835', '#43a047',
  '#00acc1', '#1e88e5', '#8e24aa', '#f06292',
];

const WEAPON_OPTIONS = [
  ['random', 'Aleatorio'],
  ['sniper', 'Francotirador'],
  ['smg', 'Subfusil'],
  ['knife', 'Cuchillo'],
];

export class Lobby {
  constructor({ onPlay, onColorChange, onJoinRoom, onCreateRoom }) {
    this.onPlay = onPlay;
    this.onColorChange = onColorChange;
    this.onJoinRoom = onJoinRoom;
    this.onCreateRoom = onCreateRoom;

    this.root = document.getElementById('lobby');
    this.nickInput = document.getElementById('nick-input');
    this.colorInput = document.getElementById('color-input');
    this.swatches = document.getElementById('color-swatches');
    this.playBtn = document.getElementById('play-btn');
    this.status = document.getElementById('lobby-status');

    this.color = '#4fc3f7';
    this.weaponRows = [];

    this.buildSwatches();
    this.bindTabs();
    this.bindRooms();
    this.bindCreate();

    this.colorInput.addEventListener('input', () => {
      this.setColor(this.colorInput.value);
      this.markSelected(null);
    });
    this.playBtn.addEventListener('click', () => this.play());
    this.nickInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.play();
    });

    this.buildWeaponRows();
  }

  // --------------------------------------------------------------- color
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

  // --------------------------------------------------------------- tabs
  bindTabs() {
    this.tabs = {
      quick: [document.getElementById('tab-quick'), document.getElementById('tab-quick-panel')],
      rooms: [document.getElementById('tab-rooms'), document.getElementById('tab-rooms-panel')],
      create: [document.getElementById('tab-create'), document.getElementById('tab-create-panel')],
    };
    for (const [key, [btn]] of Object.entries(this.tabs)) {
      btn.addEventListener('click', () => this.showTab(key));
    }
  }

  showTab(key) {
    for (const [k, [btn, panel]] of Object.entries(this.tabs)) {
      const active = k === key;
      btn.classList.toggle('active', active);
      panel.classList.toggle('hidden', !active);
    }
    if (key === 'rooms') this.onRefreshRooms?.();
  }

  // --------------------------------------------------------------- salas
  bindRooms() {
    this.roomList = document.getElementById('room-list');
    this.roomsCount = document.getElementById('rooms-count');
    document.getElementById('rooms-refresh').addEventListener('click', () => this.onRefreshRooms?.());
  }

  setRooms(list) {
    this.rooms = list || [];
    this.roomsCount.textContent = `${this.rooms.length} sala${this.rooms.length === 1 ? '' : 's'}`;
    if (!this.rooms.length) {
      this.roomList.innerHTML = '<div class="room-empty">No hay salas disponibles. ¡Crea una!</div>';
      return;
    }
    this.roomList.innerHTML = '';
    for (const r of this.rooms) {
      const item = document.createElement('div');
      item.className = 'room-item';
      const full = r.players >= r.maxPlayers;
      item.innerHTML = `
        <div class="info">
          <div class="rname">${esc(r.name)}${r.isPrivate ? '<span class="tag">PRIVADA</span>' : ''}</div>
          <div class="rmeta">${r.players}/${r.maxPlayers} jugadores · ${r.rounds} rondas · ${fmtDuration(r.roundSeconds)}</div>
        </div>`;
      if (r.isPrivate) {
        const pw = document.createElement('input');
        pw.type = 'password';
        pw.placeholder = 'Clave';
        pw.className = 'room-pw';
        pw.style.width = '70px';
        pw.style.padding = '5px';
        pw.style.border = '1px solid #bbb';
        pw.style.borderRadius = '6px';
        item.appendChild(pw);
      }
      const btn = document.createElement('button');
      btn.className = 'join';
      btn.type = 'button';
      btn.textContent = full ? 'LLENA' : 'UNIRSE';
      btn.disabled = full;
      btn.addEventListener('click', () => {
        const pw = item.querySelector('.room-pw');
        this.enterRoom(r.id, pw ? pw.value : '');
      });
      item.appendChild(btn);
      this.roomList.appendChild(item);
    }
  }

  enterRoom(roomId, password) {
    const nick = this.validNick();
    if (!nick) return;
    this.setStatus('');
    this.setBusy(true);
    this.onJoinRoom?.(roomId, nick, this.color, password);
  }

  // --------------------------------------------------------------- crear
  bindCreate() {
    this.nameInput = document.getElementById('room-name');
    this.maxInput = document.getElementById('room-max');
    this.roundsInput = document.getElementById('room-rounds');
    this.roundSecondsInput = document.getElementById('room-round-seconds');
    this.intermissionInput = document.getElementById('room-intermission');
    this.weaponsWrap = document.getElementById('room-weapons');
    this.botsInput = document.getElementById('room-bots');
    this.waitReadyInput = document.getElementById('room-wait-ready');
    this.privateInput = document.getElementById('room-private');
    this.passwordInput = document.getElementById('room-password');
    this.createBtn = document.getElementById('create-btn');

    this.roundsInput.addEventListener('input', () => this.buildWeaponRows());
    this.privateInput.addEventListener('change', () => {
      this.passwordInput.classList.toggle('hidden', !this.privateInput.checked);
    });
    this.createBtn.addEventListener('click', () => this.createRoom());
  }

  buildWeaponRows() {
    const rounds = clamp(Number(this.roundsInput.value) || 3, 1, 10);
    this.roundsInput.value = rounds;
    const prev = this.weaponRows.map((r) => r.value);
    this.weaponsWrap.innerHTML = '';
    this.weaponRows = [];

    for (let i = 0; i < rounds; i++) {
      const row = document.createElement('div');
      row.className = 'weapon-row';
      const label = document.createElement('span');
      label.textContent = `Ronda ${i + 1}`;
      const select = document.createElement('select');
      for (const [value, text] of WEAPON_OPTIONS) {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = text;
        select.appendChild(opt);
      }
      select.value = prev[i] || 'random';
      row.appendChild(label);
      row.appendChild(select);
      this.weaponsWrap.appendChild(row);
      this.weaponRows.push(select);
    }
  }

  createRoom() {
    const nick = this.validNick();
    if (!nick) return;
    const config = {
      name: this.nameInput.value.trim() || 'Mi sala',
      maxPlayers: clamp(Number(this.maxInput.value) || 15, 2, 15),
      rounds: clamp(Number(this.roundsInput.value) || 3, 1, 10),
      roundSeconds: clamp(Number(this.roundSecondsInput.value) || 180, 30, 1800),
      intermissionSeconds: clamp(Number(this.intermissionInput.value) || 10, 3, 60),
      bots: this.botsInput.checked,
      waitForReady: this.waitReadyInput.checked,
      isPrivate: this.privateInput.checked,
      password: this.privateInput.checked ? this.passwordInput.value : '',
      roundWeapons: this.weaponRows.map((s) => s.value),
    };
    if (config.isPrivate && !config.password) {
      this.setStatus('Escribe una contraseña para la sala privada.');
      return;
    }
    this.setStatus('');
    this.setBusy(true);
    this.onCreateRoom?.(config, nick, this.color);
  }

  // ------------------------------------------------------------- helpers
  validNick() {
    const nick = this.nickInput.value.trim();
    if (nick.length < 2) {
      this.setStatus('Escribe un nickname de al menos 2 caracteres.');
      this.nickInput.focus();
      return null;
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(this.color)) {
      this.setStatus('Elige un color válido.');
      return null;
    }
    return nick;
  }

  play() {
    const nick = this.validNick();
    if (!nick) return;
    this.setStatus('');
    this.setBusy(true);
    this.onPlay?.(nick, this.color);
  }

  setStatus(msg) {
    this.status.textContent = msg || '';
  }

  setBusy(busy) {
    this.playBtn.disabled = busy;
    this.playBtn.textContent = busy ? 'CONECTANDO…' : 'JUGAR';
    if (this.createBtn) {
      this.createBtn.disabled = busy;
      this.createBtn.textContent = busy ? 'CREANDO…' : 'CREAR Y JUGAR';
    }
  }

  hide() { this.root.classList.add('hidden'); }

  show() {
    this.root.classList.remove('hidden');
    this.setBusy(false);
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function fmtDuration(secs) {
  const total = Math.max(0, Math.round(Number(secs) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')} min`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
