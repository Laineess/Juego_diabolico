// Estado central del juego: loop a ticks fijos, movimiento con colisiones,
// detección de impactos en el servidor (anti-cheat) y máquina de estados
// de las 3 rondas de 3 minutos.

import '../config/env.js';
import { WEAPONS, shuffle } from './weaponConfig.js';
import { MAP, ARENA, PLAYER } from './mapData.js';

const TICK_RATE = Number(process.env.TICK_RATE) || 30;
const ROUND_SECONDS = Number(process.env.ROUND_SECONDS) || 180;
const INTERMISSION_SECONDS = Number(process.env.INTERMISSION_SECONDS) || 10;
const COUNTDOWN_SECONDS = Number(process.env.COUNTDOWN_SECONDS) || 5;
const RESPAWN_SECONDS = Number(process.env.RESPAWN_SECONDS) || 3;

const BASE_SPEED = 6.0;
const SPRINT_MULT = 1.35;
const CROUCH_MULT = 0.5;
const JUMP_VELOCITY = 5.2;
const GRAVITY = 15.0;
const STEP_HEIGHT = 0.35;
const MAX_HEALTH = 100;

const HALF = ARENA.size / 2;

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
  constructor(io, models) {
    this.io = io;
    this.models = models;
    this.players = new Map();     // socketId -> estado de jugador
    this.state = 'waiting';       // waiting | countdown | round | intermission
    this.roundNumber = 0;         // 1..3
    this.matchWeapons = [];
    this.endsAt = 0;
    this.matchId = null;
    this.usedNicks = new Map();   // nick -> socketId (nicks únicos online)
    this.timer = null;
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
        respawnSeconds: RESPAWN_SECONDS,
        roundSeconds: ROUND_SECONDS,
        arenaHalf: HALF,
        player: PLAYER,
      },
    });

    socket.broadcast.emit('player:joined', {
      id: socket.id, nick: finalNick, color: cleanColor, pos: { x: player.x, y: player.y, z: player.z },
    });

    this.io.emit('chat:system', `${finalNick} entró a la partida`);

    // arranque automático: la primera conexión dispara la cuenta regresiva
    if (this.state === 'waiting') this.startCountdown();
    return player;
  }

  leave(socketId) {
    const p = this.players.get(socketId);
    if (!p) return;
    if (this.usedNicks.get(p.nick) === socketId) this.usedNicks.delete(p.nick);
    this.players.delete(socketId);
    this.io.emit('player:left', { id: socketId, nick: p.nick });
    this.io.emit('chat:system', `${p.nick} salió de la partida`);

    // sin nadie online: la partida se reinicia para el próximo jugador
    if (this.players.size === 0 && this.state !== 'waiting') {
      this.state = 'waiting';
      this.roundNumber = 0;
      this.matchWeapons = [];
      this.endsAt = 0;
      this.io.emit('game:state', { state: 'waiting', endsAt: 0 });
    }
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
    this.endsAt = Date.now() + COUNTDOWN_SECONDS * 1000;
    this.io.emit('game:state', { state: this.state, endsAt: this.endsAt, countdown: COUNTDOWN_SECONDS });
  }

  startMatchCycle() {
    // nueva partida: armas re-aleatorizadas, marcadores a cero
    this.matchWeapons = shuffle(['sniper', 'smg', 'knife']);
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.roundKills = 0; p.roundDeaths = 0;
    }
    this.matchId = null;
    this.models?.createMatch()
      .then((id) => { this.matchId = id; })
      .catch((err) => console.warn('[db] createMatch:', err.message));
    this.startRound(1);
  }

  startRound(n) {
    if (n > 3) { this.startMatchCycle(); return; }
    this.roundNumber = n;
    this.state = 'round';
    const weapon = this.currentWeapon();
    const now = Date.now();
    this.endsAt = now + ROUND_SECONDS * 1000;

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
      totalRounds: 3,
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

    if (this.roundNumber >= 3) {
      // fin de partido: el estado se cambia ya (sin ventana de intermedio)
      this.state = 'matchEnd';
      this.endsAt = Date.now() + 20 * 1000;
      this.io.emit('game:state', { state: this.state, endsAt: this.endsAt });
      this.endMatch();
    } else {
      this.state = 'intermission';
      this.endsAt = Date.now() + INTERMISSION_SECONDS * 1000;
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
    return this.matchWeapons[Math.min(this.roundNumber, 3) - 1] || null;
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
    else if (inp.sprint && inp.fwd > 0) speed *= SPRINT_MULT;

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
    // dispersión
    if (wpn.spread > 0) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * wpn.spread;
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
    target.respawnAt = Date.now() + RESPAWN_SECONDS * 1000;

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
    // solo spawns que no caen dentro de la geometría (evita jugadores atrapados)
    const height = PLAYER.height;
    const spawns = MAP.spawns.filter((s) => !this.collides(s.x, s.z, 0, height));
    if (!spawns.length) return { x: 0, z: 0 };
    let best = spawns[0];
    let bestScore = -1;
    for (const s of spawns) {
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
      if (!this.collides(x, z, 0, height)) return { x, z };
    }
    return { x: best.x, z: best.z };
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
      players: this.serializePlayers(),
    });
  }
}
