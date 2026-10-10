// Renderizado 3D con Three.js: escena de juego (gris claro), escena de
// preview del lobby y construcción de los personajes poligonales de cristal.

import * as THREE from 'three';
import { RoomEnvironment } from '/lib/RoomEnvironment.js';

export const COLORS = {
  background: 0xd9d9d9,
  ground: 0x7a5230,   // suelo café
  wall: 0xf4f4f4,     // paredes blancas
  boxes: [0x2f6fd1, 0x3f86e0, 0x1f5bb5, 0x5aa0ec], // objetos/obstáculos azules
};

export function createGlassCharacter(colorHex) {
  const group = new THREE.Group();
  const color = new THREE.Color(colorHex);

  const material = new THREE.MeshPhysicalMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.18,
    metalness: 0,
    roughness: 0.12,
    transmission: 0.8,
    thickness: 0.7,
    ior: 1.45,
    attenuationColor: color,
    attenuationDistance: 1.4,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const part = (geometry, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  // cabeza y torso (low-poly)
  part(new THREE.OctahedronGeometry(0.24, 0), 0, 1.62, 0);
  part(new THREE.BoxGeometry(0.55, 0.68, 0.3), 0, 1.14, 0);
  part(new THREE.BoxGeometry(0.46, 0.26, 0.3), 0, 0.72, 0);

  // brazos con pivote en el hombro (para animación)
  const armGeo = new THREE.BoxGeometry(0.15, 0.58, 0.15);
  const rightArm = new THREE.Group();
  rightArm.position.set(0.36, 1.42, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, material);
  rightArmMesh.position.y = -0.29;
  rightArmMesh.castShadow = true;
  rightArm.add(rightArmMesh);
  group.add(rightArm);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.36, 1.42, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, material);
  leftArmMesh.position.y = -0.29;
  leftArmMesh.castShadow = true;
  leftArm.add(leftArmMesh);
  group.add(leftArm);

  // piernas con pivote en la cadera
  const legGeo = new THREE.BoxGeometry(0.18, 0.7, 0.18);
  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.14, 0.7, 0);
  const rightLegMesh = new THREE.Mesh(legGeo, material);
  rightLegMesh.position.y = -0.35;
  rightLegMesh.castShadow = true;
  rightLeg.add(rightLegMesh);
  group.add(rightLeg);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.14, 0.7, 0);
  const leftLegMesh = new THREE.Mesh(legGeo, material);
  leftLegMesh.position.y = -0.35;
  leftLegMesh.castShadow = true;
  leftLeg.add(leftLegMesh);
  group.add(leftLeg);

  // arma en la mano derecha (caja simple según el arma)
  const weaponHolder = new THREE.Group();
  weaponHolder.position.set(0, -0.55, 0);
  rightArm.add(weaponHolder);

  // etiqueta de nombre (sprite)
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false });
  const label = new THREE.Sprite(labelMat);
  label.scale.set(1.6, 0.4, 1);
  label.position.y = 2.15;
  label.renderOrder = 10;
  group.add(label);
  label.raycast = () => {}; // las etiquetas no deben interceptar balas

  // barra de vida (dos planos simples)
  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.09),
    new THREE.MeshBasicMaterial({ color: 0x222222, depthTest: false, transparent: true, opacity: 0.7 }),
  );
  hpBg.position.y = 1.98;
  hpBg.renderOrder = 9;
  group.add(hpBg);
  hpBg.raycast = () => {};

  const hpBar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.055),
    new THREE.MeshBasicMaterial({ color: 0x5cb85c, depthTest: false }),
  );
  hpBar.position.y = 1.98;
  hpBar.renderOrder = 10;
  group.add(hpBar);
  hpBar.raycast = () => {};

  const char = {
    group,
    material,
    rightArm,
    leftArm,
    rightLeg,
    leftLeg,
    weaponHolder,
    label,
    labelCanvas,
    labelTex,
    hpBar,
    hpBg,
    phase: Math.random() * Math.PI * 2,
    lastPos: new THREE.Vector3(),
    speed: 0,
    deadT: 0,
  };
  setCharacterLabel(char, '');
  return char;
}

export function setCharacterLabel(char, text, color = '#ffffff') {
  const ctx = char.labelCanvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, 128, 32);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 32);
  char.labelTex.needsUpdate = true;
}

