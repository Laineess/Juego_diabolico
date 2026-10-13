// Construcción del mapa: Ruinas de santuario con pilares derrumbados,
// muros colapsados y bancas de piedra en tonos verdes con detalles blancos.

import * as THREE from 'three';
import { COLORS } from './renderer.js';

export function buildMap(scene, mapData) {
  const { arena, boxes, cylinders, ramps } = mapData;
  const solids = []; // Mallas para raycasts de balas y trazadoras

  // ========================================================== MATERIALES
  const matGreenStone = new THREE.MeshStandardMaterial({
    color: 0x1e5a3e,       // Verde esmeralda profundo
    roughness: 0.78,
    metalness: 0.04,
  });

  const matGreenMoss = new THREE.MeshStandardMaterial({
    color: 0x143e2a,       // Verde musgo / sombra
    roughness: 0.88,
    metalness: 0.02,
  });

  const matGreenPolished = new THREE.MeshStandardMaterial({
    color: 0x27744f,       // Jade pulido para asientos y tapas
    roughness: 0.38,
    metalness: 0.08,
  });

  const matWhiteMarble = new THREE.MeshStandardMaterial({
    color: 0xf5f8f6,       // Mármol blanco limpio para molduras y capiteles
    roughness: 0.45,
    metalness: 0.06,
  });

  const matWhiteBroken = new THREE.MeshStandardMaterial({
    color: 0xe0eae4,       // Piedra blanca fracturada con facetado
    roughness: 0.86,
    metalness: 0.02,
    flatShading: true,
  });

  const matWallWhite = new THREE.MeshStandardMaterial({
    color: COLORS.wall,
    roughness: 0.85,
    metalness: 0.03,
  });

  // =============================================================== SUELO
  // Suelo con losas de piedra oscura y borde perimetral
  const groundGeo = new THREE.PlaneGeometry(arena.size, arena.size, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({
    color: COLORS.ground,
    roughness: 0.92,
    metalness: 0.03,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Decoración de suelo: cuadrícula de losas de mármol blanco sutiles
  const gridHelper = new THREE.GridHelper(arena.size, 30, 0x4d755c, 0x2e4235);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // =================================================== PROCEDURAL ASSETS & MATERIALS FOR BARDA
  function createCinderBlockTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Color base de mortero / juntas
    ctx.fillStyle = '#4a463e';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 16;
    const rowHeight = 512 / rows; // 32px
    const cols = 8;
    const blockWidth = 512 / cols; // 64px
    const mortar = 3;

    // Paleta de tabiques de concreto inspirada en Barda.jpeg
    const blockPalette = [
      '#a8a49a', '#9a968c', '#b5b1a6', '#928e85', '#aba79d',
      '#9f9b91', '#b0aca2', '#89857d', '#b8b4ab', '#a29e95',
    ];

    for (let r = 0; r < rows; r++) {
      const isOffset = r % 2 === 1;
      const xOffset = isOffset ? blockWidth / 2 : 0;
      const y = r * rowHeight + mortar / 2;
      const h = rowHeight - mortar;

      for (let c = -1; c < cols + 1; c++) {
        const x = c * blockWidth + xOffset + mortar / 2;
        const w = blockWidth - mortar;

        const colorIndex = Math.abs(Math.floor(Math.sin(r * 12.9898 + c * 78.233) * 43758.5453)) % blockPalette.length;
        const baseColor = blockPalette[colorIndex];

        ctx.fillStyle = baseColor;
        ctx.fillRect(x, y, w, h);

        // Granulado de concreto poroso
        ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
        for (let k = 0; k < 25; k++) {
          const gx = x + Math.random() * w;
          const gy = y + Math.random() * h;
          ctx.fillRect(gx, gy, 1 + Math.random() * 2, 1 + Math.random() * 2);
        }
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        for (let k = 0; k < 20; k++) {
          const gx = x + Math.random() * w;
          const gy = y + Math.random() * h;
          ctx.fillRect(gx, gy, 1 + Math.random() * 2, 1 + Math.random() * 2);
        }

        // Biselado 3D (resalte superior/izquierdo y sombra inferior/derecha)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.fillRect(x, y, w, 2);
        ctx.fillRect(x, y, 2, h);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        ctx.fillRect(x, y + h - 2, w, 2);
        ctx.fillRect(x + w - 2, y, 2, h);

        // Pátina de intemperie y lavado exterior como en Barda.jpeg
        if ((r + c * 3) % 4 === 0) {
          const grad = ctx.createLinearGradient(x, y, x, y + h);
          grad.addColorStop(0, 'rgba(60, 55, 45, 0.22)');
          grad.addColorStop(1, 'rgba(60, 55, 45, 0.02)');
          ctx.fillStyle = grad;
          ctx.fillRect(x, y, w, h);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function createAngledPipeGeometry(radius, height, segments = 12) {
    const geo = new THREE.CylinderGeometry(radius, radius, height, segments);
    const pos = geo.attributes.position;
    const halfH = height / 2;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > halfH - 0.05) {
        const z = pos.getZ(i);
        pos.setY(i, y + z * 0.8); // Corte en chaflán / inglete a 45° característico de Barda.jpeg
      }
    }
    geo.computeVertexNormals();
    return geo;
  }

  const texCinderBlock = createCinderBlockTexture();
  texCinderBlock.repeat.set(3, 3);

  const matCinderBlock = new THREE.MeshStandardMaterial({
    map: texCinderBlock,
    roughness: 0.88,
    metalness: 0.03,
  });

  const matGreenConcrete = new THREE.MeshStandardMaterial({
    color: 0x275438,  // Verde cantera / concreto olivo oscuro de la barda
    roughness: 0.74,
    metalness: 0.05,
  });

  const matGreenTubular = new THREE.MeshStandardMaterial({
    color: 0x245135,  // Verde esmeralda profundo satinado para barrotes tubulares
    roughness: 0.42,
    metalness: 0.28,
  });

  const matWhiteIron = new THREE.MeshStandardMaterial({
    color: 0xfcfdfd,  // Herrería artística blanca con púas de lanza
    roughness: 0.28,
    metalness: 0.35,
  });

  const matPineNeedles = new THREE.MeshStandardMaterial({
    color: 0x183e25,
    roughness: 0.85,
    metalness: 0.02,
  });

  const matTrunkWood = new THREE.MeshStandardMaterial({
    color: 0x3e2c1e,
    roughness: 0.90,
    metalness: 0.02,
  });

  // =================================================== GEOMETRÍAS COMPARTIDAS DE BARDA
  const bayW = 3.25;
  const pillarW = 0.50;
  const pillarD = 1.18;
  const wallD = 0.84;
  const frameD = 1.04;

  const geoPillar = new THREE.BoxGeometry(pillarW, 4.60, pillarD);
  const geoPillarCap = new THREE.BoxGeometry(pillarW + 0.06, 0.16, pillarD + 0.06);
  const geoPillarFinial = new THREE.ConeGeometry(0.12, 0.35, 4);
  geoPillarFinial.rotateY(Math.PI / 4);

  const geoZocalo = new THREE.BoxGeometry(bayW, 0.40, frameD);
  const geoLintel = new THREE.BoxGeometry(bayW, 0.40, frameD);

  // Panel Tipo A: Muro completo de mampostería con marco verde
  const geoWallA = new THREE.BoxGeometry(bayW, 3.80, wallD);

  // Panel Tipo B: Muro bajo + repisón blanco moldurado + rejas tubulares
  const geoWallB = new THREE.BoxGeometry(bayW, 1.50, wallD);
  const geoSill = new THREE.BoxGeometry(bayW + 0.04, 0.18, 1.10);
  const geoPipe = createAngledPipeGeometry(0.048, 2.14, 12);

  // Cresta de herrería blanca con puntas de lanza
  const geoCrestBase = new THREE.BoxGeometry(bayW, 0.04, 0.04);
  const geoCrestPicket = new THREE.CylinderGeometry(0.013, 0.013, 0.78, 8);
  const geoSpearhead = new THREE.ConeGeometry(0.032, 0.11, 4);
  geoSpearhead.rotateY(Math.PI / 4);
  const geoCrestArch = new THREE.TorusGeometry(0.065, 0.009, 6, 12, Math.PI);

  // Panel trasero / colisionador de fondo para evitar vacío
  const geoBackdrop = new THREE.BoxGeometry(bayW, 2.20, 0.10);
  const matBackdrop = new THREE.MeshStandardMaterial({
    color: 0x142b1c, // Fondo oscuro de follaje exterior
    roughness: 0.95,
  });

  // Árboles exteriores (cipreses/pinos al exterior de la barda)
  const geoTrunk = new THREE.CylinderGeometry(0.18, 0.25, 3.2, 8);
  const geoFoliage1 = new THREE.ConeGeometry(1.25, 4.2, 8);
  const geoFoliage2 = new THREE.ConeGeometry(0.95, 3.6, 8);
  const geoFoliage3 = new THREE.ConeGeometry(0.65, 3.0, 8);

  // =================================================== CONSTRUCCIÓN DE BARDAS PERIMETRALES
  const half = arena.size / 2;
  const t = arena.wallThickness;
  const NUM_BAYS = 16;
  const MODULE_W = arena.size / NUM_BAYS; // 3.75 m

  function buildBardaWallSide(wallX, wallZ, rotY) {
    const wallGroup = new THREE.Group();
    wallGroup.position.set(wallX, 0, wallZ);
    wallGroup.rotation.y = rotY;

    // Colisionador principal sólido para la pared perimetral
    const wallCollider = new THREE.Mesh(
      new THREE.BoxGeometry(arena.size + t * 2, arena.wallHeight, t),
      matWallWhite
    );
    wallCollider.position.set(0, arena.wallHeight / 2, 0);
    wallCollider.visible = false;
    wallGroup.add(wallCollider);
    solids.push(wallCollider);

    // 1. Pilastras estructurales (17 pilastras a lo largo de los 60 m)
    for (let i = 0; i <= NUM_BAYS; i++) {
      const px = -arena.size / 2 + i * MODULE_W;

      // Columna principal verde
      const pillar = new THREE.Mesh(geoPillar, matGreenConcrete);
      pillar.position.set(px, 2.30, 0);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      wallGroup.add(pillar);

      // Capitel / remate blanco de la pilastra
      const cap = new THREE.Mesh(geoPillarCap, matWhiteMarble);
      cap.position.set(px, 4.68, 0);
      cap.castShadow = true;
      wallGroup.add(cap);

      // Púa de remate superior
      const finial = new THREE.Mesh(geoPillarFinial, matWhiteIron);
      finial.position.set(px, 4.94, 0);
      finial.castShadow = true;
      wallGroup.add(finial);
    }

    // 2. Módulos / Secciones entre pilastras (16 bahías alternadas)
    for (let b = 0; b < NUM_BAYS; b++) {
      const bx = -arena.size / 2 + (b + 0.5) * MODULE_W;
      const isSolidTypeA = (b % 2 === 0);

      // Zócalo base verde
      const zocalo = new THREE.Mesh(geoZocalo, matGreenConcrete);
      zocalo.position.set(bx, 0.20, 0);
      zocalo.castShadow = true;
      zocalo.receiveShadow = true;
      wallGroup.add(zocalo);

      // Dintel superior verde
      const lintel = new THREE.Mesh(geoLintel, matGreenConcrete);
      lintel.position.set(bx, 4.40, 0);
      lintel.castShadow = true;
      lintel.receiveShadow = true;
      wallGroup.add(lintel);

      if (isSolidTypeA) {
        // --- SECCIÓN TIPO A: Muro completo de mampostería con marco verde ---
        const wallA = new THREE.Mesh(geoWallA, matCinderBlock);
        wallA.position.set(bx, 2.30, 0);
        wallA.castShadow = true;
        wallA.receiveShadow = true;
        wallGroup.add(wallA);
      } else {
        // --- SECCIÓN TIPO B: Muro medio + repisón blanco + rejas tubulares verdes ---
        // Muro de mampostería inferior
        const wallB = new THREE.Mesh(geoWallB, matCinderBlock);
        wallB.position.set(bx, 1.15, 0);
        wallB.castShadow = true;
        wallB.receiveShadow = true;
        wallGroup.add(wallB);

        // Repisón / Alfeizar moldurado de piedra blanca saliente (inspirado en Barda.jpeg)
        const sill = new THREE.Mesh(geoSill, matWhiteMarble);
        sill.position.set(bx, 1.99, 0);
        sill.castShadow = true;
        sill.receiveShadow = true;
        wallGroup.add(sill);

        // Rejas tubulares verticales de acero verde con corte en chaflán a 45°
        const NUM_PIPES = 12;
        const pipeSpacing = (bayW - 0.28) / (NUM_PIPES - 1);
        for (let p = 0; p < NUM_PIPES; p++) {
          const pipeX = bx - (bayW - 0.28) / 2 + p * pipeSpacing;
          const pipe = new THREE.Mesh(geoPipe, matGreenTubular);
          pipe.position.set(pipeX, 3.15, 0.04);
          pipe.castShadow = true;
          pipe.receiveShadow = true;
          wallGroup.add(pipe);
        }

        // Panel de profundidad exterior y contención
        const backdrop = new THREE.Mesh(geoBackdrop, matBackdrop);
        backdrop.position.set(bx, 3.20, -0.42);
        backdrop.receiveShadow = true;
        wallGroup.add(backdrop);
      }

      // --- CRESTA SUPERIOR DE HERRERÍA BLANCA CON PUNTAS DE LANZA ---
      const crestBase = new THREE.Mesh(geoCrestBase, matWhiteIron);
      crestBase.position.set(bx, 4.62, 0);
      crestBase.castShadow = true;
      wallGroup.add(crestBase);

      const NUM_SPIKES = 13;
      const spikeSpacing = (bayW - 0.24) / (NUM_SPIKES - 1);
      for (let s = 0; s < NUM_SPIKES; s++) {
        const sx = bx - (bayW - 0.24) / 2 + s * spikeSpacing;

        // Barrote vertical de la púa
        const picket = new THREE.Mesh(geoCrestPicket, matWhiteIron);
        picket.position.set(sx, 5.01, 0);
        picket.castShadow = true;
        wallGroup.add(picket);

        // Punta de lanza en forma de diamante/cono afilado
        const lance = new THREE.Mesh(geoSpearhead, matWhiteIron);
        lance.position.set(sx, 5.46, 0);
        lance.castShadow = true;
        wallGroup.add(lance);

        // Arcos góticos decorativos entre barrotes consecutivos
        if (s < NUM_SPIKES - 1) {
          const arch = new THREE.Mesh(geoCrestArch, matWhiteIron);
          arch.position.set(sx + spikeSpacing / 2, 5.08, 0);
          arch.castShadow = true;
          wallGroup.add(arch);
        }
      }
    }

    // 3. Arbolado y paisajismo exterior más allá de la barda (visible por las rejas)
    const treeOffsets = [-24, -15, -6, 6, 15, 24];
    for (let tIdx = 0; tIdx < treeOffsets.length; tIdx++) {
      const tx = treeOffsets[tIdx] + (tIdx % 2 === 0 ? 1.2 : -1.2);
      const tz = -3.8 - (tIdx % 3) * 1.5;

      const treeGroup = new THREE.Group();
      treeGroup.position.set(tx, 0, tz);

      // Tronco
      const trunk = new THREE.Mesh(geoTrunk, matTrunkWood);
      trunk.position.y = 1.6;
      trunk.castShadow = true;
      treeGroup.add(trunk);

      // Follaje piramidal / ciprés
      const f1 = new THREE.Mesh(geoFoliage1, matPineNeedles);
      f1.position.y = 4.8;
      f1.castShadow = true;
      treeGroup.add(f1);

      const f2 = new THREE.Mesh(geoFoliage2, matPineNeedles);
      f2.position.y = 7.4;
      f2.castShadow = true;
      treeGroup.add(f2);

      const f3 = new THREE.Mesh(geoFoliage3, matPineNeedles);
      f3.position.y = 9.8;
      f3.castShadow = true;
      treeGroup.add(f3);

      wallGroup.add(treeGroup);
    }

    wallGroup.updateMatrixWorld(true);
    scene.add(wallGroup);
  }

  // Construir las 4 bardas perimetrales
  buildBardaWallSide(0, -half - t / 2, 0);               // Norte (mira a +Z hacia el centro)
  buildBardaWallSide(0, half + t / 2, Math.PI);          // Sur (mira a -Z hacia el centro)
  buildBardaWallSide(-half - t / 2, 0, -Math.PI / 2);    // Oeste (mira a +X hacia el centro)
  buildBardaWallSide(half + t / 2, 0, Math.PI / 2);     // Este (mira a -X hacia el centro)

  // 4. Pilastrones monumentales de esquina (unión perfecta de los muros)
  const cornerCoords = [
    [-half - t / 2, -half - t / 2],
    [half + t / 2, -half - t / 2],
    [-half - t / 2, half + t / 2],
    [half + t / 2, half + t / 2],
  ];

  const geoCornerTower = new THREE.BoxGeometry(1.4, 5.0, 1.4);
  const geoCornerCornice = new THREE.BoxGeometry(1.55, 0.25, 1.55);
  const geoCornerFinial = new THREE.ConeGeometry(0.24, 0.65, 4);
  geoCornerFinial.rotateY(Math.PI / 4);

  for (const [cx, cz] of cornerCoords) {
    const cornerGroup = new THREE.Group();
    cornerGroup.position.set(cx, 0, cz);

    const tower = new THREE.Mesh(geoCornerTower, matGreenConcrete);
    tower.position.y = 2.5;
    tower.castShadow = true;
    tower.receiveShadow = true;
    cornerGroup.add(tower);
    solids.push(tower);

    const cornice1 = new THREE.Mesh(geoCornerCornice, matWhiteMarble);
    cornice1.position.y = 5.0;
    cornice1.castShadow = true;
    cornerGroup.add(cornice1);

    const cornerFinial = new THREE.Mesh(geoCornerFinial, matWhiteIron);
    cornerFinial.position.y = 5.45;
    cornerFinial.castShadow = true;
    cornerGroup.add(cornerFinial);

    cornerGroup.updateMatrixWorld(true);
    scene.add(cornerGroup);
  }

  // ============================================================== PILARES
  // Cada cilindro se transforma en un majestuoso pilar clásico derrumbado
  cylinders.forEach((c, i) => {
    const pillarGroup = new THREE.Group();
    pillarGroup.position.set(c.x, c.y, c.z);

    // 1. Base cuadrada de mármol blanco (pedestal)
    const baseW = c.r * 2.2;
    const baseH = Math.min(0.5, c.h * 0.18);
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(baseW, baseH, baseW),
      matWhiteMarble
    );
    plinth.position.y = baseH / 2;
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    pillarGroup.add(plinth);
    solids.push(plinth);

    // 2. Anillo de moldura blanco sobre la base
    const ringH = 0.18;
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(c.r * 1.15, c.r * 1.25, ringH, 24),
      matWhiteMarble
    );
    ring.position.y = baseH + ringH / 2;
    ring.castShadow = true;
    pillarGroup.add(ring);

    // Variación según el índice para realismo orgánico:
    const variant = i % 3;

    if (variant === 0) {
      // --- Variante A: Pilar fuertemente derrumbado con capitel caído ---
      const breakRatio = 0.55 + ((i * 7) % 20) / 100; // 55% a 75% de altura
      const brokenH = c.h * breakRatio - (baseH + ringH);

      // Fuste estriado verde esmeralda
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(c.r * 0.96, c.r * 1.0, brokenH, 20),
        matGreenStone
      );
      shaft.position.y = baseH + ringH + brokenH / 2;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      pillarGroup.add(shaft);
      solids.push(shaft);

      // Bloque de fractura irregular / quebrado en la cima
      const fracture = new THREE.Mesh(
        new THREE.DodecahedronGeometry(c.r * 0.95, 0),
        matWhiteBroken
      );
      fracture.position.y = baseH + ringH + brokenH;
      fracture.rotation.set((i * 1.3) % 2, 0, (i * 0.9) % 2);
      fracture.scale.set(1.0, 0.45, 1.0);
      fracture.castShadow = true;
      pillarGroup.add(fracture);

      // Trozo de columna caído en el suelo junto al pilar
      const fallenDrumH = c.r * 1.2;
      const fallen = new THREE.Mesh(
        new THREE.CylinderGeometry(c.r * 0.92, c.r * 0.92, fallenDrumH, 16),
        matGreenMoss
      );
      const angle = (i * 2.1) % (Math.PI * 2);
      const dist = c.r * 1.8;
      fallen.position.set(Math.cos(angle) * dist, c.r * 0.92, Math.sin(angle) * dist);
      fallen.rotation.z = Math.PI / 2;
      fallen.rotation.y = angle;
      fallen.castShadow = true;
      fallen.receiveShadow = true;
      pillarGroup.add(fallen);

      // Escombros pequeños de mármol blanco en el suelo
      for (let k = 0; k < 3; k++) {
        const rubble = new THREE.Mesh(
          new THREE.BoxGeometry(0.3 + k * 0.1, 0.25, 0.35),
          matWhiteBroken
        );
        const ra = angle + 0.6 + k * 0.5;
        rubble.position.set(Math.cos(ra) * (dist + 0.5), 0.12, Math.sin(ra) * (dist + 0.5));
        rubble.rotation.set(k * 0.4, k * 0.8, 0);
        rubble.castShadow = true;
        pillarGroup.add(rubble);
      }

    } else if (variant === 1) {
      // --- Variante B: Pilar semi-intacto con capitel inclinado/quebrado ---
      const shaftH = c.h - (baseH + ringH) - 0.5;

      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(c.r * 0.94, c.r * 1.0, shaftH, 24),
        matGreenStone
      );
      shaft.position.y = baseH + ringH + shaftH / 2;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      pillarGroup.add(shaft);
      solids.push(shaft);

      // Anillo intermedio decorativo de mármol blanco
      const midRing = new THREE.Mesh(
        new THREE.CylinderGeometry(c.r * 1.04, c.r * 1.04, 0.15, 24),
        matWhiteMarble
      );
      midRing.position.y = baseH + ringH + shaftH * 0.55;
      midRing.castShadow = true;
      pillarGroup.add(midRing);

      // Capitel clásico superior de mármol blanco, ligeramente inclinado
      const capGroup = new THREE.Group();
      capGroup.position.y = c.h - 0.25;
      capGroup.rotation.z = 0.08 * (i % 2 === 0 ? 1 : -1);

      const capital1 = new THREE.Mesh(
        new THREE.CylinderGeometry(c.r * 1.3, c.r * 0.98, 0.28, 24),
        matWhiteMarble
      );
      capital1.castShadow = true;
      capGroup.add(capital1);

      const capitalTop = new THREE.Mesh(
        new THREE.BoxGeometry(c.r * 2.3, 0.22, c.r * 2.3),
        matWhiteMarble
      );
      capitalTop.position.y = 0.2;
      capitalTop.castShadow = true;
      capGroup.add(capitalTop);

      pillarGroup.add(capGroup);

    } else {
      // --- Variante C: Pilar alto con franja espiral de mármol y remate quebrado ---
      const shaftH = c.h - (baseH + ringH);
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(c.r * 0.96, c.r * 1.02, shaftH, 20),
        matGreenMoss
      );
      shaft.position.y = baseH + ringH + shaftH / 2;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      pillarGroup.add(shaft);
      solids.push(shaft);

      // Capitel en la cima
      const capital = new THREE.Mesh(
        new THREE.BoxGeometry(c.r * 2.1, 0.35, c.r * 2.1),
        matWhiteMarble
      );
      capital.position.y = c.h - 0.175;
      capital.castShadow = true;
      pillarGroup.add(capital);

      // Detalle de losas fracturadas sobre el capitel
      const brokenTop = new THREE.Mesh(
        new THREE.BoxGeometry(c.r * 1.4, 0.25, c.r * 1.2),
        matWhiteBroken
      );
      brokenTop.position.set(c.r * 0.2, c.h + 0.12, 0);
      brokenTop.rotation.y = 0.4;
      brokenTop.castShadow = true;
      pillarGroup.add(brokenTop);
    }

    scene.add(pillarGroup);
  });

  // =============================================== RECUADROS, MUROS Y BANCAS
  boxes.forEach((b, i) => {
    // Identificar el monumento central
    if (Math.abs(b.x) < 0.1 && Math.abs(b.z) < 0.1) {
      if (b.y === 0) {
        // Plataforma / Terraza ceremonial central (6x6 h=2.2)
        buildCentralTerrace(scene, b, matGreenStone, matWhiteMarble, solids);
      } else {
        // Altar superior en ruinas (2x2 h=4.5)
        buildCentralAltar(scene, b, matGreenStone, matWhiteMarble, matWhiteBroken, solids);
      }
      return;
    }

    // Clasificar según dimensiones:
    // Altura baja (h <= 1.4m): Bancas ceremoniales de piedra
    if (b.h <= 1.4) {
      buildStoneBench(scene, b, i, matGreenPolished, matGreenStone, matWhiteMarble, solids);
    } else {
      // Muros derruidos con almenas rotas y zócalos de mármol
      buildRuinedWall(scene, b, i, matGreenStone, matGreenMoss, matWhiteMarble, matWhiteBroken, solids);
    }
  });

  // ================================================================= RAMPAS
  if (ramps) {
    ramps.forEach((r, i) => {
      buildCeremonialRamp(scene, r, i, matGreenStone, matWhiteMarble, solids);
    });
  }

  return { solids };
}

