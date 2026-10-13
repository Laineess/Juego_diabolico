// Controles locales solo PC: pointer lock, ratón, teclado y cámara.

const STEP_HEIGHT = 0.35;
const RENDER_SMOOTH = 160; // mayor = cámara más pegada a la predicción (sin arrastre)

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
    this.jumpQueued = false;
    this.zooming = false;
    this.reloadQueued = false;
    this.seq = 0;

    this.renderPos = null;
    this.prevPos = { x: 0, y: 0, z: 0 };
    this.pos = { x: 0, y: 0, z: 0 };
    this.vy = 0;
    this.onGround = true;
    this.lastServerSeq = 0;
    this.pendingInputs = [];

    // datos de predicción (los rellena main.js)
    this.map = null;
    this.weaponSpeedMult = 1;
    this.movementAllowed = true;
    this.netErr = { x: 0, y: 0, z: 0 };

    // callbacks
    this.onScoreboard = null;
    this.onLockChange = null;
    this.onZoomChange = null;

    this.sensitivity = 0.0040;
    this.invertY = false;
    this.freecam = false; // solo diagnóstico E2E

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) {
        this.keys.clear();
        this.shooting = false;
        this.zooming = false;
      }
      this.onLockChange?.(this.locked);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.shooting = false;
      this.zooming = false;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.playing) return;
      const dir = this.invertY ? -1 : 1;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch += dir * e.movementY * this.sensitivity;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
      // Aplica la rotación inmediatamente (sin esperar al siguiente frame)
      // para que la mira responda al instante, sin retardo perceptible.
      this.applyCameraRotation();
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
        if (down) {
          this.keys.add('jump');
          this.jumpQueued = true;
        } else {
          this.keys.delete('jump');
        }
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

  applyCameraRotation() {
    if (!this.camera) return;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
  }

  reset(constants) {
    this.constants = constants;
    this.yaw = 0;
    this.pitch = 0;
    this.shooting = false;
    this.shootQueued = false;
    this.jumpQueued = false;
    this.zooming = false;
    this.keys.clear();
    this.renderPos = null;
    this.prevPos = { x: 0, y: 0, z: 0 };
    this.pos = { x: 0, y: 0, z: 0 };
    this.vy = 0;
    this.onGround = true;
    this.lastServerSeq = 0;
    this.pendingInputs = [];
    this.netErr = { x: 0, y: 0, z: 0 };
  }

  buildInput() {
    const fwd = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const isJump = this.keys.has('jump') || this.jumpQueued;
    const input = {
      seq: ++this.seq,
      move: { fwd, strafe },
      jump: isJump,
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
    this.jumpQueued = false;
    this.pendingInputs.push(input);
    return input;
  }

  predictInput(inp) {
    if (this.movementAllowed === false) return;
    this.prevPos.x = this.pos.x;
    this.prevPos.y = this.pos.y;
    this.prevPos.z = this.pos.z;
    this.simulateMovement(inp, 1 / (this.constants?.tickRate || 30));
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

    // solo predecimos movimiento cuando el servidor realmente lo procesa
    const active = this.movementAllowed !== false && self.alive;

    const eye = self.crouch
      ? this.constants.player.crouchEyeHeight
      : this.constants.player.eyeHeight;

    // --- Server Reconciliation ---
    if (self.seq > this.lastServerSeq) {
      this.lastServerSeq = self.seq;

      // Estado predicho antes de conciliar
      const predX = this.pos.x;
      const predY = this.pos.y;
      const predZ = this.pos.z;

      // Reset al estado autoritativo del servidor en self.seq
      this.pos.x = self.x;
      this.pos.y = self.y;
      this.pos.z = self.z;
      if (typeof self.vy === 'number') this.vy = self.vy;
      if (typeof self.onGround === 'boolean') this.onGround = self.onGround;

      // Descartar inputs ya procesados por el servidor
      this.pendingInputs = this.pendingInputs.filter((i) => i.seq > self.seq);

      if (active) {
        // Re-simular solo los inputs pendientes (aún no reconocidos)
        const tickDt = 1 / (this.constants?.tickRate || 30);
        for (const inp of this.pendingInputs) {
          this.simulateMovement(inp, tickDt);
        }
      } else {
        this.pendingInputs = [];
      }

      // Discrepancia real entre lo predicho localmente y lo reconciliado
      const errX = predX - this.pos.x;
      const errY = predY - this.pos.y;
      const errZ = predZ - this.pos.z;
      const errDist = Math.hypot(errX, errY, errZ);

      // Si la diferencia es insignificante (< 2.5 cm), ignorar para estabilidad total
      if (errDist < 0.025) {
        // Coincidencia exacta, nada que amortiguar
      } else if (errDist > 2.0) {
        // Desincronización grande (e.g. reaparición o teletransporte): corte directo
        this.netErr.x = 0;
        this.netErr.y = 0;
        this.netErr.z = 0;
        this.prevPos.x = this.pos.x;
        this.prevPos.y = this.pos.y;
        this.prevPos.z = this.pos.z;
        this.renderPos = null;
      } else {
        // Absorber la discrepancia suavemente
        this.netErr.x = errX;
        this.netErr.y = errY;
        this.netErr.z = errZ;
        this.prevPos.x = this.pos.x;
        this.prevPos.y = this.pos.y;
        this.prevPos.z = this.pos.z;
      }
    }

    // El error visual se disipa suavemente hacia 0 sin alterar la posición física
    const decay = Math.exp(-28 * dt);
    this.netErr.x *= decay;
    this.netErr.y *= decay;
    this.netErr.z *= decay;
    if (Math.abs(this.netErr.x) < 0.0005) this.netErr.x = 0;
    if (Math.abs(this.netErr.y) < 0.0005) this.netErr.y = 0;
    if (Math.abs(this.netErr.z) < 0.0005) this.netErr.z = 0;

    // Interpolación sub-tick continua entre tick anterior y tick predicho actual
    const tAlpha = Math.min(1, Math.max(0, typeof alpha === 'number' ? alpha : 1));
    const smoothX = this.prevPos.x + (this.pos.x - this.prevPos.x) * tAlpha;
    const smoothY = this.prevPos.y + (this.pos.y - this.prevPos.y) * tAlpha;
    const smoothZ = this.prevPos.z + (this.pos.z - this.prevPos.z) * tAlpha;

    // La posición visual objetivo incluye la corrección visual amortiguada
    const target = {
      x: smoothX + this.netErr.x,
      y: smoothY + eye + this.netErr.y,
      z: smoothZ + this.netErr.z,
    };

    if (!this.renderPos) {
      this.renderPos = { x: target.x, y: target.y, z: target.z };
    } else {
      this.renderPos.x = target.x;
      this.renderPos.y = target.y;
      this.renderPos.z = target.z;
    }

    this.camera.position.set(this.renderPos.x, this.renderPos.y, this.renderPos.z);
    this.applyCameraRotation();
  }

  // colisión AABB/cilindro idéntica a la del servidor (predicción consistente)
  collides(x, z, feetY, height) {
    const map = this.map;
    if (!map) return false;
    const r = this.constants.player.radius;
    for (const b of map.boxes) {
      const top = b.y + b.h;
      if (!(b.y < feetY + height && top > feetY + STEP_HEIGHT)) continue;
      if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(z - b.z) < b.d / 2 + r) return true;
    }
    if (map.ramps) {
      for (const rp of map.ramps) {
        const top = rp.y + rp.h;
        if (!(rp.y < feetY + height && top > feetY + STEP_HEIGHT)) continue;
        if (Math.abs(x - rp.x) < rp.w / 2 + r && Math.abs(z - rp.z) < rp.d / 2 + r) return true;
      }
    }
    for (const c of map.cylinders) {
      const top = c.y + c.h;
      if (!(c.y < feetY + height && top > feetY + STEP_HEIGHT)) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = c.r + r;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  groundHeightAt(x, z, feetY) {
    const map = this.map;
    if (!map) return 0;
    const r = this.constants.player.radius;
    let g = 0;
    for (const b of map.boxes) {
      const top = b.y + b.h;
      if (top > feetY + STEP_HEIGHT) continue;
      if (Math.abs(x - b.x) < b.w / 2 + r * 0.6 && Math.abs(z - b.z) < b.d / 2 + r * 0.6) {
        if (top > g) g = top;
      }
    }
    for (const c of map.cylinders) {
      const top = c.y + c.h;
      if (top > feetY + STEP_HEIGHT) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const rr = c.r + r * 0.6;
      if (dx * dx + dz * dz < rr * rr && top > g) g = top;
    }
    if (map.ramps) {
      for (const rp of map.ramps) {
        if (Math.abs(x - rp.x) < rp.w / 2 + r * 0.6 &&
            Math.abs(z - rp.z) < rp.d / 2 + r * 0.6) {
          let pct = 0;
          if (rp.dir === 'x') pct = (x - (rp.x - rp.w / 2)) / rp.w;
          else if (rp.dir === '-x') pct = ((rp.x + rp.w / 2) - x) / rp.w;
          else if (rp.dir === 'z') pct = (z - (rp.z - rp.d / 2)) / rp.d;
          else if (rp.dir === '-z') pct = ((rp.z + rp.d / 2) - z) / rp.d;
          pct = Math.max(0, Math.min(1, pct));
          const top = rp.y + rp.h * pct;
          if (top > feetY + STEP_HEIGHT) continue;
          if (top > g) g = top;
        }
      }
    }
    return g;
  }

  simulateMovement(inp, dt) {
    const c = this.constants;
    if (!c) return;

    const fwd = (inp.move ? inp.move.fwd : inp.fwd) || 0;
    const strafe = (inp.move ? inp.move.strafe : inp.strafe) || 0;

    let speed = c.baseSpeed * (this.weaponSpeedMult || 1);
    if (inp.crouch) speed *= c.crouchMult;
    else if (inp.sprint && (fwd !== 0 || strafe !== 0)) speed *= c.sprintMult;

    const height = inp.crouch ? c.player.crouchHeight : c.player.height;

    const sin = Math.sin(inp.yaw);
    const cos = Math.cos(inp.yaw);
    let mx = (-sin * fwd) + (cos * strafe);
    let mz = (-cos * fwd) + (-sin * strafe);
    const len = Math.hypot(mx, mz);
    if (len > 1e-6) { mx = (mx / len) * speed * dt; mz = (mz / len) * speed * dt; }

    // eje X y eje Z por separado (permite deslizarse contra las paredes)
    if (mx !== 0 && !this.collides(this.pos.x + mx, this.pos.z, this.pos.y, height)) this.pos.x += mx;
    if (mz !== 0 && !this.collides(this.pos.x, this.pos.z + mz, this.pos.y, height)) this.pos.z += mz;

    const lim = c.arenaHalf - c.player.radius;
    this.pos.x = Math.max(-lim, Math.min(lim, this.pos.x));
    this.pos.z = Math.max(-lim, Math.min(lim, this.pos.z));

    // vertical (salto + gravedad) igual que el servidor
    const ground = this.groundHeightAt(this.pos.x, this.pos.z, this.pos.y);
    if (inp.jump && this.onGround) {
      this.vy = c.jumpVelocity;
      this.onGround = false;
    }
    this.vy -= c.gravity * dt;
    this.pos.y += this.vy * dt;

    if (this.pos.y <= ground && this.vy <= 0) {
      this.pos.y = ground;
      this.vy = 0;
      this.onGround = true;
    } else if (this.pos.y > ground + 0.01) {
      this.onGround = false;
    }
  }
}
