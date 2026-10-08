// Controles locales solo PC: pointer lock, ratón, teclado y cámara.

export class LocalPlayer {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;
    this.network = null;
    this.constants = null;

    this.yaw = 0;
    this.pitch = 0;
    this.locked = false;
    this.playing = false;

    this.keys = new Set();
    this.shooting = false;
    this.shootQueued = false;
    this.zooming = false;
    this.reloadQueued = false;
    this.seq = 0;

    this.renderPos = null;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vy = 0;
    this.lastServerSeq = 0;
    this.pendingInputs = [];

    // callbacks
    this.onScoreboard = null;
    this.onLockChange = null;
    this.onZoomChange = null;

    this.sensitivity = 0.0022;
    this.freecam = false; // solo diagnóstico E2E

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange?.(this.locked);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.playing) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });

    document.addEventListener('keydown', (e) => this.handleKey(e, true));
    document.addEventListener('keyup', (e) => this.handleKey(e, false));

    canvas.addEventListener('mousedown', (e) => {
      if (!this.playing) return;
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) {
        this.shooting = true;
        this.shootQueued = true;
      }
      if (e.button === 2) {
        this.zooming = true;
        this.onZoomChange?.(true);
      }
    });
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.shooting = false;
      if (e.button === 2) {
        this.zooming = false;
        this.onZoomChange?.(false);
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  handleKey(e, down) {
    if (!this.playing) return;
    switch (e.code) {
      case 'Tab':
        e.preventDefault();
        this.onScoreboard?.(down);
        break;
      case 'Space':
        e.preventDefault();
        if (down) this.keys.add('jump'); else this.keys.delete('jump');
        break;
      case 'KeyR':
        if (down) this.reloadQueued = true;
        break;
      default:
        if (down) this.keys.add(e.code);
        else this.keys.delete(e.code);
    }
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* pointer lock no disponible */ }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  reset(constants) {
    this.constants = constants;
    this.yaw = 0;
    this.pitch = 0;
    this.shooting = false;
    this.shootQueued = false;
    this.zooming = false;
    this.keys.clear();
    this.renderPos = null;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vy = 0;
    this.lastServerSeq = 0;
    this.pendingInputs = [];
  }

  buildInput() {
    const fwd = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const input = {
      seq: ++this.seq,
      move: { fwd, strafe },
      jump: this.keys.has('jump'),
      crouch: this.keys.has('ControlLeft') || this.keys.has('ControlRight'),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      yaw: this.yaw,
      pitch: this.pitch,
      shooting: this.shooting || this.shootQueued,
      reload: this.reloadQueued,
      zoom: this.zooming,
    };
    this.shootQueued = false;
    this.reloadQueued = false;
    this.pendingInputs.push(input);
    return input;
  }

  selfFromSnapshot() {
    const snap = this.network?.latest();
    if (!snap) return null;
    return snap.players.find((p) => p.id === this.network.selfId) || null;
  }

  update(dt) {
    if (this.freecam) return;
    const self = this.selfFromSnapshot();
    if (!self) return;

    const eye = self.crouch
      ? this.constants.player.crouchEyeHeight
      : this.constants.player.eyeHeight;

    // --- Client-Side Prediction ---
    if (self.seq > this.lastServerSeq) {
      this.lastServerSeq = self.seq;
      this.pos.x = self.x;
      this.pos.y = self.y;
      this.pos.z = self.z;
      // descartar inputs ya reconocidos por el servidor
      this.pendingInputs = this.pendingInputs.filter((i) => i.seq > self.seq);
      
      // re-aplicar inputs pendientes
      for (const inp of this.pendingInputs) {
        this.simulateMovement(inp, 1 / this.constants.tickRate);
      }
    }

    // predecir el frame actual con los inputs que estamos presionando
    // pero que aún no se envían en el próximo buildInput()
    const currentInput = {
      fwd: (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0),
      strafe: (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0),
      jump: this.keys.has('jump'),
      crouch: this.keys.has('ControlLeft') || this.keys.has('ControlRight'),
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      yaw: this.yaw,
    };
    this.simulateMovement(currentInput, dt);

    const target = { x: this.pos.x, y: this.pos.y + eye, z: this.pos.z };

    if (!this.renderPos) {
      this.renderPos = { x: target.x, y: target.y, z: target.z };
    } else {
      const k = 1 - Math.exp(-25 * dt);
      this.renderPos.x += (target.x - this.renderPos.x) * k;
      this.renderPos.y += (target.y - this.renderPos.y) * k;
      this.renderPos.z += (target.z - this.renderPos.z) * k;
    }

    this.camera.position.set(this.renderPos.x, this.renderPos.y, this.renderPos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }

  simulateMovement(inp, dt) {
    let speed = this.constants.baseSpeed; // simplificado: asumimos SMG (mult=1)
    if (inp.crouch) speed *= this.constants.crouchMult;
    else if (inp.sprint && inp.fwd > 0) speed *= this.constants.sprintMult;

    // TODO: weapon mult from V.weapon if accessible. Para MVP de predicción está bien.

    const fwd = inp.move ? inp.move.fwd : inp.fwd;
    const strafe = inp.move ? inp.move.strafe : inp.strafe;

    const sin = Math.sin(inp.yaw);
    const cos = Math.cos(inp.yaw);
    let mx = (-sin * fwd) + (cos * strafe);
    let mz = (-cos * fwd) + (-sin * strafe);
    const len = Math.hypot(mx, mz);
    if (len > 1e-6) {
      mx = (mx / len) * speed * dt;
      mz = (mz / len) * speed * dt;
    }

    // movimiento simple sin colisiones contra cajas locales, 
    // solo límites de arena para evitar salir del mapa
    this.pos.x += mx;
    this.pos.z += mz;
    
    const lim = this.constants.arenaHalf - this.constants.player.radius;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));
    
    // gravedad básica
    this.pos.y = Math.max(0, this.pos.y - this.constants.gravity * dt);
  }
}