// ------------------------------------------------------------- BANCAS DE PIEDRA
function buildStoneBench(scene, b, i, matSeat, matGreen, matMarble, solids) {
  const group = new THREE.Group();
  group.position.set(b.x, b.y, b.z);

  // Determinar orientación (el lado más largo es el largo del asiento)
  const isXAligned = b.w >= b.d;
  const length = isXAligned ? b.w : b.d;
  const depth = isXAligned ? b.d : b.w;

  // 1. Soportes/patas de mármol blanco tallado en los extremos
  const legW = isXAligned ? 0.38 : depth * 0.85;
  const legD = isXAligned ? depth * 0.85 : 0.38;
  const legH = b.h * 0.55;

  const legOffset = (length / 2) * 0.76;

  const legLeft = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legD), matMarble);
  const legRight = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legD), matMarble);

  if (isXAligned) {
    legLeft.position.set(-legOffset, legH / 2, 0);
    legRight.position.set(legOffset, legH / 2, 0);
  } else {
    legLeft.position.set(0, legH / 2, -legOffset);
    legRight.position.set(0, legH / 2, legOffset);
  }
  legLeft.castShadow = true;
  legLeft.receiveShadow = true;
  legRight.castShadow = true;
  legRight.receiveShadow = true;
  group.add(legLeft);
  group.add(legRight);
  solids.push(legLeft, legRight);

  // Soporte central si la banca es muy larga
  if (length > 3.2) {
    const legCenter = new THREE.Mesh(new THREE.BoxGeometry(legW * 0.9, legH, legD * 0.9), matMarble);
    legCenter.position.set(0, legH / 2, 0);
    legCenter.castShadow = true;
    group.add(legCenter);
    solids.push(legCenter);
  }

  // 2. Losa del asiento: jade verde pulido con borde de mármol blanco
  const seatH = 0.22;
  const seatY = legH + seatH / 2;

  const seatMesh = new THREE.Mesh(
    new THREE.BoxGeometry(b.w, seatH, b.d),
    matSeat
  );
  seatMesh.position.y = seatY;
  seatMesh.castShadow = true;
  seatMesh.receiveShadow = true;
  group.add(seatMesh);
  solids.push(seatMesh);

  // Borde ribeteado de mármol blanco alrededor del asiento
  const trimMesh = new THREE.Mesh(
    new THREE.BoxGeometry(b.w + 0.08, 0.06, b.d + 0.08),
    matMarble
  );
  trimMesh.position.y = legH + 0.03;
  trimMesh.castShadow = true;
  group.add(trimMesh);

  // 3. Respaldo o murete bajo de apoyo posterior (verde con coronación blanca)
  const backrestH = b.h - (legH + seatH);
  if (backrestH > 0.25) {
    const backThickness = depth * 0.26;
    const backW = isXAligned ? length * 0.95 : backThickness;
    const backD = isXAligned ? backThickness : length * 0.95;
    const backY = seatY + seatH / 2 + backrestH / 2;
    const backZOffset = isXAligned ? (depth / 2 - backThickness / 2) : 0;
    const backXOffset = isXAligned ? 0 : (depth / 2 - backThickness / 2);

    const backrest = new THREE.Mesh(
      new THREE.BoxGeometry(backW, backrestH, backD),
      matGreen
    );
    backrest.position.set(backXOffset, backY, backZOffset);
    backrest.castShadow = true;
    backrest.receiveShadow = true;
    group.add(backrest);
    solids.push(backrest);

    // Remate superior blanco del respaldo
    const backCap = new THREE.Mesh(
      new THREE.BoxGeometry(isXAligned ? backW + 0.08 : backThickness + 0.06, 0.1, isXAligned ? backThickness + 0.06 : backD + 0.08),
      matMarble
    );
    backCap.position.set(backXOffset, backY + backrestH / 2 + 0.05, backZOffset);
    backCap.castShadow = true;
    group.add(backCap);
  }

  // Fragmento de piedra caído al costado de la banca
  const fallenFrag = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 0.28, 0.35),
    matMarble
  );
  fallenFrag.position.set((isXAligned ? length / 2 + 0.35 : 0), 0.14, (isXAligned ? 0 : length / 2 + 0.35));
  fallenFrag.rotation.y = (i * 1.5);
  fallenFrag.castShadow = true;
  group.add(fallenFrag);

  scene.add(group);
}

