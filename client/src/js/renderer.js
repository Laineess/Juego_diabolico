// Renderizado 3D con Three.js: escena de juego (gris claro), escena de
// preview del lobby y construcción de los personajes poligonales de cristal.

import * as THREE from 'three';
import { RoomEnvironment } from '/lib/RoomEnvironment.js';

export const COLORS = {
  background: 0xb5d4e8, // Tono celeste claro / cielo parcialmente nublado
  ground: 0x223126,   // losas de piedra oscura de templo
  wall: 0xf2f7f4,     // muros blancos de mármol
  boxes: [0x1f5c3f, 0x256e4c, 0x174a32, 0x2a7a54], // paleta verde esmeralda y jade
  whiteMarble: 0xf8faf8,
  whiteTrim: 0xe2ece5,
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

// ------------------------------------------------------------- SKIN "CUACO"
function createAwsLogoTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, 256, 128);

  // Texto "aws" en blanco minúsculas, fuente sans-serif gruesa
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 62px system-ui, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('aws', 128, 46);

  // Sonrisa / Flecha naranja curva de AWS (#ff9900)
  ctx.strokeStyle = '#ff9900';
  ctx.fillStyle = '#ff9900';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(70, 74);
  ctx.quadraticCurveTo(126, 102, 184, 74);
  ctx.stroke();

  // Flecha que apunta hacia arriba a la derecha bajo la 's'
  ctx.beginPath();
  ctx.moveTo(184, 74);
  ctx.lineTo(194, 60);
  ctx.lineTo(172, 68);
  ctx.closePath();
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createHoodieTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Base gris antracita sudadera
  ctx.fillStyle = '#2d333d';
  ctx.fillRect(0, 0, 256, 256);

  // Cuello con capucha pixelado / cuadrícula oscura
  ctx.fillStyle = '#1c2026';
  ctx.beginPath();
  ctx.arc(128, 0, 52, 0, Math.PI);
  ctx.fill();

  // Cordones grises de la sudadera
  ctx.strokeStyle = '#828a96';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  // Cordón izquierdo
  ctx.beginPath();
  ctx.moveTo(110, 42);
  ctx.lineTo(110, 108);
  ctx.stroke();
  ctx.fillStyle = '#b0b8c4';
  ctx.fillRect(107, 104, 6, 8);

  // Cordón derecho
  ctx.beginPath();
  ctx.moveTo(146, 42);
  ctx.lineTo(146, 108);
  ctx.stroke();
  ctx.fillRect(143, 104, 6, 8);

  // Bolsillo canguro frontal
  ctx.fillStyle = '#252a32';
  ctx.strokeStyle = '#1b1f25';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(56, 218);
  ctx.lineTo(56, 172);
  ctx.lineTo(84, 142);
  ctx.lineTo(172, 142);
  ctx.lineTo(200, 172);
  ctx.lineTo(200, 218);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Dobladillo inferior negro
  ctx.fillStyle = '#181b20';
  ctx.fillRect(0, 226, 256, 30);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCuacoCharacter() {
  const group = new THREE.Group();

  // Materiales físicos facetados (flatShading: true) que conservan el estilo de cristal poligonal del juego
  const matHorse = new THREE.MeshPhysicalMaterial({
    color: 0xb5784c, // Pelaje castaño cálido de caballo
    emissive: 0x3d2010,
    emissiveIntensity: 0.16,
    metalness: 0.04,
    roughness: 0.14,
    transmission: 0.65,
    thickness: 0.7,
    ior: 1.45,
    clearcoat: 1,
    clearcoatRoughness: 0.10,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const matMuzzle = new THREE.MeshPhysicalMaterial({
    color: 0xd6996e, // Hocico beige claro
    emissive: 0x482814,
    emissiveIntensity: 0.12,
    metalness: 0.04,
    roughness: 0.15,
    transmission: 0.55,
    thickness: 0.6,
    ior: 1.45,
    clearcoat: 1,
    flatShading: true,
  });

  const matCap = new THREE.MeshPhysicalMaterial({
    color: 0x22262d, // Gorra negra/antracita AWS
    emissive: 0x121519,
    emissiveIntensity: 0.10,
    metalness: 0.10,
    roughness: 0.20,
    transmission: 0.35,
    thickness: 0.7,
    ior: 1.45,
    clearcoat: 0.85,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const matHoodie = new THREE.MeshPhysicalMaterial({
    color: 0x272c35, // Sudadera gris antracita
    emissive: 0x13171d,
    emissiveIntensity: 0.12,
    metalness: 0.08,
    roughness: 0.22,
    transmission: 0.50,
    thickness: 0.7,
    ior: 1.45,
    clearcoat: 0.90,
    flatShading: true,
    side: THREE.DoubleSide,
  });

  const matDarkTrim = new THREE.MeshPhysicalMaterial({
    color: 0x16181d, // Ribetes negros (visera, cuello, puños, suelas)
    metalness: 0.15,
    roughness: 0.18,
    clearcoat: 1,
    flatShading: true,
  });

  const matPants = new THREE.MeshPhysicalMaterial({
    color: 0x20242b, // Pantalones grafito
    emissive: 0x0f1115,
    emissiveIntensity: 0.10,
    metalness: 0.06,
    roughness: 0.22,
    transmission: 0.40,
    thickness: 0.6,
    ior: 1.45,
    clearcoat: 0.80,
    flatShading: true,
  });

  const matDarkHair = new THREE.MeshPhysicalMaterial({
    color: 0x3d2212, // Melena / crin
    roughness: 0.25,
    flatShading: true,
  });

  const matWhiteCord = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
  const matNostrils = new THREE.MeshBasicMaterial({ color: 0x2a1608 });
  const matEyeBlack = new THREE.MeshBasicMaterial({ color: 0x111111 });
  const matEyeGlint = new THREE.MeshBasicMaterial({ color: 0xffffff });

  const texAws = createAwsLogoTexture();
  const matAwsLogo = new THREE.MeshBasicMaterial({
    map: texAws,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    if (rx || ry || rz) mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // 1. CABEZA DE ROMBO CLÁSICA (Octaedro low-poly de cristal castaño)
  // Idéntica geometría OctahedronGeometry(0.24, 0) y altura (y = 1.62) que el personaje clásico
  add(new THREE.OctahedronGeometry(0.24, 0), matHorse, 0, 1.62, 0);

  // GORRA AWS POLIGONAL:
  // Corona piramidal de 4 facetas alineadas con la pirámide superior del rombo
  add(new THREE.CylinderGeometry(0.04, 0.252, 0.14, 4), matCap, 0, 1.74, 0);
  // Botón superior de la gorra
  add(new THREE.OctahedronGeometry(0.024, 0), matDarkTrim, 0, 1.83, 0);
  // Visera plana poligonal hacia el frente (-Z)
  add(new THREE.BoxGeometry(0.24, 0.022, 0.13), matCap, 0, 1.66, -0.18, -0.06, 0, 0);
  // Borde oscuro de la visera
  add(new THREE.BoxGeometry(0.242, 0.008, 0.02), matDarkTrim, 0, 1.656, -0.244, -0.06, 0, 0);
  // Logo AWS centrado sobre la faceta frontal inclinada de la gorra (-Z)
  add(new THREE.PlaneGeometry(0.15, 0.075), matAwsLogo, 0, 1.71, -0.145, -0.42, Math.PI, 0);

  // HOCICO POLIGONAL DE CUACO:
  // Prisma facetado que sobresale desde el vértice frontal inferior del rombo (-Z)
  add(new THREE.BoxGeometry(0.15, 0.09, 0.11), matMuzzle, 0, 1.54, -0.18);
  // Orificios nasales poligonales oscuros
  add(new THREE.BoxGeometry(0.024, 0.024, 0.008), matNostrils, -0.038, 1.54, -0.237);
  add(new THREE.BoxGeometry(0.024, 0.024, 0.008), matNostrils, 0.038, 1.54, -0.237);

  // OJOS POLIGONALES:
  // Colocados en las facetas diagonales frontales del rombo (-Z)
  add(new THREE.BoxGeometry(0.044, 0.044, 0.008), matEyeBlack, -0.092, 1.63, -0.13, 0.15, -0.35, 0);
  add(new THREE.BoxGeometry(0.016, 0.016, 0.010), matEyeGlint, -0.082, 1.64, -0.134, 0.15, -0.35, 0);
  add(new THREE.BoxGeometry(0.044, 0.044, 0.008), matEyeBlack, 0.092, 1.63, -0.13, 0.15, 0.35, 0);
  add(new THREE.BoxGeometry(0.016, 0.016, 0.010), matEyeGlint, 0.102, 1.64, -0.134, 0.15, 0.35, 0);

  // OREJAS POLIGONALES DE CABALLO:
  // Conos de 3 caras (ultra low-poly) que asoman detrás de la gorra (+Z)
  add(new THREE.ConeGeometry(0.032, 0.09, 3), matHorse, -0.11, 1.82, 0.06, 0.18, 0, 0.28);
  add(new THREE.ConeGeometry(0.032, 0.09, 3), matHorse, 0.11, 1.82, 0.06, 0.18, 0, -0.28);

  // MELENA / CRESTA TRASERA DEL ROMBO (+Z):
  add(new THREE.BoxGeometry(0.045, 0.22, 0.05), matDarkHair, 0, 1.62, 0.16);

  // 2. TORSO POLIGONAL CLÁSICO CON SUDADERA CUACO
  // Torso superior clásico (BoxGeometry 0.55, 0.68, 0.3 en y = 1.14)
  add(new THREE.BoxGeometry(0.55, 0.68, 0.3), matHoodie, 0, 1.14, 0);
  // Cuello de sudadera / capucha en la base de la cabeza
  add(new THREE.BoxGeometry(0.38, 0.05, 0.24), matDarkTrim, 0, 1.47, 0.01);
  // Bolsillo canguro frontal de la sudadera (-Z)
  add(new THREE.BoxGeometry(0.32, 0.15, 0.024), matDarkTrim, 0, 0.98, -0.155);
  // Cordones de la sudadera (blanco/plata) (-Z)
  add(new THREE.BoxGeometry(0.012, 0.12, 0.008), matWhiteCord, -0.055, 1.28, -0.156);
  add(new THREE.BoxGeometry(0.012, 0.12, 0.008), matWhiteCord, 0.055, 1.28, -0.156);

  // Torso inferior clásico / cintura (BoxGeometry 0.46, 0.26, 0.3 en y = 0.72)
  add(new THREE.BoxGeometry(0.46, 0.26, 0.3), matDarkTrim, 0, 0.72, 0);

  // 3. BRAZOS POLIGONALES CON PIVOTE CLÁSICO (Hombros en y = 1.42, x = ±0.36)
  const createArm = (sign) => {
    const armGroup = new THREE.Group();
    armGroup.position.set(sign * 0.36, 1.42, 0);

    // Manga sudadera (longitud total 0.58 = 0.40 + 0.05 + 0.13)
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.40, 0.15), matHoodie);
    sleeve.position.y = -0.20;
    sleeve.castShadow = true;
    armGroup.add(sleeve);

    // Puño oscuro
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.05, 0.155), matDarkTrim);
    cuff.position.y = -0.425;
    cuff.castShadow = true;
    armGroup.add(cuff);

    // Mano / pezuña en cristal castaño Cuaco
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.13, 0.145), matHorse);
    hand.position.y = -0.515;
    hand.castShadow = true;
    armGroup.add(hand);

    group.add(armGroup);
    return armGroup;
  };

  const rightArm = createArm(1);
  const leftArm = createArm(-1);

  // 4. PIERNAS POLIGONALES CON PIVOTE CLÁSICO (Caderas en y = 0.70, x = ±0.14)
  const createLeg = (sign) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(sign * 0.14, 0.70, 0);

    // Pantalones (longitud total 0.70 = 0.56 + 0.14)
    const pants = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.56, 0.18), matPants);
    pants.position.y = -0.28;
    pants.castShadow = true;
    legGroup.add(pants);

    // Calzado / pezuña oscura
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.185, 0.14, 0.19), matDarkTrim);
    shoe.position.set(0, -0.63, 0.005);
    shoe.castShadow = true;
    legGroup.add(shoe);

    group.add(legGroup);
    return legGroup;
  };

  const rightLeg = createLeg(1);
  const leftLeg = createLeg(-1);

  // Anclaje de armas en la mano derecha
  const weaponHolder = new THREE.Group();
  weaponHolder.position.set(0, -0.55, 0);
  rightArm.add(weaponHolder);

  // Etiqueta de nombre y barra de vida idénticas
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256;
  labelCanvas.height = 64;
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  const labelMat = new THREE.SpriteMaterial({ map: labelTex, transparent: true, depthTest: false });
  const label = new THREE.Sprite(labelMat);
  label.scale.set(1.6, 0.4, 1);
  label.position.y = 2.18;
  label.renderOrder = 10;
  group.add(label);
  label.raycast = () => {};

  const hpBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.09),
    new THREE.MeshBasicMaterial({ color: 0x222222, depthTest: false, transparent: true, opacity: 0.7 }),
  );
  hpBg.position.y = 2.01;
  hpBg.renderOrder = 9;
  group.add(hpBg);
  hpBg.raycast = () => {};

  const hpBar = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.055),
    new THREE.MeshBasicMaterial({ color: 0x5cb85c, depthTest: false }),
  );
  hpBar.position.y = 2.01;
  hpBar.renderOrder = 10;
  group.add(hpBar);
  hpBar.raycast = () => {};

  const char = {
    skin: 'cuaco',
    group,
    material: matHoodie,
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

export function createPlayerCharacter(colorHex, skin = null) {
  const isCuaco = (skin === 'cuaco') || (typeof colorHex === 'string' && colorHex.toLowerCase() === '#232f3e');
  if (isCuaco) {
    return createCuacoCharacter();
  }
  return createGlassCharacter(colorHex);
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
  
  const addPart = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    group.add(m);
    return m;
  };

  if (weaponId === 'sniper') {
    const gunmetal = new THREE.MeshStandardMaterial({ color: 0x282c35, roughness: 0.28, metalness: 0.90 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdde4ed, roughness: 0.15, metalness: 0.96 });
    const scopeGlass = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.05, metalness: 0.15, emissive: 0x0284c7, emissiveIntensity: 0.45 });
    const emerald = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.25, metalness: 0.55, emissive: 0x064e3b, emissiveIntensity: 0.50 });

    // Receptor monolítico y riel
    addPart(new THREE.BoxGeometry(0.065, 0.088, 0.46), dark, 0, 0, -0.15);
    addPart(new THREE.BoxGeometry(0.040, 0.016, 0.40), mid, 0, 0.052, -0.15);
    // Cañón largo estriado con corona y freno de boca masivo
    addPart(new THREE.CylinderGeometry(0.015, 0.013, 0.62, 8), gunmetal, 0, 0.03, -0.62, Math.PI / 2);
    addPart(new THREE.BoxGeometry(0.044, 0.034, 0.09), dark, 0, 0.03, -0.96); // freno de boca
    addPart(new THREE.CylinderGeometry(0.028, 0.028, 0.015, 8), emerald, 0, 0.03, -0.58, Math.PI / 2); // anillo esmeralda
    // Bípode táctico plegado
    addPart(new THREE.CylinderGeometry(0.005, 0.005, 0.24, 6), gunmetal, -0.022, 0, -0.48, Math.PI / 2);
    addPart(new THREE.CylinderGeometry(0.005, 0.005, 0.24, 6), gunmetal, 0.022, 0, -0.48, Math.PI / 2);
    // Cerrojo cromado
    addPart(new THREE.CylinderGeometry(0.008, 0.008, 0.075, 6), chrome, 0.05, 0.035, -0.22, 0, 0, Math.PI / 2.35);
    // Mira telescópica con campana y torretas
    addPart(new THREE.CylinderGeometry(0.022, 0.022, 0.38, 8), gunmetal, 0, 0.09, -0.16, Math.PI / 2);
    addPart(new THREE.CylinderGeometry(0.019, 0.030, 0.08, 8), dark, 0, 0.09, -0.38, Math.PI / 2); // campana
    addPart(new THREE.CylinderGeometry(0.027, 0.027, 0.01, 8), scopeGlass, 0, 0.09, -0.41, Math.PI / 2); // lente frontal
    addPart(new THREE.BoxGeometry(0.046, 0.038, 0.046), dark, 0, 0.09, -0.18); // torretas
    // Culata esquelética modular
    addPart(new THREE.BoxGeometry(0.048, 0.092, 0.26), dark, 0, -0.02, 0.18);
    addPart(new THREE.BoxGeometry(0.052, 0.034, 0.14), mid, 0, 0.046, 0.16); // carrillera
    addPart(new THREE.BoxGeometry(0.052, 0.108, 0.025), dark, 0, -0.02, 0.31); // cantonera
    // Cargador
    addPart(new THREE.BoxGeometry(0.038, 0.13, 0.082), mid, 0, -0.10, -0.15, -0.08);
    addPart(new THREE.BoxGeometry(0.042, 0.014, 0.086), emerald, 0, -0.165, -0.15, -0.08);
  } else if (weaponId === 'smg') {
    const gunmetal = new THREE.MeshStandardMaterial({ color: 0x282c35, roughness: 0.28, metalness: 0.90 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdde4ed, roughness: 0.15, metalness: 0.96 });
    const emerald = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.25, metalness: 0.55, emissive: 0x064e3b, emissiveIntensity: 0.50 });
    const holoGlass = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.05, transparent: true, opacity: 0.85, emissive: 0x0891b2, emissiveIntensity: 0.55 });

    // Receptor principal compacto y guardamanos
    addPart(new THREE.BoxGeometry(0.068, 0.092, 0.38), dark, 0, 0, -0.18);
    addPart(new THREE.CylinderGeometry(0.012, 0.012, 0.20, 8), gunmetal, 0, 0.014, -0.48, Math.PI / 2);
    addPart(new THREE.CylinderGeometry(0.019, 0.016, 0.07, 8), dark, 0, 0.014, -0.58, Math.PI / 2); // compensador
    // Mira holográfica
    addPart(new THREE.BoxGeometry(0.044, 0.052, 0.08), dark, 0, 0.085, -0.18);
    addPart(new THREE.BoxGeometry(0.034, 0.040, 0.006), holoGlass, 0, 0.085, -0.18); // cristal óptico
    // Empuñadura angular delantera
    addPart(new THREE.BoxGeometry(0.034, 0.055, 0.08), mid, 0, -0.065, -0.34, 0.45);
    // Culata PDW con varillas de acero
    addPart(new THREE.CylinderGeometry(0.005, 0.005, 0.24, 6), chrome, -0.028, 0.015, 0.12, Math.PI / 2);
    addPart(new THREE.CylinderGeometry(0.005, 0.005, 0.24, 6), chrome, 0.028, 0.015, 0.12, Math.PI / 2);
    addPart(new THREE.BoxGeometry(0.046, 0.080, 0.024), dark, 0, 0.015, 0.24); // cantonera
    // Cargador curvo de alta capacidad
    addPart(new THREE.BoxGeometry(0.032, 0.14, 0.058), mid, 0, -0.10, -0.09, -0.18);
    addPart(new THREE.BoxGeometry(0.032, 0.09, 0.056), dark, 0, -0.19, -0.06, 0.22);
    addPart(new THREE.BoxGeometry(0.036, 0.016, 0.062), emerald, 0, -0.235, -0.05, 0.22);
  } else {
    // Cuchillo táctico de combate detallado
    const steel = new THREE.MeshStandardMaterial({ color: 0xdde4ec, roughness: 0.18, metalness: 0.94 });
    const edge = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.08, metalness: 0.98 });
    const spine = new THREE.MeshStandardMaterial({ color: 0x1f2329, roughness: 0.4, metalness: 0.75 });
    const guardMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.35, metalness: 0.82 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.88, metalness: 0.15 });
    const emerald = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.25,
      metalness: 0.6,
      emissive: 0x064e3b,
      emissiveIntensity: 0.45,
    });

    // Hoja principal y filo biselado
    addPart(new THREE.BoxGeometry(0.018, 0.046, 0.26), steel, 0, 0.02, -0.17);
    addPart(new THREE.BoxGeometry(0.009, 0.016, 0.26), edge, 0, -0.008, -0.17);
    // Lomo táctico oscuro con sierra
    addPart(new THREE.BoxGeometry(0.020, 0.016, 0.26), spine, 0, 0.045, -0.17);
    for (let i = 0; i < 4; i++) {
      addPart(new THREE.BoxGeometry(0.022, 0.010, 0.015), spine, 0, 0.052, -0.09 - i * 0.026, 0.45);
    }
    // Punta clip-point / tanto
    addPart(new THREE.BoxGeometry(0.016, 0.038, 0.10), steel, 0, 0.015, -0.33, 0.3);
    addPart(new THREE.BoxGeometry(0.008, 0.020, 0.09), edge, 0, -0.006, -0.325, -0.22);
    // Guarda táctica con rampa de pulgar
    addPart(new THREE.BoxGeometry(0.052, 0.038, 0.024), guardMat, 0, 0.018, -0.045);
    addPart(new THREE.BoxGeometry(0.038, 0.026, 0.024), guardMat, 0, 0.042, -0.048, -0.2);
    // Anillo espaciador esmeralda
    addPart(new THREE.BoxGeometry(0.036, 0.044, 0.008), emerald, 0, 0.018, -0.031);
    // Mango ergonómico
    addPart(new THREE.BoxGeometry(0.032, 0.044, 0.14), handleMat, 0, 0.018, 0.045);
    for (let f = 0; f < 3; f++) {
      addPart(new THREE.BoxGeometry(0.034, 0.009, 0.018), spine, 0, -0.006, 0.0 + f * 0.035);
    }
    // Anillo esmeralda trasero y pomo con rompecristales
    addPart(new THREE.BoxGeometry(0.035, 0.044, 0.006), emerald, 0, 0.018, 0.118);
    addPart(new THREE.BoxGeometry(0.038, 0.048, 0.022), guardMat, 0, 0.018, 0.13);
    addPart(new THREE.ConeGeometry(0.008, 0.024, 6), steel, 0, 0.018, 0.148, -Math.PI / 2);
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
    char.speed = 0;
    char.lastPos.set(p.x, p.y, p.z);
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
  // Acota la velocidad instantánea para no disparar animaciones por micro-saltos de red
  const clampedInst = Math.min(9, inst < 0.1 ? 0 : inst);
  char.speed += (clampedInst - char.speed) * Math.min(1, dt * 10);
  if (char.speed < 0.05) char.speed = 0;
  char.lastPos.set(p.x, p.y, p.z);

  char.phase += dt * (4 + char.speed * 1.6);
  const swing = char.speed > 0 ? Math.sin(char.phase) * Math.min(0.7, char.speed * 0.12) : 0;
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

