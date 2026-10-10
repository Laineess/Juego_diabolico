// Estado central del juego: loop a ticks fijos, movimiento con colisiones,
// detección de impactos en el servidor (anti-cheat) y máquina de estados
// de las 3 rondas de 3 minutos.

import '../config/env.js';
import { WEAPONS, shuffle } from './weaponConfig.js';
import { WEAPON_IDS, sanitizeRoomConfig } from './roomConfig.js';
import { MAP, ARENA, PLAYER } from './mapData.js';

const TICK_RATE = Number(process.env.TICK_RATE) || 30;

const BASE_SPEED = 6.0;
const SPRINT_MULT = 1.35;
const CROUCH_MULT = 0.5;
const JUMP_VELOCITY = 5.2;
const GRAVITY = 15.0;
const STEP_HEIGHT = 0.35;
const MAX_HEALTH = 100;

const HALF = ARENA.size / 2;

// ---------------------------------------------------------------------- bots
const MAX_PLAYERS = 15;          // aforo absoluto de cualquier sala
const BOT_VIEW_RANGE = 70;       // distancia máxima a la que un bot detecta
const BOT_REACTION_MS = 620;     // tiempo mínimo entre disparos de un bot
const BOT_PREFERRED_RANGE = { sniper: 22, smg: 10, knife: 1.6 };
const BOT_SPEED_MULT = 0.82;     // los bots se mueven más lento que un humano
const BOT_TURN_RATE = 0.075;     // radianes por tick al girar hacia el objetivo
const BOT_AIM_JITTER = 0.05;     // error angular al disparar (radianes)
const BOT_ALIGN_THRESHOLD = 0.14;// tolerancia de apuntado para disparar

// ---------------------------------------------------------------- aim assist
// Ayuda de puntería SOLO para jugadores humanos (los bots ya apuntan solos).
// Si un enemigo está dentro de un cono pequeño alrededor de la mira y hay
// línea de visión, el disparo se dobla ligeramente hacia él y se reduce la
// dispersión. Nunca asiste a través de la geometría del mapa.
const AIM_ASSIST = {
  enabled: true,
  angle: 0.06,       // cono de enganche para armas de fuego (~3.4°)
  meleeAngle: 0.22,  // el cuchillo es más indulgente (~12.6°)
  strength: 0.7,     // cuánto se acerca el disparo al objetivo
  spreadMult: 0.3,   // multiplicador de dispersión cuando se engancha
  maxRange: 90,      // distancia máxima de asistencia para armas de fuego
};

const BOT_NAMES = [
  'Cristal', 'Nova', 'Eco', 'Vector', 'Fase', 'Prisma', 'Quark', 'Zenit',
  'Orion', 'Fulgor', 'Troya', 'Delta', 'Runa', 'Vega', 'Lynx', 'Cometa',
  'Nexo', 'Pulso', 'Kappa', 'Iris',
];

const BOT_COLORS = [
  '#e53935', '#fb8c00', '#fdd835', '#43a047',
  '#00acc1', '#1e88e5', '#8e24aa', '#f06292',
];

function shortestAngle(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(current, desired, step) {
  const d = shortestAngle(current, desired);
  if (Math.abs(d) <= step) return desired;
  return current + Math.sign(d) * step;
}

// ------------------------------------------------------------------ raycasts

function rayAABB(o, d, min, max) {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axes = ['x', 'y', 'z'];
  for (const a of axes) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return Infinity;
    } else {
      let t1 = (min[a] - o[a]) / d[a];
      let t2 = (max[a] - o[a]) / d[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  if (tmax < 0) return Infinity;
  return tmin >= 0 ? tmin : tmax;
}

function rayCylinder(o, d, cx, cz, r, y0, y1) {
  let best = Infinity;
  // pared lateral
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a > 1e-9) {
    const b = 2 * (ox * d.x + oz * d.z);
    const c = ox * ox + oz * oz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        if (t < 0 || t >= best) continue;
        const y = o.y + d.y * t;
        if (y >= y0 && y <= y1) best = t;
      }
    }
  }
  // tapas
  if (Math.abs(d.y) > 1e-9) {
    for (const y of [y0, y1]) {
      const t = (y - o.y) / d.y;
      if (t < 0 || t >= best) continue;
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz <= r * r) best = t;
    }
  }
  return best;
}

function rayArena(o, d) {
  // distancia a la salida del volumen de la arena [-HALF, HALF] x [0, wallH]
  return rayAABB(o, d,
    { x: -HALF, y: 0, z: -HALF },
    { x: HALF, y: ARENA.wallHeight, z: HALF });
}

// ------------------------------------------------------------------- lógica

export class Game {
  constructor(io, models, rawConfig = {}, id = null) {
    this.io = io;
    this.models = models;
    this.id = id;
    this.config = sanitizeRoomConfig(rawConfig);
    this.players = new Map();     // socketId -> estado de jugador
    this.state = 'waiting';       // waiting | countdown | round | intermission | matchEnd
    this.roundNumber = 0;         // 1..config.rounds
    this.matchWeapons = [];
    this.endsAt = 0;
    this.matchId = null;
    this.usedNicks = new Map();   // nick -> socketId (nicks únicos online)
    this.botSeq = 0;
    this.timer = null;
    this.createdAt = Date.now();
  }