// ----------------------------------------------------------- MUROS DERRUMBADOS
function buildRuinedWall(scene, b, i, matGreen, matMoss, matMarble, matBroken, solids) {
  const group = new THREE.Group();
  group.position.set(b.x, b.y, b.z);

  const isXAligned = b.w >= b.d;
  const length = isXAligned ? b.w : b.d;
  const thickness = isXAligned ? b.d : b.w;

  // 1. Zócalo inferior continuo de mármol blanco
  const basePlinthH = 0.36;
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(isXAligned ? length + 0.1 : thickness + 0.1, basePlinthH, isXAligned ? thickness + 0.1 : length + 0.1),
    matMarble
  );
  plinth.position.y = basePlinthH / 2;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);
  solids.push(plinth);

  // 2. Franja decorativa de moldura blanca intermedia
  const friezeH = 0.18;
  const friezeY = Math.min(b.h * 0.5, b.h - 0.6);

  // 3. Muro segmentado en 3 partes quebradas para simular el derrumbe
  // Segmento 1: Alto / casi intacto (50% de la longitud)
  const seg1Len = length * 0.48;
  const seg1H = b.h;
  const seg1Mesh = new THREE.Mesh(
    new THREE.BoxGeometry(isXAligned ? seg1Len : thickness, seg1H - basePlinthH, isXAligned ? thickness : seg1Len),
    matGreen
  );
  const seg1Pos = -length / 2 + seg1Len / 2;
  seg1Mesh.position.set(isXAligned ? seg1Pos : 0, basePlinthH + (seg1H - basePlinthH) / 2, isXAligned ? 0 : seg1Pos);
  seg1Mesh.castShadow = true;
  seg1Mesh.receiveShadow = true;
  group.add(seg1Mesh);
  solids.push(seg1Mesh);

  // Coronación de mármol blanco sobre el segmento alto
  const cap1 = new THREE.Mesh(
    new THREE.BoxGeometry(isXAligned ? seg1Len + 0.08 : thickness + 0.08, 0.16, isXAligned ? thickness + 0.08 : seg1Len + 0.08),
    matMarble
  );
  cap1.position.set(isXAligned ? seg1Pos : 0, seg1H + 0.08, isXAligned ? 0 : seg1Pos);
  cap1.castShadow = true;
  group.add(cap1);

  // Segmento 2: Medianamente derrumbado (32% de la longitud, 75% de altura)
  const seg2Len = length * 0.32;
  const seg2H = b.h * 0.78;
  const seg2Mesh = new THREE.Mesh(
    new THREE.BoxGeometry(isXAligned ? seg2Len : thickness, seg2H - basePlinthH, isXAligned ? thickness : seg2Len),
    matMoss
  );
  const seg2Pos = -length / 2 + seg1Len + seg2Len / 2;
  seg2Mesh.position.set(isXAligned ? seg2Pos : 0, basePlinthH + (seg2H - basePlinthH) / 2, isXAligned ? 0 : seg2Pos);
  seg2Mesh.castShadow = true;
  seg2Mesh.receiveShadow = true;
  group.add(seg2Mesh);
  solids.push(seg2Mesh);

  // Remate fracturado blanco sobre el segmento medio
  const cap2 = new THREE.Mesh(
    new THREE.BoxGeometry(isXAligned ? seg2Len * 0.85 : thickness * 0.9, 0.18, isXAligned ? thickness * 0.9 : seg2Len * 0.85),
    matBroken
  );
  cap2.position.set(isXAligned ? seg2Pos : 0, seg2H + 0.09, isXAligned ? 0 : seg2Pos);
  cap2.castShadow = true;
  group.add(cap2);

  // Segmento 3: Brecha profunda / colapso fuerte (20% restante, 50% de altura)
  const seg3Len = length - (seg1Len + seg2Len);
  const seg3H = b.h * 0.52;
  const seg3Mesh = new THREE.Mesh(
    new THREE.BoxGeometry(isXAligned ? seg3Len : thickness, seg3H - basePlinthH, isXAligned ? thickness : seg3Len),
    matGreen
  );
  const seg3Pos = length / 2 - seg3Len / 2;
  seg3Mesh.position.set(isXAligned ? seg3Pos : 0, basePlinthH + (seg3H - basePlinthH) / 2, isXAligned ? 0 : seg3Pos);
  seg3Mesh.castShadow = true;
  seg3Mesh.receiveShadow = true;
  group.add(seg3Mesh);
  solids.push(seg3Mesh);

  // Moldura decorativa blanca horizontal a lo largo del muro
  const friezeMesh = new THREE.Mesh(
    new THREE.BoxGeometry(isXAligned ? length * 0.88 : thickness + 0.08, friezeH, isXAligned ? thickness + 0.08 : length * 0.88),
    matMarble
  );
  friezeMesh.position.set(0, friezeY, 0);
  friezeMesh.castShadow = true;
  group.add(friezeMesh);

  // Escombros en la base de la brecha colapsada
  const rubbleCount = 2 + (i % 3);
  for (let r = 0; r < rubbleCount; r++) {
    const rMat = r % 2 === 0 ? matBroken : matGreen;
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(0.35 + r * 0.1, 0.28, 0.4),
      rMat
    );
    const side = (r % 2 === 0 ? 1 : -1) * (thickness * 0.55 + 0.25);
    const posLong = seg3Pos + (r * 0.3 - 0.3);
    block.position.set(isXAligned ? posLong : side, 0.14, isXAligned ? side : posLong);
    block.rotation.set(r * 0.3, r * 0.7, r * 0.2);
    block.castShadow = true;
    group.add(block);
  }

  scene.add(group);
}

