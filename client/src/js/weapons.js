// Armas en primera persona: viewmodel, retroceso, trazadoras, impactos,
// zoom y sonido procedural (WebAudio, sin archivos externos).

import * as THREE from 'three';

const BASE_FOV = 75;

const lerp = (a, b, t) => a + (b - a) * t;
const HIP_POS = { x: 0.3, y: -0.26, z: -0.5 };
// Posición de apuntado por arma: sube el arma hasta alinear las miras/la mira
// con el centro de la pantalla.
const ADS_POS = {
  sniper: { x: 0.0, y: -0.13, z: -0.20 },
  smg: { x: 0.0, y: -0.05, z: -0.34 },
  knife: { x: 0.14, y: -0.14, z: -0.44 },
};
// FOV al apuntar (el cuchillo no hace zoom, solo cambia la postura).
const AIM_FOV = { sniper: 25, smg: 58, knife: 75 };

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const RELOAD_ANIM_DUR = { sniper: 2.6, smg: 2.0, knife: 1.0 };

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
    this.master = 1;
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
    g.gain.setValueAtTime(gain * this.master, ctx.currentTime);
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
    g.gain.setValueAtTime(gain * this.master, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  setVolume(v) {
    this.master = Math.max(0, Math.min(1, v));
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
    this.aiming = false;
    this.aimT = 0;
    this.recoil = 0;
    this.swing = 0;
    this.reloadAnim = 0;
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
    this.magGroups = {};
    this.buildModels();

    this.effects = [];
  }

  buildModels() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x242424, roughness: 0.4, metalness: 0.6 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.55, metalness: 0.5 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.85, metalness: 0.05, flatShading: true });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: 0.12, metalness: 0.95 });
    const acc = new THREE.MeshStandardMaterial({ color: 0x2f7fd1, roughness: 0.5, metalness: 0.3 });
    const lens = new THREE.MeshStandardMaterial({ color: 0x49a1d8, roughness: 0.05, metalness: 0.1, emissive: 0x0e3a5a, emissiveIntensity: 0.35 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9, metalness: 0.1 });

    const add = (parent, geo, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      parent.add(m);
      return m;
    };

    // ------------------------------------------------------------ sniper
    const sniper = new THREE.Group();
    // cañón pesado + freno de boca (tumbados sobre el eje Z)
    add(sniper, new THREE.CylinderGeometry(0.013, 0.013, 0.5, 12), dark, 0, 0.03, -0.5, Math.PI / 2);
    add(sniper, new THREE.CylinderGeometry(0.026, 0.02, 0.09, 12), mid, 0, 0.03, -0.8, Math.PI / 2);
    add(sniper, new THREE.BoxGeometry(0.05, 0.01, 0.09), mid, 0, 0.058, -0.8); // parte superior del freno
    // receptor
    add(sniper, new THREE.BoxGeometry(0.07, 0.085, 0.5), dark, 0, 0.03, -0.15);
    add(sniper, new THREE.BoxGeometry(0.05, 0.02, 0.34), mid, 0, 0.08, -0.15); // riel superior
  // Mira telescópica más fina para dejar más visión
  add(sniper, new THREE.CylinderGeometry(0.024, 0.024, 0.4, 14), mid, 0, 0.118, -0.16, Math.PI / 2); // tubo largo más hacia atrás
  add(sniper, new THREE.CylinderGeometry(0.014, 0.024, 0.035, 14), dark, 0, 0.118, -0.355, Math.PI / 2);
  add(sniper, new THREE.CylinderGeometry(0.012, 0.012, 0.018, 14), lens, 0, 0.118, -0.045, Math.PI / 2); // ocular ya centrado
  add(sniper, new THREE.CylinderGeometry(0.027, 0.027, 0.015, 14), dark, 0, 0.118, -0.33, Math.PI / 2); // anillo
  // desmontura lateral mínima
  add(sniper, new THREE.BoxGeometry(0.02, 0.012, 0.01), acc, 0.022, 0.118, -0.18);
    // cerrojo (tirafor) y manillar que sale por el lateral
    add(sniper, new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8), steel, 0, 0.052, -0.2, Math.PI / 2);
    const boltHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.09, 8), steel);
    boltHandle.position.set(0.05, 0.052, -0.2);
    boltHandle.rotation.z = Math.PI / 2;
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), grip);
    boltKnob.position.set(0.095, 0.052, -0.2);
    sniper.add(boltHandle, boltKnob);
    // culata de madera
    add(sniper, new THREE.BoxGeometry(0.055, 0.095, 0.26), wood, 0, 0.03, 0.18);
    add(sniper, new THREE.BoxGeometry(0.065, 0.105, 0.1), wood, 0, 0.02, 0.33);
    add(sniper, new THREE.BoxGeometry(0.06, 0.02, 0.06), grip, 0, 0.002, 0.3); // cantonera
    // empuñadura y guardamonte
    add(sniper, new THREE.BoxGeometry(0.045, 0.14, 0.06), grip, 0, -0.06, -0.06);
    add(sniper, new THREE.BoxGeometry(0.032, 0.05, 0.09), dark, 0, -0.12, 0.02);
    // cargador (se anima al recargar)
    const sniperMag = new THREE.Group();
    sniperMag.position.set(0, -0.02, -0.14);
    add(sniperMag, new THREE.BoxGeometry(0.042, 0.12, 0.08), mid, 0, -0.06, 0);
    add(sniperMag, new THREE.BoxGeometry(0.046, 0.02, 0.085), dark, 0, 0.002, 0); // boca del cargador
    sniper.add(sniperMag);
    sniperMag.homeY = sniperMag.position.y;
    this.magGroups.sniper = sniperMag;
    this.models.sniper = sniper;

    // ------------------------------------------------------------ smg
    const smg = new THREE.Group();
    // cañón corto + freno de boca (tumbados sobre el eje Z)
    add(smg, new THREE.CylinderGeometry(0.011, 0.011, 0.2, 10), dark, 0, 0.01, -0.44, Math.PI / 2);
    add(smg, new THREE.CylinderGeometry(0.02, 0.014, 0.06, 10), mid, 0, 0.01, -0.57, Math.PI / 2);
    // receptor principal
    add(smg, new THREE.BoxGeometry(0.075, 0.095, 0.36), dark, 0, 0.0, -0.16);
    add(smg, new THREE.BoxGeometry(0.05, 0.016, 0.22), mid, 0, 0.055, -0.16); // riel superior
    // guardamanos con agujeros (riel)
    add(smg, new THREE.BoxGeometry(0.055, 0.07, 0.16), mid, 0, -0.005, -0.38);
    add(smg, new THREE.CylinderGeometry(0.004, 0.004, 0.09, 6), dark, 0, -0.04, -0.38, Math.PI / 2); // detalle riel
    // miras
    add(smg, new THREE.BoxGeometry(0.012, 0.055, 0.012), dark, 0, 0.05, -0.42); // delantera
    add(smg, new THREE.BoxGeometry(0.014, 0.045, 0.016), dark, 0, 0.045, -0.1); // trasera
    // empuñadura con textura y guardamonte
    add(smg, new THREE.BoxGeometry(0.045, 0.13, 0.05), grip, 0, -0.085, 0.0);
    add(smg, new THREE.BoxGeometry(0.05, 0.02, 0.02), grip, 0, -0.1, 0.0); // aro texturado
    add(smg, new THREE.BoxGeometry(0.03, 0.05, 0.1), dark, 0, -0.11, -0.03);
    // culata plegable
    add(smg, new THREE.BoxGeometry(0.055, 0.035, 0.1), dark, 0, 0.0, 0.16);
    add(smg, new THREE.BoxGeometry(0.045, 0.03, 0.08), mid, 0, 0.045, 0.24);
    add(smg, new THREE.CylinderGeometry(0.008, 0.008, 0.1, 6), steel, 0, 0.02, 0.22, Math.PI / 2); // pletina
    // cargador curvo (se anima al recargar)
    const smgMag = new THREE.Group();
    smgMag.position.set(0, -0.055, -0.1);
    add(smgMag, new THREE.BoxGeometry(0.032, 0.17, 0.06), mid, 0, -0.075, 0.01, -0.25);
    add(smgMag, new THREE.BoxGeometry(0.036, 0.05, 0.065), dark, 0, -0.16, 0.02, 0.28);
    add(smgMag, new THREE.BoxGeometry(0.038, 0.015, 0.068), steel, 0, 0.0, 0.01); // boca
    smg.add(smgMag);
    smgMag.homeY = smgMag.position.y;
    this.magGroups.smg = smgMag;
    this.models.smg = smg;

    // ------------------------------------------------------------ cuchillo
    const knife = new THREE.Group();
    // hoja continua con bisel (cuerpo + lomo + punta alineados)
    add(knife, new THREE.BoxGeometry(0.03, 0.05, 0.34), steel, 0, 0.02, -0.24);
    add(knife, new THREE.BoxGeometry(0.022, 0.038, 0.09), steel, 0, 0.02, -0.45); // punta
    add(knife, new THREE.BoxGeometry(0.01, 0.058, 0.3), steel, 0, 0.028, -0.24);  // lomo
    // perforación decorativa cerca de la punta
    for (const off of [-0.34, -0.30]) {
      add(knife, new THREE.CylinderGeometry(0.005, 0.005, 0.016, 8), lens, 0, 0.02, off, Math.PI / 2);
    }
    // guarda
    add(knife, new THREE.BoxGeometry(0.075, 0.026, 0.03), mid, 0, 0.0, -0.055);
    // mango de una sola pieza con virolas
    add(knife, new THREE.BoxGeometry(0.034, 0.045, 0.17), grip, 0, 0.0, 0.05);
    for (const off of [0.0, 0.045, 0.09]) {
      add(knife, new THREE.BoxGeometry(0.037, 0.05, 0.014), dark, 0, 0.0, off);
    }
    add(knife, new THREE.BoxGeometry(0.04, 0.05, 0.024), steel, 0, 0.0, 0.15); // pomo
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
    this.aiming = false;
    this.aimT = 0;
    this.recoil = 0;
    this.swing = 0;
    this.reloadAnim = 0;
    for (const [id, model] of Object.entries(this.models)) model.visible = id === weaponId;
    for (const [id, mg] of Object.entries(this.magGroups)) {
      mg.position.y = mg.homeY;
      mg.rotation.x = 0;
    }
    this.vm.position.copy(HIP_POS);
    this.vm.rotation.set(0, 0, 0);
    this.vm.scale.setScalar(1);
    this.vm.visible = true;
  }

  setZoom(active) {
    this.aiming = !!active;
    this.zoomed = active && this.weaponId === 'sniper';
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

  onReload() { 
    this.audio.reload(); 
    this.reloadAnim = 1.0;
  }

  update(dt, player = null) {
    // transición dinámica apuntar / de cadera (ADS)
    const aimTarget = this.aiming ? 1 : 0;
    this.aimT = clamp01(this.aimT + (aimTarget - this.aimT) * Math.min(1, dt * 12));
    const ads = ADS_POS[this.weaponId] || ADS_POS.smg;
    const hip = HIP_POS;

    // zoom con transición suave
    const aimFov = AIM_FOV[this.weaponId] || this.baseFov;
    const targetFov = lerp(this.baseFov, aimFov, this.aimT);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 14);
      this.camera.updateProjectionMatrix();
    }

    // El viewmodel cuelga de la cámara, así que al reducir el FOV (zoom) se
    // "hincha" y tapa la pantalla. Lo escalamos en proporción al FOV para que
    // conserve su tamaño aparente en pantalla (el francotirador pasaba de 75 a
    // 25 y el arma crecía ~3.4x). Al apuntar con el francotirador lo ocultamos
    // para dejar ver limpiamente por la mira.
    const fovScale = Math.tan((this.camera.fov * Math.PI / 180) / 2) /
                     Math.tan((this.baseFov * Math.PI / 180) / 2);
    this.vm.scale.setScalar(fovScale);
    this.vm.visible = !(this.weaponId === 'sniper' && this.aimT > 0.7);

    // Calcular velocidad local aproximada para hacer el balanceo cinético
    let speed = 0;
    if (player && player.renderPos) {
      if (!this.lastPos) this.lastPos = new THREE.Vector3().copy(player.renderPos);
      const dist = this.lastPos.distanceTo(player.renderPos);
      speed = dist / dt;
      this.lastPos.copy(player.renderPos);
    }

    // retroceso y balanceo (kinetic sway)
    this.recoil = Math.max(0, this.recoil - dt * 6);

    // Sway base + sway extra al moverse; al apuntar casi desaparece y queda un
    // balanceo tenso y lento (postura de tirador).
    const t = performance.now();
    const swayScale = 1 - this.aimT * 0.85;
    const baseSway = Math.sin(t / 900) * 0.003;
    const kineticSwayX = speed > 1 ? Math.sin(t / 150) * 0.015 : 0;
    const kineticSwayY = speed > 1 ? Math.cos(t / 150 * 2) * 0.01 : 0;
    const tensionSwayX = Math.sin(t / 2600) * 0.0016 * this.aimT;
    const tensionSwayY = Math.cos(t / 2900) * 0.0014 * this.aimT;

    this.vm.position.x = lerp(hip.x, ads.x, this.aimT) + (baseSway + kineticSwayX) * swayScale + tensionSwayX;
    this.vm.position.y = lerp(hip.y, ads.y, this.aimT) + (Math.sin(t / 650) * 0.002 + kineticSwayY) * swayScale + tensionSwayY + this.recoil * 0.02 * (1 - this.aimT * 0.5);
    this.vm.position.z = lerp(hip.z, ads.z, this.aimT) + this.recoil * 0.09 * (1 - this.aimT * 0.6);
    this.vm.rotation.x = this.recoil * 0.18 * (1 - this.aimT * 0.5);

    // la luz del fogonazo también se centra al apuntar
    this.muzzleLight.position.x = lerp(0.25, 0.0, this.aimT);
    this.muzzleLight.position.y = lerp(-0.1, -0.06, this.aimT);
    this.muzzleLight.position.z = lerp(-1, -0.6, this.aimT);

    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 4);
      const s = Math.sin((1 - this.swing) * Math.PI);
      this.vm.rotation.z = s * -0.9;
      this.vm.rotation.y = s * 0.5;
      this.vm.position.z += s * 0.18; // estocada del cuchillo
    } else if (this.reloadAnim > 0) {
      const dur = RELOAD_ANIM_DUR[this.weaponId] || 1.5;
      this.reloadAnim = Math.max(0, this.reloadAnim - dt / dur);
      const p = 1 - this.reloadAnim; // 0..1
      const arc = Math.sin(p * Math.PI);
      // Baja y arrima el arma mientras se cambia el cargador
      this.vm.rotation.x += arc * 0.55;
      this.vm.position.y -= arc * 0.25;
      this.vm.position.z += arc * 0.1;
      // Cargador: cae y gira al salir, vuelve y encaja al final
      const mg = this.magGroups[this.weaponId];
      if (mg) {
        const drop = clamp01((p - 0.06) / 0.35);
        const lock = clamp01((p - 0.6) / 0.32);
        const out = drop * (1 - lock);
        mg.position.y = mg.homeY - out * 0.16;
        mg.rotation.x = -out * 0.95;
      }
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
    ray.camera = this.camera;
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
