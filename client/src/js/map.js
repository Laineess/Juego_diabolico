// Construye el mapa del servidor (cubos y cilindros) en la escena Three.js.

import * as THREE from 'three';
import { COLORS } from './renderer.js';

export function buildMap(scene, mapData) {
  const { arena, boxes, cylinders } = mapData;
  const solids = []; // mallas para raycasts de trazadoras

  // suelo
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(arena.size, arena.size),
    new THREE.MeshStandardMaterial({ color: COLORS.ground, roughness: 0.95, metalness: 0 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // muros perimetrales
  const wallMat = new THREE.MeshStandardMaterial({ color: COLORS.wall, roughness: 0.9 });
  const half = arena.size / 2;
  const t = arena.wallThickness;
  const wallSpecs = [
    [0, -half - t / 2, arena.size + t * 2, t],
    [0, half + t / 2, arena.size + t * 2, t],
    [-half - t / 2, 0, t, arena.size + t * 2],
    [half + t / 2, 0, t, arena.size + t * 2],
  ];
  for (const [x, z, w, d] of wallSpecs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, arena.wallHeight, d), wallMat);
    wall.position.set(x, arena.wallHeight / 2, z);
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);
    solids.push(wall);
  }

  // cubos
  boxes.forEach((b, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.boxes[i % COLORS.boxes.length],
      roughness: 0.88,
      metalness: 0.02,
      flatShading: false,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), mat);
    mesh.position.set(b.x, b.y + b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    solids.push(mesh);
  });

  // cilindros
  cylinders.forEach((c, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.boxes[(i + 2) % COLORS.boxes.length],
      roughness: 0.85,
      metalness: 0.02,
    });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, c.h, 40), mat);
    mesh.position.set(c.x, c.y + c.h / 2, c.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    solids.push(mesh);
  });

  return { solids };
}
