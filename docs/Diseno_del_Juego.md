# Diseño del Juego — Shooter Multiplayer 3D (tipo CS:GO)

Documento técnico de diseño complementario a [`Arquitectura.md`](../Arquitectura.md). Define las reglas de juego, el protocolo de red, las armas, el mapa y la experiencia visual. Arquitectura y stack siguen íntegramente lo definido en `Arquitectura.md` (servidor autoritativo en Node.js + Socket.io, cliente Three.js, persistencia MySQL, despliegue en Amazon EC2).

---

## 1. Tipo de partida

| Concepto | Definición |
|---|---|
| Modo | **Muerte libre (free-for-all)**: todos contra todos |
| Partida | **3 rondas de 3 minutos** cada una (180 s) |
| Intermedio | 10 s entre rondas mostrando el top-3 de la ronda terminada |
| Fin de partida | Al terminar la 3ª ronda: **podio final 1°/2°/3°** |
| Ranking final | **Total de kills de la partida** (desempate: menos muertes) |
| Continuidad | Tras el podio se inicia automáticamente una nueva partida con las armas re-aleatorizadas |
| Plataforma | **Solo PC** (escritorio); dispositivos móviles/tácticos ven un aviso |
| Jugadores | Diseñado para torneo de 15+ personas |

### Ciclo de vida (máquina de estados del servidor)

```text
waiting ──(≥1 jugador)──> countdown(5s) ──> round(1) [180s]
   ▲                                              │
   │                                        intermission(10s)  ← top-3 ronda
   │                                              │
   │                                        round(2) [180s] ──> intermission(10s)
   │                                              │
   │                                        round(3) [180s]
   │                                              │
   └────────── nueva partida <── matchEnd(podio + persistencia MySQL)
```

- Un jugador que se une a mitad de partido entra directamente a la ronda en curso con el arma vigente.
- Las rondas arrancan con una cuenta regresiva de 5 s desde que hay al menos un jugador conectado.

---

## 2. Armas (una por ronda, orden aleatorio)

Al comenzar cada partida el servidor hace **shuffle de `[francotirador, SMG, cuchillo]`** y los asigna a las rondas 1, 2 y 3. Durante una ronda **solo puede usarse el arma asignada**.

| Arma | Daño | Cadencia | Cargador | Reload | Detalles |
|---|---|---|---|---|---|
| **Francotirador** | 100 (1 impacto = baja) | 1.2 s | 5 | 3.0 s | Zoom con clic derecho, movimiento -25%, spread mínimo |
| **SMG** | 26 | 10 balas/s | 30 | 2.2 s | Spread alto, se mueve a velocidad normal |
| **Cuchillo** | 50 (espalda = 100) | 0.6 s | — | — | Alcance 2.2 m, +15% velocidad de movimiento |

- **Vida**: 100 HP, sin armadura. **Respawn**: 3 s en un punto de aparición lejos de los enemigos.
- El daño, la cadencia, la munición y los impactos **se calculan siempre en el servidor** (anti-cheat): el cliente solo envía intención de disparo y dirección de la mira.

---

## 3. Mapa y estética visual

### Mapa (solo cubos y cilindros)

- Arena plana de **60 × 60 m** con muros perimetrales.
- Obstáculos: **~30 piezas** — cubos de 1–6 m de lado y cilindros de 1–4 m de radio y 1–5 m de alto, en tonos neutros grises. Funcionan como cobertura y plataformas.
- Fuente única de verdad: `server/game/mapData.js`. El servidor la envía en `game:init`; el cliente la renderiza y el servidor usa los mismos volúmenes para colisiones y raycasts (sin *wallbang*).
- Puntos de aparición (spawns) fijos, repartidos por la arena.

### Estética (estilo SUPERHUT/cristal)

- **Fondo gris claro** (`0xd9d9d9`) con niebla del mismo tono; suelo gris claro.
- **Personajes: polígonos de cristal** — humanoide low-poly facetado con `MeshPhysicalMaterial` (`transmission: 1`, `roughness ≈ 0.1`, `ior: 1.5`), teñido con **el color elegido por cada jugador** en el lobby, más bordes emisivos para resaltar las facetas.
- Solo geometría primitiva: cubos, cilindros y esferas simples en el armazón de los personajes.

### Lobby (entrada)

1. El usuario escribe su **nickname**.
2. Elige su **color de personaje** (paleta + selector HSL) con **vista previa 3D giratoria** del personaje de cristal.
3. Botón **Jugar** → `player:join`.

---

## 4. Controles (solo PC, pointer lock)