export function setCharacterWeapon(char, weaponId) {
  // El arma es un Group: hay que recorrerlo para liberar sus geometrías.
  // (Antes se hacía `old.geometry.dispose()` sobre el Group, lo que lanzaba
  // una excepción y dejaba el modelo del arma anterior pegado a la mano:
  // en las rondas de cuchillo seguían viéndose las armas de la ronda previa.)
  for (const child of [...char.weaponHolder.children]) {
    char.weaponHolder.remove(child);
    child.traverse?.((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.dispose) o.material.dispose();
    });
  }
  if (!weaponId) return;

  const dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.5 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.5, metalness: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.8, metalness: 0.1 });
  
  const group = new THREE.Group();
  
  const addPart = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    group.add(m);
  };

  if (weaponId === 'sniper') {
    addPart(new THREE.BoxGeometry(0.06, 0.08, 0.9), dark, 0, 0, -0.3);
    addPart(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), mid, 0, 0.05, -0.6, Math.PI / 2);
    addPart(new THREE.BoxGeometry(0.05, 0.14, 0.25), wood, 0, -0.06, 0.1); // culata
    addPart(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 8), mid, 0, 0.1, -0.1, Math.PI / 2); // mira
  } else if (weaponId === 'smg') {
    addPart(new THREE.BoxGeometry(0.08, 0.1, 0.45), dark, 0, 0, -0.2);
    addPart(new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8), mid, 0, 0.02, -0.5, Math.PI / 2);
    addPart(new THREE.BoxGeometry(0.04, 0.18, 0.07), mid, 0, -0.12, -0.05, 0.1); // cargador
  } else {
    // cuchillo: piezas contiguas orientadas hacia delante (-Z), igual que el
    // resto de armas del personaje. Antes se construía sobre el eje Y, por lo
    // que sobresalía hacia arriba y se veía como bloques sueltos.
    const steel = new THREE.MeshStandardMaterial({ color: 0xc4c9cf, roughness: 0.3, metalness: 0.85 });
    const handle = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.85, metalness: 0.1 });
    addPart(new THREE.BoxGeometry(0.022, 0.052, 0.24), steel, 0, 0.02, -0.16);   // hoja
    addPart(new THREE.BoxGeometry(0.016, 0.04, 0.09), steel, 0, 0.02, -0.315);   // punta
    addPart(new THREE.BoxGeometry(0.008, 0.03, 0.2), steel, 0, 0.045, -0.17);    // lomo
    addPart(new THREE.BoxGeometry(0.05, 0.024, 0.032), mid, 0, 0.02, -0.045);    // guarda
    addPart(new THREE.BoxGeometry(0.03, 0.042, 0.15), handle, 0, 0.02, 0.05);    // mango
    addPart(new THREE.BoxGeometry(0.036, 0.05, 0.024), steel, 0, 0.02, 0.135);   // pomo
  }

  group.position.set(0, 0.02, 0);
  // el arma se alinea con el antebrazo (que apunta hacia delante tras rotar
  // el brazo en X) para que el cañón mire al frente y no hacia el suelo
  group.rotation.x = -Math.PI / 2;
  char.weaponHolder.add(group);
}

