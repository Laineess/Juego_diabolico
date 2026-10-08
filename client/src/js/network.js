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
    s.on('game:error', (e) => this.h.onError?.(e));
    return this.socket;
  }

  join(nick, color) {
    this.socket?.emit('player:join', { nick, color });
  }

  sendInput(input) {
    if (this.socket?.connected) this.socket.emit('player:input', input);
  }

  latest() {
    return this.snapshots.length ? this.snapshots[this.snapshots.length - 1] : null;
  }

  // interpolación con 100 ms de retraso para jugadores remotos
  snapshotsAt(delayMs = 100) {
    const snaps = this.snapshots;
    if (snaps.length < 2) return null;
    const target = snaps[snaps.length - 1].t - delayMs;
    for (let i = snaps.length - 1; i > 0; i--) {
      if (snaps[i - 1].t <= target && snaps[i].t >= target) {
        const a = snaps[i - 1];
        const b = snaps[i];
        const alpha = b.t === a.t ? 1 : (target - a.t) / (b.t - a.t);
        return { a, b, alpha };
      }
    }
    return null;
  }

  clear() {
    this.snapshots = [];
  }
}
