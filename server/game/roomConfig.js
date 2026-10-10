// Configuración de salas: valores por defecto y saneado de las opciones que
// envía el cliente al crear una sala (tiempo, rondas, armas, aforo, etc.).

export const WEAPON_IDS = ['sniper', 'smg', 'knife'];

export const LIMITS = {
  maxPlayers: { min: 2, max: 15 },
  rounds: { min: 1, max: 10 },
  roundSeconds: { min: 30, max: 1800 },
  intermissionSeconds: { min: 3, max: 60 },
  countdownSeconds: { min: 0, max: 30 },
  respawnSeconds: { min: 1, max: 15 },
};

export const ROOM_DEFAULTS = {
  name: '',
  isPrivate: false,
  password: '',
  maxPlayers: 15,
  rounds: 3,
  roundSeconds: 180,
  intermissionSeconds: 10,
  countdownSeconds: 5,
  respawnSeconds: 3,
  bots: true,          // completa la sala con bots hasta el aforo máximo
  waitForReady: false, // la ronda espera a que todos los humanos marquen listo
  roundWeapons: null,  // null = orden aleatorio; si no, array de longitud `rounds`
};

function clampInt(value, { min, max }, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cleanString(value, maxLen) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

// Devuelve una config válida y completa a partir de datos no confiables.
export function sanitizeRoomConfig(raw = {}) {
  const cfg = { ...ROOM_DEFAULTS };

  cfg.name = cleanString(raw.name, 24);
  cfg.isPrivate = !!raw.isPrivate;
  cfg.password = cfg.isPrivate ? cleanString(raw.password, 24) : '';
  cfg.bots = raw.bots === undefined ? ROOM_DEFAULTS.bots : !!raw.bots;
  cfg.waitForReady = raw.waitForReady === undefined ? ROOM_DEFAULTS.waitForReady : !!raw.waitForReady;

  for (const key of ['maxPlayers', 'rounds', 'roundSeconds', 'intermissionSeconds', 'countdownSeconds', 'respawnSeconds']) {
    cfg[key] = clampInt(raw[key], LIMITS[key], ROOM_DEFAULTS[key]);
  }

  // armas por ronda: array válido de longitud `rounds` o aleatorio (null)
  if (Array.isArray(raw.roundWeapons) && raw.roundWeapons.length) {
    const bag = shuffled(WEAPON_IDS);
    let bi = 0;
    const seq = [];
    for (let i = 0; i < cfg.rounds; i++) {
      const w = raw.roundWeapons[i];
      if (WEAPON_IDS.includes(w)) seq.push(w);
      else { seq.push(bag[bi % bag.length]); bi++; } // 'random' o valor inválido
    }
    cfg.roundWeapons = seq;
  } else {
    cfg.roundWeapons = null;
  }

  if (!cfg.name) cfg.name = cfg.isPrivate ? 'Sala privada' : 'Sala pública';
  return cfg;
}

function shuffled(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Config pública segura para listar salas (nunca incluye la contraseña).
export function publicRoomInfo(room) {
  return {
    id: room.id,
    name: room.config.name,
    isPrivate: room.config.isPrivate,
    players: room.humanCount(),
    bots: room.botCount(),
    maxPlayers: room.config.maxPlayers,
    rounds: room.config.rounds,
    roundSeconds: room.config.roundSeconds,
    state: room.state,
    hasPassword: !!room.config.password,
  };
}