// ---------------------------------------------------- MONUMENTO CENTRAL (0, 0)
function buildCentralTerrace(scene, b, matGreen, matMarble, solids) {
  const group = new THREE.Group();
  group.position.set(b.x, b.y, b.z);

  // Terraza ceremonial escalonada (6x6 h=2.2)
  // Nivel 1: Base ancha
  const step1H = b.h * 0.55;
  const step1 = new THREE.Mesh(
    new THREE.BoxGeometry(b.w, step1H, b.d),
    matGreen
  );
  step1.position.y = step1H / 2;
  step1.castShadow = true;
  step1.receiveShadow = true;
  group.add(step1);
  solids.push(step1);

  // Ribete de mármol blanco alrededor del primer nivel
  const border1 = new THREE.Mesh(
    new THREE.BoxGeometry(b.w + 0.15, 0.25, b.d + 0.15),
    matMarble
  );
  border1.position.y = step1H - 0.125;
  border1.castShadow = true;
  group.add(border1);

  // Nivel 2: Plataforma superior con zócalo
  const step2H = b.h * 0.45;
  const step2W = b.w * 0.88;
  const step2D = b.d * 0.88;
  const step2 = new THREE.Mesh(
    new THREE.BoxGeometry(step2W, step2H, step2D),
    matGreen
  );
  step2.position.y = step1H + step2H / 2;
  step2.castShadow = true;
  step2.receiveShadow = true;
  group.add(step2);
  solids.push(step2);

  // Coronación de mármol blanco
  const border2 = new THREE.Mesh(
    new THREE.BoxGeometry(step2W + 0.12, 0.18, step2D + 0.12),
    matMarble
  );
  border2.position.y = b.h - 0.09;
  border2.castShadow = true;
  group.add(border2);

  // Cuatro pilares pequeños en las esquinas de la plataforma
  const cornerDist = (b.w / 2) * 0.78;
  for (const cx of [-cornerDist, cornerDist]) {
    for (const cz of [-cornerDist, cornerDist]) {
      const cornerPost = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 0.85, 0.6),
        matMarble
      );
      cornerPost.position.set(cx, b.h + 0.425, cz);
      cornerPost.castShadow = true;
      group.add(cornerPost);
    }
  }

  scene.add(group);
}