function createSkyDome() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  // Gradiente suave de cielo parcialmente nublado:
  // Cenit azul sereno bajando a tonos celestes y bruma blanquecina en el horizonte
  const grad = ctx.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#387ebc'); // Azul superior
  grad.addColorStop(0.35, '#5ea1d7'); // Azul medio
  grad.addColorStop(0.65, '#92c3e6'); // Celeste suave
  grad.addColorStop(0.85, '#bcdbe9'); // Bruma horizonte
  grad.addColorStop(1.0, '#d5e7ef'); // Horizonte claro luminoso

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const geo = new THREE.SphereGeometry(340, 32, 16);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.BackSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

function createCloud(x, y, z, scale = 1, speed = 0.5) {
  const group = new THREE.Group();
  group.position.set(x, y, z);

  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xf5f9fd,
    roughness: 0.95,
    metalness: 0.0,
    flatShading: true,
  });

  // Cada cúmulo se forma con varios puffs esponjosos
  const puffCount = 6 + Math.floor(Math.random() * 5);
  for (let i = 0; i < puffCount; i++) {
    const r = (5 + Math.random() * 6) * scale;
    const puffGeo = new THREE.DodecahedronGeometry(r, 1);
    const puff = new THREE.Mesh(puffGeo, cloudMat);

    const px = (i - puffCount / 2) * (5 * scale) + (Math.random() - 0.5) * 6 * scale;
    const py = (Math.random() - 0.3) * 3 * scale;
    const pz = (Math.random() - 0.5) * 8 * scale;
    puff.position.set(px, py, pz);
    puff.scale.set(1.3, 0.75, 1.1); // Forma aplanada característica de cúmulos
    group.add(puff);
  }

  group.userData = { speed, initialX: x };
  return group;
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

    this.clouds = [];
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
    scene.background = new THREE.Color(0xb5d4e8);
    
    // Niebla atmosférica suave que se funde perfectamente con el horizonte
    scene.fog = new THREE.FogExp2(0xb8d7ea, 0.007);

    // Domo celeste con gradiente realista
    const sky = createSkyDome();
    scene.add(sky);

    // Iluminación natural: cielo azul y rebote verdoso
    const hemi = new THREE.HemisphereLight(0x82bfe8, 0x3d5c45, 0.95);
    scene.add(hemi);
    
    // Luz de relleno cálida
    const fillLight = new THREE.DirectionalLight(0xffecd6, 0.55);
    fillLight.position.set(-20, 15, -20);
    scene.add(fillLight);

    // Sol con sombras nítidas
    const sun = new THREE.DirectionalLight(0xfffaf0, 2.4);
    sun.position.set(40, 60, 25);
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

    // Generar cúmulos de nubes 3D a distintas alturas y profundidades
    this.clouds = [];
    const cloudCoords = [
      [-110, 52, -90, 1.3, 0.9],
      [-50, 58, -130, 1.6, 0.7],
      [20, 64, -100, 1.4, 0.8],
      [90, 54, -70, 1.1, 1.0],
      [-130, 60, -20, 1.5, 0.6],
      [-70, 48, 10, 1.2, 0.85],
      [0, 66, -10, 1.8, 0.75],
      [65, 50, 25, 1.3, 0.9],
      [125, 59, -15, 1.5, 0.7],
      [-95, 55, 80, 1.4, 0.8],
      [-30, 62, 110, 1.7, 0.65],
      [45, 49, 95, 1.2, 0.95],
      [110, 65, 80, 1.6, 0.7],
      [-15, 53, 50, 1.0, 1.1],
      [75, 57, -135, 1.4, 0.75],
      [-85, 68, -60, 1.5, 0.8],
    ];

    for (const [cx, cy, cz, cScale, cSpeed] of cloudCoords) {
      const cloud = createCloud(cx, cy, cz, cScale, cSpeed);
      scene.add(cloud);
      this.clouds.push(cloud);
    }

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
    const matWhiteM = new THREE.MeshStandardMaterial({ color: COLORS.whiteMarble, roughness: 0.5, metalness: 0.06 });

    boxSpecs.forEach(([x, z, w, h, d], i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS.boxes[i % COLORS.boxes.length], roughness: 0.8, metalness: 0.04,
      });
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, h / 2 - 0.2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);

      // Remate superior de mármol blanco
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.12, d + 0.08), matWhiteM);
      cap.position.set(x, h - 0.2 + 0.06, z);
      cap.castShadow = true;
      scene.add(cap);
    });

    const cylSpecs = [[-6.2, -4.2, 0.9, 2.4], [6.6, -5.2, 1.1, 1.8]];
    cylSpecs.forEach(([x, z, r, h], i) => {
      const mat = new THREE.MeshStandardMaterial({
        color: COLORS.boxes[(i + 1) % COLORS.boxes.length], roughness: 0.8, metalness: 0.04,
      });
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r, h, 24), mat);
      m.position.set(x, h / 2 - 0.2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);

      // Base y capitel de mármol blanco en el lobby
      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(r * 2.2, 0.25, r * 2.2), matWhiteM);
      baseMesh.position.set(x, 0.125 - 0.2, z);
      baseMesh.castShadow = true;
      scene.add(baseMesh);

      const capMesh = new THREE.Mesh(new THREE.BoxGeometry(r * 2.2, 0.25, r * 2.2), matWhiteM);
      capMesh.position.set(x, h - 0.2 + 0.125, z);
      capMesh.castShadow = true;
      scene.add(capMesh);
    });

    // Pedestal ornamental del personaje en el lobby (mármol blanco con inserto verde)
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.35, 0.18, 48),
      matWhiteM,
    );
    base.position.y = -0.09;
    base.receiveShadow = true;
    scene.add(base);

    const innerDisc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.95, 0.02, 48),
      new THREE.MeshStandardMaterial({ color: COLORS.boxes[0], roughness: 0.5, metalness: 0.1 }),
    );
    innerDisc.position.y = 0.005;
    innerDisc.receiveShadow = true;
    scene.add(innerDisc);
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

      // Desplazamiento lento y continuo de las nubes por el cielo
      if (this.mode === 'game' && this.clouds && this.clouds.length) {
        for (const cloud of this.clouds) {
          cloud.position.x += dt * cloud.userData.speed;
          if (cloud.position.x > 200) {
            cloud.position.x = -200;
          }
        }
      }

      if (this.mode === 'preview') {
        this.renderer.render(this.previewScene, this.previewCamera);
      } else {
        this.renderer.render(this.gameScene, this.camera);
      }
    };
    requestAnimationFrame(loop);
  }
}
