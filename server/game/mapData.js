// Fuente única de verdad del mapa: solo cubos y cilindros de distintos
// tamaños sobre una arena gris claro de 60 x 60 m.
// El cliente los renderiza y el servidor usa los mismos volúmenes para
// colisiones y raycasts (sin wallbang).

export const ARENA = {
  size: 60,          // lado de la arena (x/z en [-30, 30])
  wallHeight: 6,
  wallThickness: 1,
};

export const PLAYER = {
  radius: 0.45,
  height: 1.8,
  crouchHeight: 1.2,
  eyeHeight: 1.62,
  crouchEyeHeight: 1.0,
};

// Cubos: { x, z, w (ancho X), d (profundidad Z), h (alto), y (base) }
const boxes = [
  // cobertura central
  { x: 0, z: 0, w: 6, d: 6, h: 2.2, y: 0 },
  { x: 0, z: 0, w: 2, d: 2, h: 4.5, y: 2.2 },
  // plataformas medias
  { x: -12, z: -8, w: 4, d: 4, h: 1.4, y: 0 },
  { x: 12, z: 8, w: 4, d: 4, h: 1.4, y: 0 },
  { x: -8, z: 12, w: 5, d: 3, h: 2.6, y: 0 },
  { x: 8, z: -12, w: 5, d: 3, h: 2.6, y: 0 },
  // coberturas sueltas
  { x: -20, z: 0, w: 2, d: 6, h: 3, y: 0 },
  { x: 20, z: 0, w: 2, d: 6, h: 3, y: 0 },
  { x: 0, z: -20, w: 6, d: 2, h: 3, y: 0 },
  { x: 0, z: 20, w: 6, d: 2, h: 3, y: 0 },
  { x: -16, z: -16, w: 3, d: 3, h: 1.8, y: 0 },
  { x: 16, z: 16, w: 3, d: 3, h: 1.8, y: 0 },
  { x: -16, z: 16, w: 3, d: 3, h: 4.2, y: 0 },
  { x: 16, z: -16, w: 3, d: 3, h: 4.2, y: 0 },
  { x: -24, z: -12, w: 4, d: 2, h: 1.2, y: 0 },
  { x: 24, z: 12, w: 4, d: 2, h: 1.2, y: 0 },
  { x: -24, z: 12, w: 4, d: 2, h: 2.4, y: 0 },
  { x: 24, z: -12, w: 4, d: 2, h: 2.4, y: 0 },
  { x: -6, z: -24, w: 2, d: 4, h: 2, y: 0 },
  { x: 6, z: 24, w: 2, d: 4, h: 2, y: 0 },
  { x: -6, z: 24, w: 3, d: 3, h: 3.4, y: 0 },
  { x: 6, z: -24, w: 3, d: 3, h: 3.4, y: 0 },
  { x: -26, z: 26, w: 5, d: 5, h: 1.6, y: 0 },
  { x: 26, z: -26, w: 5, d: 5, h: 1.6, y: 0 },
  { x: -26, z: -26, w: 4, d: 4, h: 3.8, y: 0 },
  { x: 26, z: 26, w: 4, d: 4, h: 3.8, y: 0 },
];

// Cilindros: { x, z, r (radio), h (alto), y (base) }
const cylinders = [
  { x: -10, z: 4, r: 1.6, h: 3.2, y: 0 },
  { x: 10, z: -4, r: 1.6, h: 3.2, y: 0 },
  { x: 4, z: 10, r: 1.1, h: 1.6, y: 0 },
  { x: -4, z: -10, r: 1.1, h: 1.6, y: 0 },
  { x: -18, z: -6, r: 2.2, h: 2.2, y: 0 },
  { x: 18, z: 6, r: 2.2, h: 2.2, y: 0 },
  { x: -2, z: 17, r: 1.4, h: 4.4, y: 0 },
  { x: 2, z: -17, r: 1.4, h: 4.4, y: 0 },
  { x: -22, z: 6, r: 1.0, h: 2.8, y: 0 },
  { x: 22, z: -6, r: 1.0, h: 2.8, y: 0 },
  { x: -13, z: 21, r: 2.6, h: 1.2, y: 0 },
  { x: 13, z: -21, r: 2.6, h: 1.2, y: 0 },
];

export const MAP = {
  arena: ARENA,
  boxes,
  cylinders,
  spawns: [
    { x: -25, z: -25 },
    { x: 25, z: 25 },
    { x: -25, z: 25 },
    { x: 25, z: -25 },
    { x: 0, z: -26 },
    { x: 0, z: 26 },
    { x: -26, z: 0 },
    { x: 26, z: 0 },
    { x: -14, z: -12 },
    { x: 14, z: 12 },
    { x: -14, z: 14 },
    { x: 14, z: -14 },
    { x: 0, z: -12 },
    { x: 0, z: 12 },
    { x: -21, z: 18 },
    { x: 21, z: -18 },
  ],
};

export function serializeMap() {
  return {
    arena: ARENA,
    boxes,
    cylinders,
    spawns: MAP.spawns,
  };
}