function buildCentralAltar(scene, b, matGreen, matMarble, matBroken, solids) {
  const group = new THREE.Group();
  group.position.set(b.x, b.y, b.z);

  // Altar superior en ruinas (2x2 h=4.5 sobre la terraza)
  // Base de mármol blanco
  const baseH = 0.5;
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(b.w * 1.1, baseH, b.d * 1.1),
    matMarble
  );
  base.position.y = baseH / 2;
  base.castShadow = true;
  group.add(base);
  solids.push(base);

  // Monolito central de jade / verde esmeralda
  const bodyH = b.h - baseH - 0.6;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(b.w * 0.9, bodyH, b.d * 0.9),
    matGreen
  );
  body.position.y = baseH + bodyH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  solids.push(body);

  // 4 Columnas adosadas de mármol blanco en las 4 esquinas del monolito
  const colR = 0.22;
  const colDist = b.w * 0.42;
  for (const cx of [-colDist, colDist]) {
    for (const cz of [-colDist, colDist]) {
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(colR, colR, bodyH, 16),
        matMarble
      );
      col.position.set(cx, baseH + bodyH / 2, cz);
      col.castShadow = true;
      group.add(col);
    }
  }

  // Capitel masivo superior en ruinas de mármol blanco
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(b.w * 1.25, 0.45, b.d * 1.25),
    matMarble
  );
  cap.position.y = b.h - 0.35;
  cap.castShadow = true;
  group.add(cap);
  solids.push(cap);

  // Remate superior fracturado
  const fracture = new THREE.Mesh(
    new THREE.BoxGeometry(b.w * 0.75, 0.35, b.d * 0.75),
    matBroken
  );
  fracture.position.set(0.15, b.h - 0.05, 0);
  fracture.rotation.set(0.12, 0.3, 0);
  fracture.castShadow = true;
  group.add(fracture);

  scene.add(group);
}

