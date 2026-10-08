// Configuración central de las 3 armas del torneo.
// El servidor es la única fuente de verdad: el cliente solo las representa.

export const WEAPONS = {
  sniper: {
    id: 'sniper',
    name: 'Francotirador',
    type: 'hitscan',
    damage: 100,
    fireInterval: 1.2,      // segundos entre disparos
    magSize: 5,
    reloadTime: 3.0,
    spread: 0.002,          // radianes
    range: 250,
    speedMult: 0.75,        // movimiento -25%
    zoomFov: 25,            // FOV con zoom (solo cliente)
    automatic: false,
  },
  smg: {
    id: 'smg',
    name: 'Subfusil',
    type: 'hitscan',
    damage: 26,
    fireInterval: 0.1,      // 10 balas/s
    magSize: 30,
    reloadTime: 2.2,
    spread: 0.035,
    range: 120,
    speedMult: 1.0,
    zoomFov: null,
    automatic: true,
  },
  knife: {
    id: 'knife',
    name: 'Cuchillo',
    type: 'melee',
    damage: 50,
    backDamage: 100,        // golpe por la espalda = baja instantánea
    fireInterval: 0.6,
    magSize: Infinity,
    reloadTime: 0,
    spread: 0,
    range: 2.2,
    speedMult: 1.15,        // +15% velocidad
    zoomFov: null,
    automatic: false,
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

export function shuffle(array) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