// pos/rot del servidor → personaje en escena
export function updateCharacter(char, p, dt) {
  const g = char.group;
  const targetScale = p.crouch ? 0.68 : 1;
  g.scale.y += (targetScale - g.scale.y) * Math.min(1, dt * 12);
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.yaw;

  if (!p.alive) {
    char.deadT = Math.min(1, char.deadT + dt * 5);
    g.rotation.x = -Math.PI * 0.5 * char.deadT;
    g.position.y = p.y + 0.25 * char.deadT;
    char.hpBar.visible = false;
    char.hpBg.visible = false;
    return;
  }
  char.deadT = 0;
  g.rotation.x = 0;
  char.hpBar.visible = true;
  char.hpBg.visible = true;

  // velocidad de desplazamiento para la animación de caminar
  const dx = p.x - char.lastPos.x;
  const dz = p.z - char.lastPos.z;
  const inst = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
  char.speed += (inst - char.speed) * Math.min(1, dt * 10);
  char.lastPos.set(p.x, p.y, p.z);

  char.phase += dt * (4 + char.speed * 1.6);
  const swing = Math.sin(char.phase) * Math.min(0.7, char.speed * 0.12);
  char.rightLeg.rotation.x = swing;
  char.leftLeg.rotation.x = -swing;
  char.leftArm.rotation.x = -swing * 0.8;
  // brazo derecho siempre en posición de apuntar/objetivo
  char.rightArm.rotation.x = Math.PI / 2 + swing * 0.2;

  // barra de vida (0..1)
  const frac = Math.max(0, Math.min(1, p.hp / 100));
  char.hpBar.scale.x = frac;
  char.hpBar.position.x = -(1 - frac) * 0.43;
  char.hpBar.material.color.setHex(frac > 0.5 ? 0x5cb85c : frac > 0.25 ? 0xf0c419 : 0xd9534f);
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);
    this.previewCamera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 50);
    this.previewCamera.position.set(0, 1.35, 3.6);
    this.previewCamera.lookAt(0, 1.05, 0);

    this.gameScene = this.buildGameScene();
    this.previewScene = this.buildPreviewScene();
    this.mode = 'preview';
    this.onFrame = null;
    this.lastT = performance.now();

    window.addEventListener('resize', () => this.resize());
  }

  setupEnvironment(scene) {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
  }

  buildGameScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.background);
    
    // Niebla atmosférica profunda
    scene.fog = new THREE.FogExp2(COLORS.background, 0.015);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x7b8b9a, 0.8);
    scene.add(hemi);
    
    // Luz de relleno cálida para dar contraste
    const fillLight = new THREE.DirectionalLight(0xffdbb8, 0.6);
    fillLight.position.set(-20, 15, -20);
    scene.add(fillLight);

    const sun = new THREE.DirectionalLight(0xffffff, 2.4);
    sun.position.set(35, 55, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0004;
    scene.add(sun);

    this.setupEnvironment(scene);
    return scene;
  }

  buildPreviewScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.background);
    scene.fog = new THREE.FogExp2(COLORS.background, 0.018);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a9a, 1.0));

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 8, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -14;
    key.shadow.camera.right = 14;
    key.shadow.camera.top = 14;
    key.shadow.camera.bottom = -14;
    key.shadow.camera.far = 40;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0xffffff, 1.0);
    rim.position.set(-4, 3, -3);
    scene.add(rim);

    this.setupEnvironment(scene);

    // ---- sección del mapa de fondo: suelo café, muros blancos, objetos azules
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 0.95, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    scene.add(ground);

    const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.9 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(52, 6, 1), wallMat);
    back.position.set(0, 2.8, -11);
    back.receiveShadow = true;
    scene.add(back);
    const sideL = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 30), wallMat);
    sideL.position.set(-15, 2.8, -4);
    scene.add(sideL);
    const sideR = new THREE.Mesh(new THREE.BoxGeometry(1, 6, 30), wallMat);
    sideR.position.set(15, 2.8, -4);
    scene.add(sideR);

    const boxSpecs = [
      [-3.2, -3.5, 1.6, 1.4, 1.6],
      [3.4, -4.2, 2.0, 2.6, 2.0],
      [-5.6, -6.6, 1.4, 1.8, 1.4],
      [5.9, -7.1, 2.4, 1.2, 2.4],
      [-7.6, -2.6, 1.2, 2.2, 1.2],
      [7.3, -2.2, 1.4, 1.6, 1.4],
      [-2.1, -8.6, 2.2, 3.0, 2.2],
      [4.1, -9.1, 1.6, 2.0, 1.6],
    ];
    boxSpecs.forEach(([x, z, w, h, d], i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS.boxes[i % COLORS.boxes.length], roughness: 0.85, metalness: 0.04,
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, h / 2 - 0.2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    });

    const cylSpecs = [[-6.2, -4.2, 0.9, 2.4], [6.6, -5.2, 1.1, 1.8]];
    cylSpecs.forEach(([x, z, r, h], i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS.boxes[(i + 1) % COLORS.boxes.length], roughness: 0.8, metalness: 0.04,
      });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), mat);
      m.position.set(x, h / 2 - 0.2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
    });

    // pedestal del personaje en el lobby
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.3, 0.18, 48),
      new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.7 }),
    );
    base.position.y = -0.09;
    base.receiveShadow = true;
    scene.add(base);
    return scene;
  }

  setMode(mode) {
    this.mode = mode;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    for (const cam of [this.camera, this.previewCamera]) {
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
  }

  start() {
    const loop = () => {
      requestAnimationFrame(loop);
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.lastT) / 1000);
      this.lastT = now;

      if (this.onFrame) this.onFrame(dt);

      if (this.mode === 'preview') {
        this.renderer.render(this.previewScene, this.previewCamera);
      } else {
        this.renderer.render(this.gameScene, this.camera);
      }
    };
    requestAnimationFrame(loop);
  }
}