// --------------------------------------------------------------------- RAMPAS
function buildCeremonialRamp(scene, r, i, matGreen, matMarble, solids) {
  const group = new THREE.Group();
  group.position.set(r.x, r.y, r.z);

  // 1. Superficie de rampa de piedra verde
  const geom = new THREE.BoxGeometry(r.w, r.h, r.d);
  const pos = geom.attributes.position;
  for (let j = 0; j < pos.count; j++) {
    let px = pos.getX(j);
    let py = pos.getY(j);
    let pz = pos.getZ(j);
    if (py > 0) {
      if (r.dir === 'x' && px < 0) py = -r.h / 2;
      if (r.dir === '-x' && px > 0) py = -r.h / 2;
      if (r.dir === 'z' && pz < 0) py = -r.h / 2;
      if (r.dir === '-z' && pz > 0) py = -r.h / 2;
      pos.setY(j, py);
    }
  }
  geom.computeVertexNormals();

  const rampMesh = new THREE.Mesh(geom, matGreen);
  rampMesh.position.y = r.h / 2;
  rampMesh.castShadow = true;
  rampMesh.receiveShadow = true;
  group.add(rampMesh);
  solids.push(rampMesh);

  // 2. Barandillas / parapetos laterales de mármol blanco
  const isX = r.dir === 'x' || r.dir === '-x';
  const railThick = 0.28;
  const railH = 0.35;

  const sideOffset = (isX ? r.d : r.w) / 2 - railThick / 2;
  for (const s of [-sideOffset, sideOffset]) {
    const railGeom = new THREE.BoxGeometry(isX ? r.w : railThick, r.h, isX ? railThick : r.d);
    const rPos = railGeom.attributes.position;
    for (let j = 0; j < rPos.count; j++) {
      let px = rPos.getX(j);
      let py = rPos.getY(j);
      let pz = rPos.getZ(j);
      if (py > 0) {
        if (r.dir === 'x' && px < 0) py = -r.h / 2;
        if (r.dir === '-x' && px > 0) py = -r.h / 2;
        if (r.dir === 'z' && pz < 0) py = -r.h / 2;
        if (r.dir === '-z' && pz > 0) py = -r.h / 2;
        pos.setY(j, py);
      }
    }
    railGeom.computeVertexNormals();

    const railMesh = new THREE.Mesh(railGeom, matMarble);
    railMesh.position.set(isX ? 0 : s, r.h / 2 + railH / 2, isX ? s : 0);
    railMesh.castShadow = true;
    group.add(railMesh);
  }

  // Pilares al pie y a la cima de la rampa
  const postSize = 0.45;
  const postH = r.h + 0.4;
  for (const s of [-sideOffset, sideOffset]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(postSize, postH, postSize),
      matMarble
    );
    const endX = isX ? (r.dir === 'x' ? r.w / 2 : -r.w / 2) : s;
    const endZ = isX ? s : (r.dir === 'z' ? r.d / 2 : -r.d / 2);
    post.position.set(endX, postH / 2, endZ);
    post.castShadow = true;
    group.add(post);
  }

  scene.add(group);
}
