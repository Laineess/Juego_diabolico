// Gestión de Socket.io: conexión, protocolo y buffer de interpolación.

export class Network {
  constructor(handlers) {
    this.h = handlers;
    this.socket = null;
    this.snapshots = [];   // buffer de game:update
    this.selfId = null;
    this.init = null;
  }

  connect() {
    this.socket = io({ autoConnect: true });
    const s = this.socket;

    s.on('connect', () => this.h.onConnect?.(s.id));
    s.on('disconnect', () => this.h.onDisconnect?.());
    s.on('game:init', (data) => {
      this.selfId = data.selfId;
      this.init = data;
      this.h.onInit?.(data);
    });
    s.on('game:update', (snap) => {
      this.snapshots.push(snap);
      if (this.snapshots.length > 60) this.snapshots.shift();
      this.h.onUpdate?.(snap);
    });
    s.on('game:shot', (e) => this.h.onShot?.(e));
    s.on('game:hit', (e) => this.h.onHit?.(e));
    s.on('game:kill', (e) => this.h.onKill?.(e));
    s.on('player:respawn', (e) => this.h.onRespawn?.(e));
    s.on('player:joined', (e) => this.h.onJoined?.(e));
    s.on('player:left', (e) => this.h.onLeft?.(e));
    s.on('round:start', (e) => this.h.onRoundStart?.(e));
    s.on('round:end', (e) => this.h.onRoundEnd?.(e));
    s.on('match:end', (e) => this.h.onMatchEnd?.(e));
    s.on('game:state', (e) => this.h.onState?.(e));
    s.on('weapon:reload', (e) => this.h.onReload?.(e));
    s.on('chat:system', (msg) => this.h.onSystem?.(msg));
    s.on('rooms:list', (data) => this.h.onRoomsList?.(data));
    s.on('game:error', (e) => this.h.onError?.(e));
    s.on('lobby:back', () => this.h.onLobbyBack?.());
    return this.socket;
  }

  listRooms() {
    this.socket?.emit('rooms:list');
  }

  createRoom(payload) {
    this.socket?.emit('room:create', payload);
  }

  joinRoom(roomId, nick, color, password, skin) {
    this.socket?.emit('room:join', { roomId, nick, color, password, skin });
  }

  join(nick, color, skin) {
    this.socket?.emit('player:join', { nick, color, skin });
  }

  leaveRoom() {
    this.socket?.emit('room:leave');
  }

  setReady(ready = true) {
    this.socket?.emit('player:ready', { ready });
  }

  sendInput(input) {
    if (this.socket?.connected) this.socket.emit('player:input', input);
  }

  latest() {
    return this.snapshots.length ? this.snapshots[this.snapshots.length - 1] : null;
  }

  // interpolación continua con retraso para jugadores remotos (suave a cualquier tasa de Hz)
  snapshotsAt(delayMs = 100, dt = 0) {
    const snaps = this.snapshots;
    if (snaps.length < 2) return null;

    const latestT = snaps[snaps.length - 1].t;
    const oldestT = snaps[0].t;
    const targetIdeal = latestT - delayMs;

    if (this.interpTime === undefined || Math.abs(this.interpTime - targetIdeal) > 350) {
      this.interpTime = targetIdeal;
    } else {
      // Avanza suavemente en cada fotograma renderizado
      this.interpTime += dt * 1000;
      // Amortigua cualquier desviación respecto al flujo de paquetes
      this.interpTime += (targetIdeal - this.interpTime) * Math.min(1, dt * 6);
    }

    const target = Math.max(oldestT, Math.min(latestT, this.interpTime));

    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].t <= target && snaps[i].t >= target) {
        const a = snaps[i - 1];
        const b = snaps[i];
        const span = b.t - a.t;
        const alpha = span <= 0 ? 1 : Math.max(0, Math.min(1, (target - a.t) / span));
        return { a, b, alpha };
      }
    }

    const a = snaps[snaps.length - 2];
    const b = snaps[snaps.length - 1];
    return { a, b, alpha: 1 };
  }

  clear() {
    this.snapshots = [];
    this.interpTime = undefined;
  }
}
