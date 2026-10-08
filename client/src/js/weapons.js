// Armas en primera persona: viewmodel, retroceso, trazadoras, impactos,
// zoom y sonido procedural (WebAudio, sin archivos externos).

import * as THREE from 'three';

const BASE_FOV = 75;

function makeNoiseBuffer(ctx) {
  const len = ctx.sampleRate;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

class AudioFX {
  constructor() {
    this.ctx = null;
    this.noise = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.noise = makeNoiseBuffer(this.ctx);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  burst({ duration = 0.08, freq = 1800, q = 1, gain = 0.3, type = 'bandpass' }) {
    const ctx = this.ensure();
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start();
    src.stop(ctx.currentTime + duration);
  }

  tone({ duration = 0.12, from = 220, to = 60, gain = 0.25, type = 'sine' }) {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  shot(weapon) {
    if (weapon === 'sniper') {
      this.burst({ duration: 0.22, freq: 900, q: 0.7, gain: 0.5 });
      this.tone({ duration: 0.25, from: 160, to: 40, gain: 0.35 });
    } else if (weapon === 'smg') {
      this.burst({ duration: 0.06, freq: 2400, q: 1.4, gain: 0.25 });
      this.tone({ duration: 0.05, from: 240, to: 90, gain: 0.14 });
    } else {
      this.burst({ duration: 0.14, freq: 5000, q: 0.6, gain: 0.2, type: 'highpass' });
    }
  }

  hit() { this.tone({ duration: 0.07, from: 1200, to: 700, gain: 0.22, type: 'square' }); }
  kill() { this.tone({ duration: 0.3, from: 660, to: 1320, gain: 0.25, type: 'triangle' }); }
  reload() { this.burst({ duration: 0.1, freq: 700, q: 2, gain: 0.2 }); }
  empty() { this.tone({ duration: 0.05, from: 400, to: 300, gain: 0.12, type: 'square' }); }
  death() { this.tone({ duration: 0.6, from: 300, to: 50, gain: 0.3, type: 'sawtooth' }); }
}

export class Weapons {
  constructor(camera, scene) {
    this.camera = camera;
    this.scene = scene;
    this.audio = new AudioFX();
    this.weaponId = null;
    this.zoomFov = null;
    this.zoomed = false;
    this.recoil = 0;
    this.swing = 0;
    this.flashTime = 0;
    this.solids = [];
    this.characters = new Map(); // id -> grupo THREE

    this.baseFov = BASE_FOV;

    // viewmodel
    this.vm = new THREE.Group();
    this.camera.add(this.vm);
    this.vm.position.set(0.3, -0.26, -0.5);

    this.muzzleLight = new THREE.PointLight(0xffc46b, 0, 6);
    this.muzzleLight.position.set(0.25, -0.1, -1);
    this.camera.add(this.muzzleLight);

    this.models = {};
    this.buildModels();

    this.effects = [];
  }

  buildModels() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x303030, roughness: 0.45, metalness: 0.55 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6, metalness: 0.4 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8, metalness: 0.05 });

    const add = (parent, geo, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      parent.add(m);
      return m;
    };

    // francotirador
    const sniper = new THREE.Group();
    add(sniper, new THREE.BoxGeometry(0.07, 0.09, 1.0), dark, 0, 0, -0.35);
    add(sniper, new THREE.CylinderGeometry(0.035, 0.035, 0.6, 12), mid, 0, 0.07, -0.7, Math.PI / 2);
    add(sniper, new THREE.BoxGeometry(0.06, 0.16, 0.28), wood, 0, -0.07, 0.1);
    add(sniper, new THREE.BoxGeometry(0.05, 0.12, 0.1), dark, 0, -0.05, -0.05);
    this.models.sniper = sniper;

    // subfusil
    const smg = new THREE.Group();
    add(smg, new THREE.BoxGeometry(0.09, 0.12, 0.55), dark, 0, 0, -0.2);
    add(smg, new THREE.CylinderGeometry(0.02, 0.02, 0.28, 10), mid, 0, 0.03, -0.55, Math.PI / 2);
    add(smg, new THREE.BoxGeometry(0.06, 0.2, 0.09), mid, 0, -0.14, -0.05);
    add(smg, new THREE.BoxGeometry(0.07, 0.13, 0.2), dark, 0, -0.04, 0.18);
    this.models.smg = smg;

    // cuchillo
    const knife = new THREE.Group();
    add(knife, new THREE.BoxGeometry(0.03, 0.06, 0.42), new THREE.MeshStandardMaterial({
      color: 0xd8d8d8, roughness: 0.15, metalness: 0.9,
    }), 0, 0.02, -0.25);
    add(knife, new THREE.BoxGeometry(0.045, 0.07, 0.16), dark, 0, 0, 0.02);
    this.models.knife = knife;

    for (const m of Object.values(this.models)) {
      m.visible = false;
      this.vm.add(m);
    }
  }

  setSolids(solids) { this.solids = solids; }

  setWeapon(weaponId, zoomFov = null) {
    this.weaponId = weaponId;
    this.zoomFov = zoomFov;
    this.zoomed = false;
    for (const [id, model] of Object.entries(this.models)) model.visible = id === weaponId;
    this.vm.position.set(0.3, -0.26, -0.5);
    this.vm.rotation.set(0, 0, 0);
  }

  setZoom(active) {
    if (!this.zoomFov) active = false;
    this.zoomed = active;
  }

  onOwnShot() {
    this.recoil = Math.min(1, this.recoil + (this.weaponId === 'sniper' ? 1 : 0.45));
    this.flashTime = 0.06;
    if (this.weaponId === 'knife') this.swing = 1;
    this.audio.shot(this.weaponId);
  }

  onHit(killed = false) {
    if (killed) this.audio.kill();
    else this.audio.hit();
  }

  onReload() { this.audio.reload(); }

  update(dt) {
    // zoom
    const targetFov = this.zoomed && this.zoomFov ? this.zoomFov : this.baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.updateProjectionMatrix();
    }

    // retroceso y balanceo
    this.recoil = Math.max(0, this.recoil - dt * 6);
    const sway = Math.sin(performance.now() / 900) * 0.006;
    this.vm.position.x = 0.3 + sway;
    this.vm.position.y = -0.26 + Math.sin(performance.now() / 650) * 0.004 + this.recoil * 0.02;
    this.vm.position.z = -0.5 + this.recoil * 0.09;
    this.vm.rotation.x = this.recoil * 0.18;

    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 4);
      this.vm.rotation.z = Math.sin((1 - this.swing) * Math.PI) * -0.9;
      this.vm.rotation.y = Math.sin((1 - this.swing) * Math.PI) * 0.5;
    } else {
      this.vm.rotation.z *= 0.8;
      this.vm.rotation.y *= 0.8;
    }

    // destello
    if (this.flashTime > 0) {
      this.flashTime -= dt;
      this.muzzleLight.intensity = this.flashTime > 0 ? 4 : 0;
    } else {
      this.muzzleLight.intensity = 0;
    }

    // efectos con vida limitada
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.life -= dt;
      if (fx.life <= 0) {
        this.scene.remove(fx.mesh);
        fx.mesh.geometry.dispose();
        fx.mesh.material.dispose();
        this.effects.splice(i, 1);
      } else {
        fx.mesh.material.opacity = Math.max(0, fx.life / fx.maxLife);
      }
    }
  }

  // impacto local del rayo contra mapa y personajes
  raycast(origin, dir, maxT) {
    const ray = new THREE.Raycaster(
      new THREE.Vector3(origin.x, origin.y, origin.z),
      new THREE.Vector3(dir.x, dir.y, dir.z),
      0,
      maxT,
    );
    const targets = [...this.solids];
    for (const char of this.characters.values()) targets.push(char.group);
    const hits = ray.intersectObjects(targets, true);
    return hits.length ? hits[0] : null;
  }

  handleShot(evt) {
    const maxT = evt.melee ? 3 : 200;
    const hit = this.raycast(evt.origin, evt.dir, maxT);
    const dist = hit ? hit.distance : (evt.melee ? 2.2 : maxT);

    if (!evt.melee) {
      const end = {
        x: evt.origin.x + evt.dir.x * dist,
        y: evt.origin.y + evt.dir.y * dist,
        z: evt.origin.z + evt.dir.z * dist,
      };
      this.spawnTracer(evt.origin, end);
      if (hit) this.spawnImpact(hit.point);
    }

    // el sonido del propio arma ya suena en onOwnShot; el de los demás aquí
    if (evt.id !== window.__selfId) this.audio.shot(evt.weapon);
  }

  spawnTracer(a, b) {
    const from = new THREE.Vector3(a.x, a.y, a.z);
    const to = new THREE.Vector3(b.x, b.y, b.z);
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.2) return;

    const geo = new THREE.CylinderGeometry(0.015, 0.015, len, 6, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe08a,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.scene.add(mesh);
    this.effects.push({ mesh, life: 0.09, maxLife: 0.09 });
  }

  spawnImpact(point) {
    const geo = new THREE.SphereGeometry(0.08, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(point);
    this.scene.add(mesh);
    this.effects.push({ mesh, life: 0.12, maxLife: 0.12 });
  }
}
