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
      // Cuchillo: silbido agudo de corte de aire + golpe veloz
      this.burst({ duration: 0.16, freq: 4800, q: 0.9, gain: 0.28, type: 'highpass' });
      this.tone({ duration: 0.13, from: 680, to: 180, gain: 0.11, type: 'sine' });
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

    // Estados para animación cinemática ultra-fluida de las armas (bobbing & sway)
    this.walkWeight = 0;
    this.bobPhase = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.swayTargetX = 0;
    this.swayTargetY = 0;
    this.lastPlayerYaw = null;
    this.lastPlayerPitch = null;
    this.curPos = { x: HIP_POS.x, y: HIP_POS.y, z: HIP_POS.z };
    this.curRot = { x: 0, y: 0, z: 0 };

    this.effects = [];
  }

  buildModels() {
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.35, metalness: 0.82 });
    const mid = new THREE.MeshStandardMaterial({ color: 0x333842, roughness: 0.30, metalness: 0.88 });
    const gunmetal = new THREE.MeshStandardMaterial({ color: 0x282c35, roughness: 0.28, metalness: 0.90 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xdde4ed, roughness: 0.14, metalness: 0.96 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x131518, roughness: 0.92, metalness: 0.08 });
    const polymer = new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.78, metalness: 0.20 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.45, metalness: 0.75 });
    const scopeBody = new THREE.MeshStandardMaterial({ color: 0x1f2228, roughness: 0.28, metalness: 0.85 });
    const scopeRing = new THREE.MeshStandardMaterial({ color: 0x3a404c, roughness: 0.25, metalness: 0.92 });
    const scopeGlass = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.05,
      metalness: 0.15,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
    });
    const holoGlass = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      roughness: 0.05,
      transparent: true,
      opacity: 0.85,
      emissive: 0x0891b2,
      emissiveIntensity: 0.55,
    });
    const holoDot = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const emeraldAcc = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.25,
      metalness: 0.55,
      emissive: 0x064e3b,
      emissiveIntensity: 0.50,
    });

    const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      parent.add(m);
      return m;
    };

    // ------------------------------------------------------------ sniper (Francotirador táctico militar)
    const sniper = new THREE.Group();
    // Cañón estriado de precisión y bocacha
    add(sniper, new THREE.CylinderGeometry(0.014, 0.013, 0.58, 12), gunmetal, 0, 0.032, -0.56, Math.PI / 2);
    add(sniper, new THREE.CylinderGeometry(0.016, 0.016, 0.02, 12), steel, 0, 0.032, -0.84, Math.PI / 2); // corona de acero
    // Freno de boca compensador masivo de doble recámara
    add(sniper, new THREE.BoxGeometry(0.044, 0.034, 0.09), dark, 0, 0.032, -0.88);
    add(sniper, new THREE.BoxGeometry(0.048, 0.020, 0.024), mid, 0, 0.032, -0.865); // ranura 1 gases
    add(sniper, new THREE.BoxGeometry(0.048, 0.020, 0.024), mid, 0, 0.032, -0.900); // ranura 2 gases
    add(sniper, new THREE.CylinderGeometry(0.009, 0.009, 0.01, 8), dark, 0, 0.032, -0.925, Math.PI / 2);

    // Guardamanos táctico con ranuras M-LOK y anillo esmeralda
    add(sniper, new THREE.CylinderGeometry(0.028, 0.028, 0.32, 8), polymer, 0, 0.032, -0.42, Math.PI / 2);
    add(sniper, new THREE.CylinderGeometry(0.029, 0.029, 0.012, 8), emeraldAcc, 0, 0.032, -0.56, Math.PI / 2);

    // Bípode táctico plegado debajo del guardamanos
    add(sniper, new THREE.BoxGeometry(0.032, 0.018, 0.04), dark, 0, 0.006, -0.50);
    add(sniper, new THREE.CylinderGeometry(0.005, 0.005, 0.22, 6), gunmetal, -0.022, -0.004, -0.40, Math.PI / 2);
    add(sniper, new THREE.CylinderGeometry(0.005, 0.005, 0.22, 6), gunmetal, 0.022, -0.004, -0.40, Math.PI / 2);
    add(sniper, new THREE.SphereGeometry(0.008, 6, 6), grip, -0.022, -0.004, -0.29);
    add(sniper, new THREE.SphereGeometry(0.008, 6, 6), grip, 0.022, -0.004, -0.29);

    // Receptor principal monolítico y riel Picatinny
    add(sniper, new THREE.BoxGeometry(0.068, 0.088, 0.44), dark, 0, 0.030, -0.12);
    add(sniper, new THREE.BoxGeometry(0.042, 0.016, 0.38), railMat, 0, 0.082, -0.14);
    // Ventana de expulsión derecha con cerrojo visible
    add(sniper, new THREE.BoxGeometry(0.024, 0.036, 0.12), gunmetal, 0.032, 0.045, -0.18);

    // Cerrojo rotativo táctico de acero cromado con pomo esférico
    add(sniper, new THREE.CylinderGeometry(0.015, 0.015, 0.18, 10), steel, 0, 0.045, -0.18, Math.PI / 2);
    add(sniper, new THREE.CylinderGeometry(0.007, 0.007, 0.075, 8), steel, 0.052, 0.048, -0.19, 0, 0, Math.PI / 2.35);
    add(sniper, new THREE.SphereGeometry(0.016, 8, 8), grip, 0.092, 0.038, -0.19);

    // Mira telescópica militar de alta precisión
    add(sniper, new THREE.CylinderGeometry(0.022, 0.022, 0.36, 16), scopeBody, 0, 0.118, -0.16, Math.PI / 2);
    add(sniper, new THREE.CylinderGeometry(0.019, 0.030, 0.08, 16), scopeBody, 0, 0.118, -0.35, Math.PI / 2); // campana
    add(sniper, new THREE.CylinderGeometry(0.030, 0.030, 0.04, 16), scopeBody, 0, 0.118, -0.40, Math.PI / 2); // parasol
    add(sniper, new THREE.CylinderGeometry(0.027, 0.027, 0.01, 16), scopeGlass, 0, 0.118, -0.38, Math.PI / 2); // lente frontal
    add(sniper, new THREE.CylinderGeometry(0.024, 0.019, 0.06, 16), scopeBody, 0, 0.118, -0.04, Math.PI / 2); // ocular
    add(sniper, new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16), grip, 0, 0.118, 0.00, Math.PI / 2);
    add(sniper, new THREE.CylinderGeometry(0.021, 0.021, 0.008, 16), scopeGlass, 0, 0.118, -0.01, Math.PI / 2);
    // Torretas tácticas de ajuste
    add(sniper, new THREE.BoxGeometry(0.050, 0.048, 0.050), scopeBody, 0, 0.118, -0.18);
    add(sniper, new THREE.CylinderGeometry(0.012, 0.012, 0.022, 12), scopeRing, 0, 0.150, -0.18);
    add(sniper, new THREE.CylinderGeometry(0.012, 0.012, 0.022, 12), scopeRing, 0.034, 0.118, -0.18, 0, 0, Math.PI / 2);
    add(sniper, new THREE.CylinderGeometry(0.010, 0.010, 0.018, 12), scopeRing, -0.032, 0.118, -0.18, 0, 0, Math.PI / 2);
    // Anillas de montaje al riel
    add(sniper, new THREE.CylinderGeometry(0.026, 0.026, 0.022, 12), scopeRing, 0, 0.118, -0.26, Math.PI / 2);
    add(sniper, new THREE.BoxGeometry(0.038, 0.024, 0.022), scopeRing, 0, 0.098, -0.26);
    add(sniper, new THREE.CylinderGeometry(0.026, 0.026, 0.022, 12), scopeRing, 0, 0.118, -0.10, Math.PI / 2);
    add(sniper, new THREE.BoxGeometry(0.038, 0.024, 0.022), scopeRing, 0, 0.098, -0.10);

    // Culata táctica modular esquelética
    add(sniper, new THREE.BoxGeometry(0.048, 0.052, 0.24), polymer, 0, 0.036, 0.18);
    add(sniper, new THREE.BoxGeometry(0.036, 0.022, 0.20), gunmetal, 0, -0.020, 0.18, -0.15);
    add(sniper, new THREE.BoxGeometry(0.054, 0.038, 0.14), grip, 0, 0.076, 0.18); // carrillera
    add(sniper, new THREE.CylinderGeometry(0.007, 0.007, 0.06, 8), steel, 0, 0.056, 0.18, 0, 0, Math.PI / 2);
    add(sniper, new THREE.BoxGeometry(0.052, 0.116, 0.02), dark, 0, 0.022, 0.31);
    add(sniper, new THREE.BoxGeometry(0.054, 0.120, 0.024), grip, 0, 0.022, 0.328); // cantonera

    // Empuñadura táctica y guardamonte
    add(sniper, new THREE.BoxGeometry(0.040, 0.138, 0.055), grip, 0, -0.068, -0.04, -0.32);
    add(sniper, new THREE.BoxGeometry(0.026, 0.042, 0.08), dark, 0, -0.038, -0.10);
    add(sniper, new THREE.BoxGeometry(0.008, 0.024, 0.014), steel, 0, -0.032, -0.09, -0.2); // gatillo match

    // Cargador extraíble de gran calibre
    const sniperMag = new THREE.Group();
    sniperMag.position.set(0, -0.02, -0.14);
    add(sniperMag, new THREE.BoxGeometry(0.038, 0.13, 0.082), mid, 0, -0.065, 0, -0.08);
    add(sniperMag, new THREE.BoxGeometry(0.042, 0.020, 0.088), dark, 0, -0.132, 0.005);
    add(sniperMag, new THREE.BoxGeometry(0.044, 0.012, 0.086), emeraldAcc, 0, -0.120, 0.004); // banda esmeralda
    sniper.add(sniperMag);
    sniperMag.homeY = sniperMag.position.y;
    this.magGroups.sniper = sniperMag;
    this.models.sniper = sniper;

    // ------------------------------------------------------------ smg (Subfusil táctico CQB)
    const smg = new THREE.Group();
    // Cañón corto con compensador multi-puerto
    add(smg, new THREE.CylinderGeometry(0.012, 0.012, 0.18, 12), gunmetal, 0, 0.012, -0.46, Math.PI / 2);
    add(smg, new THREE.CylinderGeometry(0.019, 0.016, 0.07, 12), dark, 0, 0.012, -0.57, Math.PI / 2);
    add(smg, new THREE.CylinderGeometry(0.014, 0.014, 0.01, 8), dark, 0, 0.012, -0.61, Math.PI / 2);

    // Receptor principal compacto y guardamanos M-LOK
    add(smg, new THREE.BoxGeometry(0.068, 0.092, 0.36), dark, 0, 0.008, -0.16);
    add(smg, new THREE.BoxGeometry(0.058, 0.082, 0.18), mid, 0, 0.006, -0.38);
    add(smg, new THREE.BoxGeometry(0.040, 0.014, 0.48), railMat, 0, 0.058, -0.23); // riel Picatinny continuo
    // Ranuras M-LOK de refrigeración
    for (const offZ of [-0.34, -0.39, -0.44]) {
      add(smg, new THREE.BoxGeometry(0.062, 0.014, 0.024), dark, 0, 0.006, offZ);
    }
    // Palanca de montar táctica izq y ventana de expulsión der
    add(smg, new THREE.BoxGeometry(0.018, 0.016, 0.03), steel, -0.040, 0.038, -0.34);
    add(smg, new THREE.BoxGeometry(0.022, 0.030, 0.09), steel, 0.032, 0.026, -0.16);

    // Mira Holográfica Táctica de punto rojo/verde
    add(smg, new THREE.BoxGeometry(0.042, 0.018, 0.09), dark, 0, 0.072, -0.18); // montura
    add(smg, new THREE.BoxGeometry(0.044, 0.008, 0.08), mid, 0, 0.124, -0.18); // visera techo
    add(smg, new THREE.BoxGeometry(0.007, 0.046, 0.08), mid, -0.021, 0.098, -0.18); // lateral izq
    add(smg, new THREE.BoxGeometry(0.007, 0.046, 0.08), mid, 0.021, 0.098, -0.18); // lateral der
    add(smg, new THREE.BoxGeometry(0.034, 0.040, 0.005), holoGlass, 0, 0.098, -0.18); // cristal óptico
    add(smg, new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 8), holoDot, 0, 0.098, -0.18, Math.PI / 2); // punto verde brillante

    // Módulo láser táctico lateral
    add(smg, new THREE.BoxGeometry(0.020, 0.024, 0.08), dark, 0.042, 0.018, -0.36);
    add(smg, new THREE.CylinderGeometry(0.006, 0.006, 0.006, 8), emeraldAcc, 0.042, 0.018, -0.405, Math.PI / 2);

    // Empuñadura angular delantera (Angled Foregrip)
    add(smg, new THREE.BoxGeometry(0.034, 0.052, 0.08), grip, 0, -0.058, -0.35, 0.45);
    add(smg, new THREE.BoxGeometry(0.036, 0.012, 0.06), emeraldAcc, 0, -0.040, -0.33, 0.45);

    // Empuñadura ergonómica de pistola
    add(smg, new THREE.BoxGeometry(0.038, 0.135, 0.052), grip, 0, -0.078, 0.01, -0.30);
    add(smg, new THREE.BoxGeometry(0.024, 0.038, 0.09), dark, 0, -0.048, -0.04);
    add(smg, new THREE.BoxGeometry(0.007, 0.022, 0.012), steel, 0, -0.040, -0.03, -0.2);

    // Culata táctica extensible PDW con varillas de acero
    add(smg, new THREE.CylinderGeometry(0.005, 0.005, 0.22, 6), steel, -0.030, 0.015, 0.14, Math.PI / 2);
    add(smg, new THREE.CylinderGeometry(0.005, 0.005, 0.22, 6), steel, 0.030, 0.015, 0.14, Math.PI / 2);
    add(smg, new THREE.BoxGeometry(0.046, 0.082, 0.024), grip, 0, 0.015, 0.25);

    // Cargador curvo táctico de alta capacidad (se anima al recargar)
    const smgMag = new THREE.Group();
    smgMag.position.set(0, -0.055, -0.1);
    add(smgMag, new THREE.BoxGeometry(0.032, 0.14, 0.058), mid, 0, -0.075, 0.01, -0.20);
    add(smgMag, new THREE.BoxGeometry(0.032, 0.09, 0.056), dark, 0, -0.170, 0.03, 0.22);
    add(smgMag, new THREE.BoxGeometry(0.036, 0.018, 0.062), emeraldAcc, 0, -0.215, 0.04, 0.22); // talón esmeralda
    smg.add(smgMag);
    smgMag.homeY = smgMag.position.y;
    this.magGroups.smg = smgMag;
    this.models.smg = smg;

    // ------------------------------------------------------------ cuchillo táctico de combate
    const knife = new THREE.Group();
    const bladeSteel = new THREE.MeshStandardMaterial({ color: 0xdde4ec, roughness: 0.16, metalness: 0.94 });
    const bladeEdge = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0.98 });
    const bladeSpineMat = new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.38, metalness: 0.75 });
    const bloodGroove = new THREE.MeshStandardMaterial({ color: 0x121418, roughness: 0.6, metalness: 0.85 });
    const guardMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.32, metalness: 0.82 });
    const handleGrip = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.88, metalness: 0.14 });
    const handleRibs = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.95, metalness: 0.05 });
    const emeraldAccent = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.25,
      metalness: 0.6,
      emissive: 0x064e3b,
      emissiveIntensity: 0.45,
    });
    const screwMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.18, metalness: 0.95 });

    // Hoja: cuerpo principal de acero pulido
    add(knife, new THREE.BoxGeometry(0.015, 0.044, 0.29), bladeSteel, 0, 0.016, -0.215);
    // Filo inferior cortante biselado ultra afilado
    add(knife, new THREE.BoxGeometry(0.008, 0.018, 0.29), bladeEdge, 0, -0.012, -0.215);
    // Lomo táctico superior oscuro antirreflejo
    add(knife, new THREE.BoxGeometry(0.018, 0.016, 0.29), bladeSpineMat, 0, 0.040, -0.215);
    // Dientes de sierra tácticos de supervivencia en el lomo superior
    for (let i = 0; i < 5; i++) {
      const zOff = -0.11 - i * 0.024;
      add(knife, new THREE.BoxGeometry(0.019, 0.010, 0.014), bladeSpineMat, 0, 0.048, zOff, 0.5);
    }
    // Ranura de sangría / aligeramiento central en la hoja
    add(knife, new THREE.BoxGeometry(0.017, 0.008, 0.21), bloodGroove, 0, 0.018, -0.21);
    // Orificios tácticos de aligeramiento
    for (const offZ of [-0.33, -0.28, -0.23]) {
      add(knife, new THREE.CylinderGeometry(0.0048, 0.0048, 0.02, 12), emeraldAccent, 0, 0.024, offZ, 0, 0, Math.PI / 2);
    }
    // Punta agresiva estilo Clip-Point / Tanto
    add(knife, new THREE.BoxGeometry(0.014, 0.038, 0.11), bladeSteel, 0, 0.012, -0.405, 0.32);
    add(knife, new THREE.BoxGeometry(0.007, 0.022, 0.10), bladeEdge, 0, -0.008, -0.40, -0.25);
    add(knife, new THREE.ConeGeometry(0.007, 0.045, 4), bladeSteel, 0, 0.005, -0.465, -Math.PI / 2, Math.PI / 4, 0);

    // Guarda táctica de titanio con rampa de pulgar estriada y tope de seguridad
    add(knife, new THREE.BoxGeometry(0.044, 0.042, 0.022), guardMat, 0, 0.004, -0.065);
    add(knife, new THREE.BoxGeometry(0.038, 0.030, 0.026), guardMat, 0, 0.034, -0.068, -0.2); // rampa pulgar
    for (let j = 0; j < 3; j++) {
      add(knife, new THREE.BoxGeometry(0.040, 0.005, 0.004), bladeSpineMat, 0, 0.050, -0.063 - j * 0.006);
    }
    add(knife, new THREE.BoxGeometry(0.034, 0.034, 0.024), guardMat, 0, -0.024, -0.068, 0.25); // quillon inferior

    // Anillo espaciador táctico esmeralda
    add(knife, new THREE.BoxGeometry(0.033, 0.046, 0.008), emeraldAccent, 0, 0.004, -0.052);

    // Empuñadura ergonómica de combate contorneada
    add(knife, new THREE.BoxGeometry(0.029, 0.045, 0.052), handleGrip, 0, 0.004, -0.022);
    add(knife, new THREE.BoxGeometry(0.031, 0.048, 0.062), handleGrip, 0, 0.003, 0.033);
    add(knife, new THREE.BoxGeometry(0.029, 0.044, 0.050), handleGrip, 0, 0.004, 0.088);
    // Ranuras antideslizantes para los dedos en la parte inferior
    for (let f = 0; f < 4; f++) {
      add(knife, new THREE.BoxGeometry(0.032, 0.009, 0.016), handleRibs, 0, -0.021, -0.026 + f * 0.034);
    }
    // Paneles laterales texturizados
    add(knife, new THREE.BoxGeometry(0.033, 0.032, 0.145), handleRibs, 0, 0.005, 0.033);
    // Tornillos Torx de sujeción
    for (const boltZ of [-0.012, 0.036, 0.082]) {
      add(knife, new THREE.CylinderGeometry(0.0055, 0.0055, 0.035, 8), screwMat, 0, 0.005, boltZ, 0, 0, Math.PI / 2);
    }
    // Segundo anillo espaciador esmeralda antes del pomo
    add(knife, new THREE.BoxGeometry(0.032, 0.045, 0.006), emeraldAccent, 0, 0.004, 0.114);

    // Pomo táctico macizo con rompecristales y orificio pasador
    add(knife, new THREE.BoxGeometry(0.035, 0.048, 0.022), guardMat, 0, 0.004, 0.126);
    add(knife, new THREE.ConeGeometry(0.008, 0.026, 6), bladeSteel, 0, 0.004, 0.148, -Math.PI / 2);
    add(knife, new THREE.CylinderGeometry(0.005, 0.005, 0.038, 8), bladeSpineMat, 0, 0.014, 0.126, 0, 0, Math.PI / 2);

    // Postura de guardia táctica en primera persona:
    // ligera inclinación para exhibir el filo, el lomo dentado y los acabados tácticos
    knife.position.set(-0.02, 0.02, 0.02);
    knife.rotation.set(-0.08, -0.22, 0.14);

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
    this.walkWeight = 0;
    this.bobPhase = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.swayTargetX = 0;
    this.swayTargetY = 0;
    this.lastPlayerYaw = null;
    this.lastPlayerPitch = null;
    this.curPos = { x: HIP_POS.x, y: HIP_POS.y, z: HIP_POS.z };
    this.curRot = { x: 0, y: 0, z: 0 };
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
    this.recoil = Math.min(1, this.recoil + (this.weaponId === 'sniper' ? 1 : (this.weaponId === 'knife' ? 0 : 0.45)));
    this.flashTime = this.weaponId === 'knife' ? 0 : 0.06;
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

    // Determinar intención de movimiento del jugador
    let isMoving = false;
    let isSprinting = false;
    let isCrouching = false;
    if (player && player.keys) {
      const hasMoveKey = player.keys.has('KeyW') || player.keys.has('KeyS') ||
                         player.keys.has('KeyA') || player.keys.has('KeyD');
      isMoving = hasMoveKey && (player.movementAllowed !== false) && (player.onGround !== false);
      isSprinting = isMoving && (player.keys.has('ShiftLeft') || player.keys.has('ShiftRight'));
      isCrouching = isMoving && (player.keys.has('ControlLeft') || player.keys.has('ControlRight'));
    }

    // Suavizado exponencial del peso de caminata (transición suave al arrancar y frenar)
    const targetWeight = isMoving ? (isSprinting ? 1.3 : (isCrouching ? 0.45 : 1.0)) : 0.0;
    this.walkWeight += (targetWeight - this.walkWeight) * Math.min(1, dt * 10);

    // Ciclo continuo y armónico de pisadas (rad/s)
    const cycleFreq = isSprinting ? 12.0 : (isCrouching ? 6.5 : 9.2);
    this.bobPhase += dt * cycleFreq * this.walkWeight;

    // Retroceso físico que decae suavemente
    this.recoil = Math.max(0, this.recoil - dt * 6.5);

    // Amortiguación al apuntar con la mira (ADS)
    const swayScale = 1 - this.aimT * 0.88;

    // Bobbing orgánico continuo (curva Lissajous U-shape):
    const p = this.bobPhase;
    const sinP = Math.sin(p);
    const cos2P = Math.cos(p * 2);
    const sin2P = Math.sin(p * 2);

    // - Lateral (X): oscilación cadenciosa de hombro/cadera (izq - der)
    const bobX = sinP * 0.0075 * this.walkWeight * swayScale;
    // - Vertical (Y): doble descenso en cada paso con rebote elástico suave
    const bobY = (cos2P - 1) * 0.0042 * this.walkWeight * swayScale;
    // - Inclinación muñeca (Z): rotación lateral orgánica en cada zancada
    const bobRoll = sinP * 0.018 * this.walkWeight * swayScale;
    // - Cabeceo cañón (X): ligera compresión vertical rítmica
    const bobPitch = sin2P * 0.008 * this.walkWeight * swayScale;

    // Inercia de giro de la mira al rotar la vista (rotational sway de ratón)
    if (player) {
      if (this.lastPlayerYaw === null) {
        this.lastPlayerYaw = player.yaw;
        this.lastPlayerPitch = player.pitch;
      }
      let dy = player.yaw - this.lastPlayerYaw;
      let dp = player.pitch - this.lastPlayerPitch;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.lastPlayerYaw = player.yaw;
      this.lastPlayerPitch = player.pitch;

      const maxSway = 0.024;
      this.swayTargetX = Math.max(-maxSway, Math.min(maxSway, -dy * 0.42));
      this.swayTargetY = Math.max(-maxSway, Math.min(maxSway, dp * 0.42));
    }

    const swaySmooth = 1 - Math.exp(-18 * dt);
    this.swayX += (this.swayTargetX - this.swayX) * swaySmooth;
    this.swayY += (this.swayTargetY - this.swayY) * swaySmooth;
    this.swayTargetX *= Math.exp(-14 * dt);
    this.swayTargetY *= Math.exp(-14 * dt);

    // Respiración idle suave cuando no camina
    const tSec = performance.now() * 0.001;
    const idleWeight = (1 - this.walkWeight * 0.85) * swayScale;
    const idleX = Math.sin(tSec * 1.2) * 0.0016 * idleWeight;
    const idleY = Math.cos(tSec * 1.8) * 0.0012 * idleWeight;
    const idleRotX = Math.cos(tSec * 1.2) * 0.003 * idleWeight;
    const idleRotZ = Math.sin(tSec * 0.9) * 0.0025 * idleWeight;

    // Posición y rotación objetivo cinemática
    const targetX = lerp(hip.x, ads.x, this.aimT) + idleX + bobX + this.swayX * swayScale;
    const targetY = lerp(hip.y, ads.y, this.aimT) + idleY + bobY + this.swayY * swayScale + this.recoil * 0.02 * (1 - this.aimT * 0.5);
    const targetZ = lerp(hip.z, ads.z, this.aimT) + this.recoil * 0.09 * (1 - this.aimT * 0.6);

    const targetRotX = this.recoil * 0.18 * (1 - this.aimT * 0.5) + bobPitch + idleRotX - (this.swayY * 0.55) * swayScale;
    const targetRotY = (this.swayX * 0.45) * swayScale;
    const targetRotZ = bobRoll + idleRotZ - (this.swayX * 0.32) * swayScale;

    // Filtro de interpolación cinemática continua
    const smoothK = 1 - Math.exp(-28 * dt);
    this.curPos.x += (targetX - this.curPos.x) * smoothK;
    this.curPos.y += (targetY - this.curPos.y) * smoothK;
    this.curPos.z += (targetZ - this.curPos.z) * smoothK;

    this.curRot.x += (targetRotX - this.curRot.x) * smoothK;
    this.curRot.y += (targetRotY - this.curRot.y) * smoothK;
    this.curRot.z += (targetRotZ - this.curRot.z) * smoothK;

    // Offset de animación independientes (cuchillo y recarga)
    let animX = 0;
    let animY = 0;
    let animZ = 0;
    let animRotX = 0;
    let animRotY = 0;
    let animRotZ = 0;

    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 3.8);
      const p = 1 - this.swing; // 0..1

      // Tajo puramente vertical en 3 fases:
      // Fase 1 (0 -> 0.18): Elevación y carga hacia arriba del cuchillo
      // Fase 2 (0.18 -> 0.58): Tajo vertical descendente contundente y rápido
      // Fase 3 (0.58 -> 1.0): Recuperación suave de vuelta a la guardia
      if (p < 0.18) {
        const t1 = p / 0.18;
        const e1 = Math.sin(t1 * Math.PI * 0.5);
        animRotX = e1 * 0.65;  // Punta hacia arriba/atrás (+37°)
        animY = e1 * 0.12;      // Eleva la mano
        animZ = e1 * 0.06;      // Retrae ligeramente
        animRotZ = e1 * -0.06;
      } else if (p < 0.58) {
        const t2 = (p - 0.18) / 0.40;
        const e2 = Math.sin(t2 * Math.PI * 0.5);
        animRotX = 0.65 - e2 * 2.05; // Cae con fuerza de +0.65 a -1.40 rad (tajo vertical descendente)
        animY = 0.12 - e2 * 0.40;     // Recorrido vertical hacia abajo de +0.12 a -0.28
        animZ = 0.06 - Math.sin(t2 * Math.PI) * 0.24; // Estocada frontal en el tajo
        animRotZ = -0.06 + Math.sin(t2 * Math.PI) * 0.10;
      } else {
        const t3 = (p - 0.58) / 0.42;
        const e3 = 1 - Math.cos(t3 * Math.PI * 0.5); // Retorno suave
        animRotX = -1.40 * (1 - e3);
        animY = -0.28 * (1 - e3);
        animZ = -0.04 * (1 - e3);
        animRotZ = 0.04 * (1 - e3);
      }

      animRotY = animRotZ * 0.2;
    } else if (this.reloadAnim > 0) {
      const dur = RELOAD_ANIM_DUR[this.weaponId] || 1.5;
      this.reloadAnim = Math.max(0, this.reloadAnim - dt / dur);
      const p = 1 - this.reloadAnim; // 0..1
      const arc = Math.sin(p * Math.PI);
      // Baja y arrima el arma mientras se cambia el cargador
      animRotX = arc * 0.55;
      animY = -arc * 0.25;
      animZ = arc * 0.1;
      // Cargador: cae y gira al salir, vuelve y encaja al final
      const mg = this.magGroups[this.weaponId];
      if (mg) {
        const drop = clamp01((p - 0.06) / 0.35);
        const lock = clamp01((p - 0.6) / 0.32);
        const out = drop * (1 - lock);
        mg.position.y = mg.homeY - out * 0.16;
        mg.rotation.x = -out * 0.95;
      }
    }

    this.vm.position.set(
      this.curPos.x + animX,
      this.curPos.y + animY,
      this.curPos.z + animZ
    );
    this.vm.rotation.set(
      this.curRot.x + animRotX,
      this.curRot.y + animRotY,
      this.curRot.z + animRotZ
    );

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
    const hasDist = typeof evt.dist === 'number' && Number.isFinite(evt.dist);
    const dist = hasDist
      ? evt.dist
      : (() => {
          const maxT = evt.melee ? 3 : 200;
          const hit = this.raycast(evt.origin, evt.dir, maxT);
          return hit ? hit.distance : (evt.melee ? 2.2 : maxT);
        })();

    if (!evt.melee) {
      const end = {
        x: evt.origin.x + evt.dir.x * dist,
        y: evt.origin.y + evt.dir.y * dist,
        z: evt.origin.z + evt.dir.z * dist,
      };
      this.spawnTracer(evt.origin, end);
      this.spawnImpact(end);
    } else if (dist < 2.5) {
      const end = {
        x: evt.origin.x + evt.dir.x * dist,
        y: evt.origin.y + evt.dir.y * dist,
        z: evt.origin.z + evt.dir.z * dist,
      };
      this.spawnImpact(end);
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