| Acción | Tecla |
|---|---|
| Moverse | W A S D |
| Mirar | Ratón (pointer lock) |
| Disparar / apuñalar | Clic izquierdo |
| Zoom (solo francotirador) | Clic derecho |
| Esprintar | Shift |
| Agacharse | Ctrl |
| Saltar | Espacio |
| Recargar | R |
| Marcador en vivo | Mantener Tab |

---

## 5. Protocolo de red (Socket.io)

Conexión persistente desde el cliente web. **Solo PC, WebSockets.**

### Cliente → Servidor

| Evento | Payload | Descripción |
|---|---|---|
| `player:join` | `{ nick, color }` | Entra a la partida en curso (o a la cola) |
| `player:input` | `{ seq, move:{fwd,strafe}, jump, crouch, sprint, yaw, pitch, shooting, reload, zoom }` | 30 Hz; intención + mira (nunca resultados) |

### Servidor → Cliente

| Evento | Payload | Descripción |
|---|---|---|
| `game:init` | `{ selfId, map, players, round, weapon, matchWeapons, endsAt, tickRate }` | Estado inicial al entrar |
| `game:update` | `{ t, players:[{id,x,y,z,yaw,pitch,vx,crouch,hp,alive,name,color,score,kills,deaths}], scores, timeLeft, round, weapon }` | 30 FPS: estado global |
| `game:shot` | `{ id, weapon, origin, dir }` | Solo VFX (trazadora/sonido) |
| `game:hit` | `{ targetId, byId, dmg, hp }` | Impacto validado por servidor |
| `game:kill` | `{ killerId, victimId, weapon }` | Baja (alimenta killfeed y marcador) |
| `player:respawn` | `{ id, pos }` | Reaparición |
| `player:joined` / `player:left` | `{ id, nick, color }` | Altas/bajas |
| `round:start` | `{ round, weapon, endsAt }` | Inicio de ronda |
| `round:end` | `{ round, top3:[{id,nick,kills,deaths}] }` | Fin de ronda + top-3 |
| `match:end` | `{ podium:[{rank,id,nick,color,kills,deaths}], saved }` | Podio final + persistencia |

### Reglas de validación del servidor

- Velocidad de movimiento acotada por arma/estado (esprint, agachado).
- Colisiones resueltas contra el mapa (AABB de cubos, círculos en XZ de cilindros, límites de arena).
- Raycast de disparo contra jugadores **y** geometría: lo que esté tapado no recibe daño.
- Cadencia, munición y recarga verificadas en servidor.

---

## 6. Persistencia (MySQL)

Definida en [`database/schema.sql`](../database/schema.sql):

- `players(id, nickname UNIQUE, color, created_at)` — perfiles del torneo.
- `matches(id, started_at, finished_at)` — cabecera de cada partida.
- `round_results(id, match_id, round_number, weapon, player_id, kills, deaths)` — stats por ronda.
- `match_results(match_id, player_id, rank, kills, deaths)` — podio final.
- Vista `leaderboard` — tabla oficial del torneo.

Al cerrar la 3ª ronda, el servidor ejecuta las consultas y responde `match:end { saved: true }`.

---

## 7. Estructura y puesta en marcha

La estructura de directorios es la definida en `Arquitectura.md` (sección 4), más `docs/`, `game/weaponConfig.js` y `game/mapData.js`.

```bash
# 1. Dependencias
cd server && npm install
cd ../client && npm install   # solo para vendorizar three.js

# 2. Base de datos local (MySQL 8)
mysql -u root -p < database/schema.sql

# 3. Variables de entorno: copiar .env.example a .env y ajustar credenciales

# 4. Arrancar
cd server && npm run dev       # http://localhost:3000
```

Variables de entorno relevantes: `PORT`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASS`, `DB_NAME`, `TICK_RATE=30`, `ROUND_SECONDS=180`, `INTERMISSION_SECONDS=10`, `COUNTDOWN_SECONDS=5`, `RESPAWN_SECONDS=3`.

Para pruebas rápidas se puede bajar `ROUND_SECONDS` (p. ej. `5`).

---

## 8. Roadmap de desarrollo

1. ✅ Documentación (`Arquitectura.md`, este documento).
2. Scaffold del proyecto, `schema.sql` y base de datos local.
3. Servidor Express + Socket.io verificado con cliente HTML de prueba.
4. `gameState.js`: loop 30 Hz, colisiones, rondas, armas, impactos, respawn.
5. Cliente Three.js: escena, mapa, personajes de cristal, controles.
6. Armas y feedback (viewmodels, trazadoras, hitmarker, killfeed).
7. Pantallas: lobby con preview de color, HUD, top-3 por ronda, podio final.
8. Persistencia del podio + leaderboard.
9. Despliegue en Amazon EC2 (README + Security Groups).