  get roundsTotal() {
    return this.config.rounds;
  }

  humanCount() {
    let n = 0;
    for (const p of this.players.values()) if (!p.bot) n++;
    return n;
  }

  botCount() {
    let n = 0;
    for (const p of this.players.values()) if (p.bot) n++;
    return n;
  }

  // configuración sin secretos (para game:init / listados)
  publicConfig() {
    const { password, ...rest } = this.config;
    return { ...rest, hasPassword: !!password, id: this.id };
  }

  isEmpty() {
    return this.humanCount() === 0;
  }

  start() {
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        console.error('[game] error en tick:', err);
      }
    }, 1000 / TICK_RATE);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------- conexión

  join(socket, { nick, color } = {}) {
    if (this.players.has(socket.id)) return this.players.get(socket.id);
    if (this.humanCount() >= this.config.maxPlayers) {
      throw new Error('La sala está llena');
    }

    const cleanNick = String(nick || 'Jugador').trim().slice(0, 18) || 'Jugador';
    const cleanColor = /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#4fc3f7';

    // nicks únicos entre jugadores conectados
    let finalNick = cleanNick;
    let n = 1;
    while (this.usedNicks.has(finalNick)) {
      finalNick = `${cleanNick.slice(0, 16)}_${++n}`;
    }
    this.usedNicks.set(finalNick, socket.id);

    const spawn = this.pickSpawn();
    const player = {
      id: socket.id,
      nick: finalNick,
      color: cleanColor,
      bot: false,
      dbId: null,
      x: spawn.x, y: 0, z: spawn.z,
      yaw: 0, pitch: 0,
      vy: 0,
      onGround: true,
      crouch: false,
      hp: MAX_HEALTH,
      alive: true,
      kills: 0, deaths: 0,
      roundKills: 0, roundDeaths: 0,
      mag: 0, reloadEndsAt: 0, lastShotAt: 0, prevShooting: false,
      respawnAt: 0,
      input: null,
      lastSeq: 0,
      ready: false,
      joinedAt: Date.now(),
    };
    this.players.set(socket.id, player);

    this.models?.upsertPlayer(finalNick, cleanColor)
      .then((id) => {
        const pl = this.players.get(socket.id);
        if (pl) pl.dbId = id;
      })
      .catch((err) => console.warn('[db] upsertPlayer:', err.message));

    // estado inicial para el nuevo jugador
    socket.emit('game:init', {
      selfId: socket.id,
      roomId: this.id,
      config: this.publicConfig(),
      totalRounds: this.roundsTotal,
      map: MAP,
      players: this.serializePlayers(),
      round: this.roundNumber,
      weapon: this.currentWeapon(),
      matchWeapons: this.matchWeapons,
      state: this.state,
      endsAt: this.endsAt,
      tickRate: TICK_RATE,
      constants: {
        baseSpeed: BASE_SPEED,
        sprintMult: SPRINT_MULT,
        crouchMult: CROUCH_MULT,
        jumpVelocity: JUMP_VELOCITY,
        gravity: GRAVITY,
        maxHealth: MAX_HEALTH,
        respawnSeconds: this.config.respawnSeconds,
        roundSeconds: this.config.roundSeconds,
        arenaHalf: HALF,
        tickRate: TICK_RATE,
        player: PLAYER,
      },
    });

    socket.broadcast.emit('player:joined', {
      id: socket.id, nick: finalNick, color: cleanColor, pos: { x: player.x, y: player.y, z: player.z },
    });

    this.io.emit('chat:system', `${finalNick} entró a la partida`);

    // completa la sala con bots hasta el aforo configurado
    this.fillBots();

    // arranque automático: la primera conexión dispara la cuenta regresiva
    // (en salas con waitForReady, hasta que todos los humanos marquen listo)
    if (this.state === 'waiting') this.maybeStartCountdown();
    return player;
  }

  // marca/listo de un jugador humano (solo afecta durante 'waiting')
  setReady(socketId, ready) {
    const p = this.players.get(socketId);
    if (!p || p.bot) return;
    p.ready = !!ready;
    this.maybeStartCountdown();
  }

  // Arranca la cuenta regresiva si corresponde: por defecto en cuanto entra el
  // primer jugador; con waitForReady, solo cuando todos los humanos están listos.
  maybeStartCountdown() {
    if (this.state !== 'waiting') return;
    const humans = [...this.players.values()].filter((x) => !x.bot);
    if (!humans.length) return;
    if (this.config.waitForReady && !humans.every((x) => x.ready)) return;
    this.startCountdown();
  }

  leave(socketId) {
    const p = this.players.get(socketId);
    if (!p) return;
    if (this.usedNicks.get(p.nick) === socketId) this.usedNicks.delete(p.nick);
    this.players.delete(socketId);
    this.io.emit('player:left', { id: socketId, nick: p.nick });
    this.io.emit('chat:system', `${p.nick} salió de la partida`);

    const humans = [...this.players.values()].filter((x) => !x.bot).length;
    if (humans === 0) {
      // sin humanos: se retiran los bots y la partida se reinicia
      this.clearBots();
      if (this.state !== 'waiting') {
        this.state = 'waiting';
        this.roundNumber = 0;
        this.matchWeapons = [];
        this.endsAt = 0;
        this.io.emit('game:state', { state: 'waiting', endsAt: 0 });
      }
    } else {
      this.fillBots();
      // si queda gente en una sala que espera listos, reevaluar el arranque
      this.maybeStartCountdown();
    }
  }

  // -------------------------------------------------------------- bots (IA)

  fillBots() {
    const humans = this.humanCount();
    const cap = this.config.bots ? Math.min(this.config.maxPlayers, MAX_PLAYERS) : humans;
    const target = Math.max(0, cap - humans);
    const bots = [...this.players.values()].filter((p) => p.bot);

    if (bots.length === target) return;
    for (let i = target; i < bots.length; i++) this.removeBot(bots[i]);
    for (let i = bots.length; i < target; i++) this.addBot();
  }

  clearBots() {
    for (const p of [...this.players.values()]) {
      if (p.bot) this.removeBot(p);
    }
  }

  addBot() {
    const id = `bot_${++this.botSeq}`;
    const nick = this.pickBotNick();
    const color = BOT_COLORS[Math.floor(Math.random() * BOT_COLORS.length)];
    const spawn = this.pickSpawn();
    const bot = {
      id,
      nick,
      color,
      bot: true,
      dbId: null,
      x: spawn.x, y: 0, z: spawn.z,
      yaw: Math.random() * Math.PI * 2, pitch: 0,
      vy: 0,
      onGround: true,
      crouch: false,
      hp: MAX_HEALTH,
      alive: true,
      kills: 0, deaths: 0,
      roundKills: 0, roundDeaths: 0,
      mag: 0, reloadEndsAt: 0, lastShotAt: 0, prevShooting: false,
      respawnAt: 0,
      input: null,
      lastSeq: 0,
      joinedAt: Date.now(),
      ai: {
        yaw: Math.random() * Math.PI * 2,
        wanderYaw: Math.random() * Math.PI * 2,
        nextWanderAt: 0,
        nextStrafeAt: 0,
        nextShotAt: 0,
        strafe: 0,
      },
    };
    this.players.set(id, bot);
    this.io.emit('player:joined', {
      id, nick, color, bot: true, pos: { x: bot.x, y: bot.y, z: bot.z },
    });
    return bot;
  }

  removeBot(bot) {
    if (!this.players.has(bot.id)) return;
    this.players.delete(bot.id);
    this.io.emit('player:left', { id: bot.id, nick: bot.nick });
  }

  pickBotNick() {
    const used = new Set([...this.players.values()].map((p) => p.nick));
    for (let i = 0; i < 50; i++) {
      const base = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
      if (!used.has(base)) return base;
      const withNum = `${base}-${Math.floor(Math.random() * 90 + 10)}`;
      if (!used.has(withNum)) return withNum;
    }
    return `Bot-${++this.botSeq}`;
  }

  findBotTarget(bot) {
    let best = null;
    let bestDist = Infinity;
    for (const p of this.players.values()) {
      if (p.id === bot.id || !p.alive) continue;
      const d = Math.hypot(p.x - bot.x, p.z - bot.z);
      if (d < bestDist && d <= BOT_VIEW_RANGE) { bestDist = d; best = p; }
    }
    return best;
  }

  updateBotAI(bot, weaponId, now) {
    const ai = bot.ai;
    const target = this.findBotTarget(bot);
    const input = {
      fwd: 0, strafe: 0, jump: false, crouch: false, sprint: false,
      yaw: ai.yaw, pitch: 0, shooting: false, reload: false, zoom: false,
    };

    if (target) {
      const dx = target.x - bot.x;
      const dz = target.z - bot.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const desiredYaw = Math.atan2(-dx, -dz);
      ai.yaw = turnToward(ai.yaw, desiredYaw, BOT_TURN_RATE);

      const eyeY = bot.y + PLAYER.eyeHeight;
      const tEyeY = target.y + PLAYER.eyeHeight;
      input.pitch = Math.atan2(tEyeY - eyeY, dist) + (Math.random() - 0.5) * BOT_AIM_JITTER * 0.5;

      const pref = BOT_PREFERRED_RANGE[weaponId] ?? 8;
      if (dist > pref * 1.15) input.fwd = 1;
      else if (dist < pref * 0.7) input.fwd = -1;

      if (now >= ai.nextStrafeAt) {
        ai.strafe = [-1, 0, 1][Math.floor(Math.random() * 3)];
        ai.nextStrafeAt = now + 800 + Math.random() * 1200;
      }
      input.strafe = ai.strafe;

      const wpn = WEAPONS[weaponId];
      if (wpn) {
        const cp = Math.cos(input.pitch);
        const dir = {
          x: -Math.sin(ai.yaw) * cp,
          y: Math.sin(input.pitch),
          z: -Math.cos(ai.yaw) * cp,
        };
        const origin = { x: bot.x, y: eyeY, z: bot.z };
        const wallT = this.mapHitDistance(origin, dir, wpn.range);
        const los = wallT >= dist - 0.6;
        const aligned = Math.abs(shortestAngle(ai.yaw, desiredYaw)) < BOT_ALIGN_THRESHOLD;
        if (los && aligned && dist <= wpn.range && now >= ai.nextShotAt) {
          input.shooting = true;
          ai.nextShotAt = now + BOT_REACTION_MS + Math.random() * 350;
        }
      }
    } else {
      if (now >= ai.nextWanderAt) {
        ai.wanderYaw = Math.random() * Math.PI * 2;
        ai.nextWanderAt = now + 2000 + Math.random() * 3000;
      }
      ai.yaw = turnToward(ai.yaw, ai.wanderYaw, 0.05);
      input.fwd = 1;
    }

    input.yaw = ai.yaw;
    bot.input = input;
  }

  onInput(socketId, input) {
    const p = this.players.get(socketId);
    if (!p || !input) return;
    p.input = {
      fwd: Number(input.move?.fwd) || 0,
      strafe: Number(input.move?.strafe) || 0,
      jump: !!input.jump,
      crouch: !!input.crouch,
      sprint: !!input.sprint,
      yaw: Number(input.yaw) || 0,
      pitch: Number(input.pitch) || 0,
      shooting: !!input.shooting,
      reload: !!input.reload,
      zoom: !!input.zoom,
    };
    p.lastSeq = Number(input.seq) || p.lastSeq;

    if (this.state === 'round' && p.alive && p.input.shooting) {
      this.tryFire(p, Date.now());
    }
    if (p.alive && p.input.reload) this.tryReload(p, Date.now());
  }

  // ------------------------------------------------------- máquina de estados

  startCountdown() {
    this.state = 'countdown';
    const secs = this.config.countdownSeconds;
    this.endsAt = Date.now() + secs * 1000;
    this.io.emit('game:state', { state: this.state, endsAt: this.endsAt, countdown: secs });
    if (secs <= 0) this.startMatchCycle();
  }

  startMatchCycle() {
    // nueva partida: secuencia de armas (fija o aleatoria), marcadores a cero
    this.matchWeapons = this.buildWeaponSequence();
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.roundKills = 0; p.roundDeaths = 0;
    }
    this.matchId = null;
    this.models?.createMatch()
      .then((id) => { this.matchId = id; })
      .catch((err) => console.warn('[db] createMatch:', err.message));
    this.startRound(1);
  }

  // secuencia de armas de la partida (configurada o aleatoria)
  buildWeaponSequence() {
    const total = this.roundsTotal;
    if (Array.isArray(this.config.roundWeapons) && this.config.roundWeapons.length) {
      const seq = this.config.roundWeapons.slice(0, total);
      while (seq.length < total) seq.push(WEAPON_IDS[seq.length % WEAPON_IDS.length]);
      return seq;
    }
    const bag = [];
    while (bag.length < total) bag.push(...shuffle(WEAPON_IDS));
    return bag.slice(0, total);
  }

  startRound(n) {
    if (n > this.roundsTotal) { this.startMatchCycle(); return; }
    this.roundNumber = n;
    this.state = 'round';
    const weapon = this.currentWeapon();
    const now = Date.now();
    this.endsAt = now + this.config.roundSeconds * 1000;

    for (const p of this.players.values()) {
      p.roundKills = 0; p.roundDeaths = 0;
      p.hp = MAX_HEALTH;
      p.alive = true;
      p.mag = WEAPONS[weapon].magSize;
      p.reloadEndsAt = 0;
      p.lastShotAt = 0;
      p.prevShooting = false;
      p.respawnAt = 0;
      p.crouch = false;
      const spawn = this.pickSpawn();
      p.x = spawn.x; p.y = 0; p.z = spawn.z;
      p.vy = 0;
      this.io.emit('player:respawn', { id: p.id, pos: { x: p.x, y: p.y, z: p.z }, hp: MAX_HEALTH });
    }

    this.io.emit('round:start', {
      round: n,
      totalRounds: this.roundsTotal,
      weapon,
      weaponName: WEAPONS[weapon].name,
      endsAt: this.endsAt,
      matchWeapons: this.matchWeapons,
    });
  }

  endRound() {
    const standings = this.roundStandings();
    this.io.emit('round:end', {
      round: this.roundNumber,
      top3: standings.slice(0, 3),
      standings,
    });
    this.saveRoundResults().catch((err) => console.warn('[db] saveRoundResults:', err.message));

    if (this.roundNumber >= this.roundsTotal) {
      // fin de partido: el estado se cambia ya (sin ventana de intermedio)
      this.state = 'matchEnd';
      this.endsAt = Date.now() + 20 * 1000;
      this.io.emit('game:state', { state: this.state, endsAt: this.endsAt });
      this.endMatch();
    } else {
      this.state = 'intermission';
      this.endsAt = Date.now() + this.config.intermissionSeconds * 1000;
      this.io.emit('game:state', { state: this.state, endsAt: this.endsAt });
    }
  }

  endMatch() {
    const ranking = this.matchStandings();
    const podium = ranking.slice(0, 3).map((s, i) => ({ rank: i + 1, ...s }));

    this.saveMatchResults(ranking)
      .then((saved) => this.io.emit('match:end', { podium, standings: ranking, saved: true }))
      .catch((err) => {
        console.warn('[db] saveMatchResults:', err.message);
        this.io.emit('match:end', { podium, standings: ranking, saved: false });
      });
  }

  currentWeapon() {
    if (!this.matchWeapons.length) return null;
    const i = Math.min(Math.max(this.roundNumber, 1), this.matchWeapons.length) - 1;
    return this.matchWeapons[i] || null;
  }

  tick() {
    const now = Date.now();

    // transiciones temporales
    if (this.state === 'countdown' && now >= this.endsAt) this.startMatchCycle();
    else if (this.state === 'round' && now >= this.endsAt) this.endRound();
    else if (this.state === 'intermission' && now >= this.endsAt) this.startRound(this.roundNumber + 1);
    else if (this.state === 'matchEnd' && now >= this.endsAt) this.startMatchCycle();

    const dt = 1 / TICK_RATE;
    const weapon = this.currentWeapon();

    for (const p of this.players.values()) {
      if (!p.alive) {
        if (p.respawnAt && now >= p.respawnAt && this.state === 'round') this.respawn(p);
        continue;
      }
      if (this.state === 'round') {
        if (p.bot) this.updateBotAI(p, weapon, now);
        this.updateMovement(p, dt, weapon);
        this.updateWeaponTimers(p, weapon, now);
      }
    }

    this.broadcastUpdate(now);
  }

  // --------------------------------------------------------------- movimiento

  updateMovement(p, dt, weaponId) {
    const inp = p.input;
    if (!inp) return;
    p.yaw = inp.yaw;
    p.pitch = inp.pitch;
    p.crouch = inp.crouch;

    const height = p.crouch ? PLAYER.crouchHeight : PLAYER.height;

    const wpn = WEAPONS[weaponId] || WEAPONS.smg;
    let speed = BASE_SPEED * wpn.speedMult;
    if (p.crouch) speed *= CROUCH_MULT;
    else if (inp.sprint && (inp.fwd !== 0 || inp.strafe !== 0)) speed *= SPRINT_MULT;

    // dirección relativa al yaw (convención Three.js: forward = -Z)
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    let mx = (-sin * inp.fwd) + (cos * inp.strafe);
    let mz = (-cos * inp.fwd) + (-sin * inp.strafe);
    const len = Math.hypot(mx, mz);
    if (len > 1e-6) { mx = (mx / len) * speed * dt; mz = (mz / len) * speed * dt; }

    // eje X
    if (mx !== 0 && !this.collides(p.x + mx, p.z, p.y, height)) p.x += mx;
    // eje Z
    if (mz !== 0 && !this.collides(p.x, p.z + mz, p.y, height)) p.z += mz;

    // límites de arena
    const lim = HALF - PLAYER.radius;
    p.x = Math.max(-lim, Math.min(lim, p.x));
    p.z = Math.max(-lim, Math.min(lim, p.z));

    // vertical
    const ground = this.groundHeightAt(p.x, p.z, p.y);
    if (inp.jump && p.onGround) {
      p.vy = JUMP_VELOCITY;
      p.onGround = false;
    }
    p.vy -= GRAVITY * dt;
    p.y += p.vy * dt;

    if (p.y <= ground && p.vy <= 0) {
      p.y = ground;
      p.vy = 0;
      p.onGround = true;
    } else if (p.y > ground + 0.01) {
      p.onGround = false;
    }
  }

  collides(x, z, feetY, height) {
    for (const b of MAP.boxes) {
      const top = b.y + b.h;
      if (!(b.y < feetY + height && top > feetY + STEP_HEIGHT)) continue;
      if (Math.abs(x - b.x) < b.w / 2 + PLAYER.radius &&
          Math.abs(z - b.z) < b.d / 2 + PLAYER.radius) return true;
    }
    // Rampas actúan como AABB sólidas
    if (MAP.ramps) {
      for (const r of MAP.ramps) {
        const top = r.y + r.h;
        if (!(r.y < feetY + height && top > feetY + STEP_HEIGHT)) continue;
        if (Math.abs(x - r.x) < r.w / 2 + PLAYER.radius &&
            Math.abs(z - r.z) < r.d / 2 + PLAYER.radius) return true;
      }
    }
    for (const c of MAP.cylinders) {
      const top = c.y + c.h;
      if (!(c.y < feetY + height && top > feetY + STEP_HEIGHT)) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const r = c.r + PLAYER.radius;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  groundHeightAt(x, z, feetY) {
    let g = 0;
    for (const b of MAP.boxes) {
      const top = b.y + b.h;
      if (top > feetY + STEP_HEIGHT) continue;
      if (Math.abs(x - b.x) < b.w / 2 + PLAYER.radius * 0.6 &&
          Math.abs(z - b.z) < b.d / 2 + PLAYER.radius * 0.6) {
        if (top > g) g = top;
      }
    }
    for (const c of MAP.cylinders) {
      const top = c.y + c.h;
      if (top > feetY + STEP_HEIGHT) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const r = c.r + PLAYER.radius * 0.6;
      if (dx * dx + dz * dz < r * r && top > g) g = top;
    }
    if (MAP.ramps) {
      for (const r of MAP.ramps) {
        if (Math.abs(x - r.x) < r.w / 2 + PLAYER.radius * 0.6 &&
            Math.abs(z - r.z) < r.d / 2 + PLAYER.radius * 0.6) {
          
          let pct = 0;
          if (r.dir === 'x') pct = (x - (r.x - r.w / 2)) / r.w;
          else if (r.dir === '-x') pct = ((r.x + r.w / 2) - x) / r.w;
          else if (r.dir === 'z') pct = (z - (r.z - r.d / 2)) / r.d;
          else if (r.dir === '-z') pct = ((r.z + r.d / 2) - z) / r.d;
          
          pct = Math.max(0, Math.min(1, pct));
          const top = r.y + r.h * pct;
          if (top > feetY + STEP_HEIGHT) continue;
          if (top > g) g = top;
        }
      }
    }
    return g;
  }

  // ------------------------------------------------------------------- armas

  updateWeaponTimers(p, weaponId, now) {
    const wpn = WEAPONS[weaponId];
    if (!wpn) return;
    if (p.reloadEndsAt && now >= p.reloadEndsAt) {
      p.mag = wpn.magSize;
      p.reloadEndsAt = 0;
    }
    if (p.input?.shooting) this.tryFire(p, now, weaponId);
    else p.prevShooting = false;
  }

  tryReload(p, now, weaponId = this.currentWeapon()) {
    const wpn = WEAPONS[weaponId];
    if (!wpn || wpn.type === 'melee') return;
    if (p.reloadEndsAt || p.mag >= wpn.magSize) return;
    p.reloadEndsAt = now + wpn.reloadTime * 1000;
    this.io.to(p.id).emit('weapon:reload', { endsAt: p.reloadEndsAt, weapon: weaponId });
  }

  tryFire(p, now, weaponId = this.currentWeapon()) {
    const wpn = WEAPONS[weaponId];
    if (!wpn || this.state !== 'round' || !p.alive) return;

    const inp = p.input;
    if (!inp || !inp.shooting) return;
    if (!wpn.automatic && p.prevShooting) return;
    p.prevShooting = true;

    if (now - p.lastShotAt < wpn.fireInterval * 1000) return;
    if (wpn.type !== 'melee' && p.reloadEndsAt) return;
    if (wpn.type !== 'melee' && p.mag <= 0) {
      this.tryReload(p, now, weaponId);
      return;
    }

    p.lastShotAt = now;
    if (wpn.type !== 'melee') p.mag -= 1;

    // origen y dirección de la mira
    const eyeY = p.y + (p.crouch ? PLAYER.crouchEyeHeight : PLAYER.eyeHeight);
    const origin = { x: p.x, y: eyeY, z: p.z };
    const cp = Math.cos(p.pitch);
    let dir = {
      x: -Math.sin(p.yaw) * cp,
      y: Math.sin(p.pitch),
      z: -Math.cos(p.yaw) * cp,
    };
    // aim assist (solo humanos): dobla el disparo hacia un enemigo cercano
    let assisted = false;
    if (AIM_ASSIST.enabled && !p.bot) {
      const assist = this.findAimAssistTarget(p, origin, dir, wpn);
      if (assist) {
        const maxAngle = wpn.type === 'melee' ? AIM_ASSIST.meleeAngle : AIM_ASSIST.angle;
        const k = 1 - assist.angle / maxAngle; // 0..1 (más alineado = más fuerte)
        const s = AIM_ASSIST.strength * (0.5 + 0.5 * k);
        const bx = dir.x + (assist.x - dir.x) * s;
        const by = dir.y + (assist.y - dir.y) * s;
        const bz = dir.z + (assist.z - dir.z) * s;
        const bl = Math.hypot(bx, by, bz) || 1;
        dir = { x: bx / bl, y: by / bl, z: bz / bl };
        assisted = true;
      }
    }

    // dispersión (los bots además disparan con imprecisión propia)
    let spread = wpn.spread + (p.bot && wpn.type !== 'melee' ? BOT_AIM_JITTER : 0);
    if (assisted) spread *= AIM_ASSIST.spreadMult;
    if (spread > 0) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      dir = {
        x: dir.x + Math.cos(a) * r,
        y: dir.y + Math.sin(a) * r,
        z: dir.z,
      };
    }
    const dl = Math.hypot(dir.x, dir.y, dir.z);
    dir = { x: dir.x / dl, y: dir.y / dl, z: dir.z / dl };

    this.io.emit('game:shot', {
      id: p.id, weapon: weaponId,
      origin, dir,
      melee: wpn.type === 'melee',
    });

    const wallT = this.mapHitDistance(origin, dir, wpn.range);
    const hit = this.firstPlayerHit(p, origin, dir, Math.min(wallT, wpn.range));

    if (hit) {
      let dmg = wpn.damage;
      if (wpn.type === 'melee') {
        // golpe por la espalda = daño total
        const vf = { x: -Math.sin(hit.player.yaw), z: -Math.cos(hit.player.yaw) };
        const toAtk = { x: p.x - hit.player.x, z: p.z - hit.player.z };
        const dot = vf.x * toAtk.x + vf.z * toAtk.z;
        if (dot < -0.2) dmg = wpn.backDamage;
      }
      this.applyDamage(hit.player, dmg, p, weaponId);
    }
  }

  mapHitDistance(origin, dir, maxT) {
    let best = maxT;
    for (const b of MAP.boxes) {
      const t = rayAABB(origin, dir,
        { x: b.x - b.w / 2, y: b.y, z: b.z - b.d / 2 },
        { x: b.x + b.w / 2, y: b.y + b.h, z: b.z + b.d / 2 });
      if (t < best) best = t;
    }
    if (MAP.ramps) {
      for (const r of MAP.ramps) {
        const t = rayAABB(origin, dir,
          { x: r.x - r.w / 2, y: r.y, z: r.z - r.d / 2 },
          { x: r.x + r.w / 2, y: r.y + r.h, z: r.z + r.d / 2 });
        if (t < best) best = t;
      }
    }
    for (const c of MAP.cylinders) {
      const t = rayCylinder(origin, dir, c.x, c.z, c.r, c.y, c.y + c.h);
      if (t < best) best = t;
    }
    const tArena = rayArena(origin, dir);
    if (tArena < best) best = tArena;
    return best;
  }

  firstPlayerHit(shooter, origin, dir, maxT) {
    let best = null;
    let bestT = maxT;
    for (const p of this.players.values()) {
      if (p.id === shooter.id || !p.alive) continue;
      const h = p.crouch ? PLAYER.crouchHeight : PLAYER.height;
      const t = rayCylinder(origin, dir, p.x, p.z, PLAYER.radius, p.y, p.y + h);
      if (t < bestT) { bestT = t; best = p; }
    }
    return best ? { player: best, t: bestT } : null;
  }

  // Enemigo más alineado con la mira dentro del cono de asistencia.
  findAimAssistTarget(shooter, origin, dir, wpn) {
    const isMelee = wpn.type === 'melee';
    const maxAngle = isMelee ? AIM_ASSIST.meleeAngle : AIM_ASSIST.angle;
    const maxRange = Math.min(wpn.range, isMelee ? 3.0 : AIM_ASSIST.maxRange);
    let best = null;
    let bestAngle = maxAngle;
    for (const p of this.players.values()) {
      if (p.id === shooter.id || !p.alive) continue;
      const h = p.crouch ? PLAYER.crouchHeight : PLAYER.height;
      const ax = p.x - origin.x;
      const ay = (p.y + h * 0.62) - origin.y;
      const az = p.z - origin.z;
      const dist = Math.hypot(ax, ay, az);
      if (dist < 0.05 || dist > maxRange) continue;
      const tx = ax / dist;
      const ty = ay / dist;
      const tz = az / dist;
      const dot = Math.max(-1, Math.min(1, dir.x * tx + dir.y * ty + dir.z * tz));
      const angle = Math.acos(dot);
      if (angle >= bestAngle) continue;
      // no asistir a través de cobertura
      if (this.mapHitDistance(origin, { x: tx, y: ty, z: tz }, dist) < dist - 0.5) continue;
      best = { x: tx, y: ty, z: tz, angle };
      bestAngle = angle;
    }
    return best;
  }

  applyDamage(target, dmg, killer, weaponId) {
    if (!target.alive) return;
    target.hp -= dmg;
    if (target.hp > 0) {
      this.io.emit('game:hit', {
        targetId: target.id, byId: killer.id, dmg, hp: target.hp,
      });
      return;
    }

    // baja
    target.hp = 0;
    target.alive = false;
    target.deaths += 1;
    target.roundDeaths += 1;
    killer.kills += 1;
    killer.roundKills += 1;
    target.respawnAt = Date.now() + this.config.respawnSeconds * 1000;

    this.io.emit('game:kill', {
      killerId: killer.id,
      killerNick: killer.nick,
      victimId: target.id,
      victimNick: target.nick,
      weapon: weaponId,
    });
    this.io.emit('chat:system', `${killer.nick} ▸ ${target.nick} [${WEAPONS[weaponId]?.name || weaponId}]`);
  }

  respawn(p) {
    const spawn = this.pickSpawn();
    p.x = spawn.x; p.y = 0; p.z = spawn.z;
    p.vy = 0;
    p.hp = MAX_HEALTH;
    p.alive = true;
    p.respawnAt = 0;
    p.mag = WEAPONS[this.currentWeapon()]?.magSize ?? 0;
    p.reloadEndsAt = 0;
    this.io.emit('player:respawn', {
      id: p.id, pos: { x: p.x, y: p.y, z: p.z }, hp: MAX_HEALTH,
    });
  }

  pickSpawn() {
    const height = PLAYER.height;

    const valid = (s) => !this.collides(s.x, s.z, 0, height) && !this.occupied(s.x, s.z);

    let candidates = MAP.spawns.filter(valid);

    // si todos los spawns configurados están bloqueados, barre una malla
    // para garantizar una posición libre (nunca se devuelve un punto 0,0
    // que pueda caer dentro del cubo central).
    if (!candidates.length) {
      const step = 2;
      for (let x = -HALF + 2; x <= HALF - 2; x += step) {
        for (let z = -HALF + 2; z <= HALF - 2; z += step) {
          const s = { x, z };
          if (valid(s)) candidates.push(s);
        }
      }
    }
    if (!candidates.length) return { x: 0, z: 0 };

    // mejor spawn = el más lejano a otros jugadores/bots vivos
    let best = candidates[0];
    let bestScore = -1;
    for (const s of candidates) {
      let minDist = Infinity;
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d < minDist) minDist = d;
      }
      const score = minDist === Infinity ? 1000 : minDist;
      if (score > bestScore) { bestScore = score; best = s; }
    }

    // variación ligera para evitar apilarse (verificada contra colisiones)
    for (let i = 0; i < 8; i++) {
      const x = best.x + (Math.random() - 0.5);
      const z = best.z + (Math.random() - 0.5);
      if (valid({ x, z })) return { x, z };
    }
    return { x: best.x, z: best.z };
  }

  // true si hay un jugador/bot vivo demasiado cerca (evita spawns encima)
  occupied(x, z, minDist = 1.2) {
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (Math.hypot(p.x - x, p.z - z) < minDist) return true;
    }
    return false;
  }

  // ------------------------------------------------------------- clasificación

  roundStandings() {
    const list = [...this.players.values()].map((p) => ({
      id: p.id,
      nick: p.nick,
      color: p.color,
      kills: p.roundKills,
      deaths: p.roundDeaths,
    }));
    list.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.nick.localeCompare(b.nick));
    return list;
  }

  matchStandings() {
    const list = [...this.players.values()].map((p) => ({
      id: p.id,
      nick: p.nick,
      color: p.color,
      kills: p.kills,
      deaths: p.deaths,
    }));
    list.sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.nick.localeCompare(b.nick));
    return list;
  }

  // -------------------------------------------------------------- persistencia

  async saveRoundResults() {
    if (!this.matchId) return;
    const weapon = this.currentWeapon();
    const rows = [...this.players.values()]
      .filter((p) => p.dbId)
      .map((p) => ({ playerId: p.dbId, kills: p.roundKills, deaths: p.roundDeaths }));
    for (const row of rows) {
      await this.models.saveRoundResult(this.matchId, this.roundNumber, weapon, row.playerId, row.kills, row.deaths);
    }
  }

  async saveMatchResults(ranking) {
    if (!this.matchId) throw new Error('partida sin matchId en BD');
    const rows = [];
    for (let i = 0; i < ranking.length; i++) {
      const s = ranking[i];
      const p = this.players.get(s.id);
      if (!p?.dbId) continue;
      rows.push({ playerId: p.dbId, rank: i + 1, kills: s.kills, deaths: s.deaths });
    }
    await this.models.saveMatchResults(this.matchId, rows);
    await this.models.finishMatch(this.matchId);
    return true;
  }

  // ----------------------------------------------------------------- red

  serializePlayers() {
    return [...this.players.values()].map((p) => this.serializePlayer(p));
  }

  serializePlayer(p) {
    return {
      id: p.id,
      nick: p.nick,
      color: p.color,
      bot: p.bot,
      x: +p.x.toFixed(3),
      y: +p.y.toFixed(3),
      z: +p.z.toFixed(3),
      yaw: +p.yaw.toFixed(3),
      pitch: +p.pitch.toFixed(3),
      crouch: p.crouch,
      hp: Math.max(0, Math.round(p.hp)),
      alive: p.alive,
      kills: p.kills,
      deaths: p.deaths,
      roundKills: p.roundKills,
      roundDeaths: p.roundDeaths,
      mag: Number.isFinite(p.mag) ? p.mag : -1,   // -1 = sin munición (cuchillo)
      reloading: !!p.reloadEndsAt,
      respawnIn: p.respawnAt ? Math.max(0, p.respawnAt - Date.now()) : 0,
      seq: p.lastSeq,
      ready: !!p.ready,
    };
  }

  broadcastUpdate(now) {
    const timeLeft = Math.max(0, this.endsAt - now);
    this.io.emit('game:update', {
      t: now,
      state: this.state,
      round: this.roundNumber,
      weapon: this.currentWeapon(),
      timeLeft,
      waitForReady: this.config.waitForReady,
      players: this.serializePlayers(),
    });
  }
}
