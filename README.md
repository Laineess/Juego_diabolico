# Shooter Web Multiplayer — Torneo 3D

Shooter multijugador en navegador (solo PC) con servidor autoritativo, partidas de
3 rondas × 3 minutos, arma aleatoria por ronda (francotirador / SMG / cuchillo),
muerte libre, personajes de cristal tipo SUPERHOT con color elegido por el jugador
y persistencia de resultados en MySQL.

- Arquitectura y stack: [`Arquitectura.md`](Arquitectura.md)
- Diseño del juego y protocolo Socket.io: [`docs/Diseno_del_Juego.md`](docs/Diseno_del_Juego.md)

## Requisitos

- Node.js ≥ 18
- MySQL 8 (local o en EC2)
- Navegador PC con WebGL2 (Chrome / Edge / Firefox)

## Puesta en marcha local

```bash
# 1. Base de datos
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS web_fps_tournament"
mysql -u root -p web_fps_tournament < database/schema.sql

# 2. Variables de entorno
cp .env.example .env   # editar DB_PASS (y el resto si hace falta)

# 3. Cliente (vendoriza Three.js en client/public/lib/)
cd client && npm install && npm run vendor && cd ..

# 4. Servidor (sirve el cliente en el mismo puerto)
cd server && npm install && npm start
```

Abrir <http://localhost:3000>.

> El servidor expone también `GET /api/leaderboard` con el top 50 histórico.

## Estructura

```text
server/     Backend: Express + Socket.io + loop de juego a 30 Hz (autoritativo)
client/     Frontend: Three.js (ES modules, sin bundler) + HUD + lobby
database/   schema.sql (tablas players / matches / round_results / match_results + vista leaderboard)
docs/       Diseno_del_Juego.md
```

## Pruebas

```bash
cd server
npm run check      # sintaxis de todos los módulos
node test-db.mjs   # verifica conexión y escritura en MySQL
```

## Despliegue en Amazon EC2

1. **Instancia:** `t3.medium` o `c6i.large`, AMI Ubuntu, con IP elástica asignada.
2. **Security Group:** abrir inbound TCP `22` (SSH), `3000` (juego HTTP/WebSocket)
   y, si se usa MySQL externo, `3306` (recomendado: dejarlo solo desde la instancia).
3. **En la instancia:**

```bash
# Node.js (NodeSource 20.x) y MySQL
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs mysql-server

# Código
git clone <repo> web-fps-tournament && cd web-fps-tournament

# Base de datos
sudo mysql -e "CREATE DATABASE IF NOT EXISTS web_fps_tournament"
sudo mysql web_fps_tournament < database/schema.sql
sudo mysql -e "CREATE USER IF NOT EXISTS 'fps'@'localhost' IDENTIFIED BY 'TU_PASS';
               GRANT ALL ON web_fps_tournament.* TO 'fps'@'localhost'"

# Entorno
cp .env.example .env
#   DB_USER=fps  DB_PASS=TU_PASS  DB_NAME=web_fps_tournament  PORT=3000

# Cliente y servidor
cd client && npm install && npm run vendor && cd ../server && npm install

# Arranque persistente
sudo npm install -g pm2 && pm2 start server.js --name web-fps && pm2 save && pm2 startup
```

4. **Verificar:** `curl http://IP_ELASTICA:3000/` debe devolver el HTML del lobby;
   abrir la URL en el navegador debe entrar en la partida.

## Configuración (`.env`)

| Variable | Descripción | Por defecto |
|---|---|---|
| `PORT` | Puerto HTTP/WebSocket | `3000` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASS` / `DB_NAME` | Conexión MySQL | `localhost/3306/root` |
| `TICK_RATE` | Hz del loop servidor | `30` |
| `ROUND_SECONDS` | Duración de ronda | `180` |
| `INTERMISSION_SECONDS` | Pausa entre rondas | `10` |
| `COUNTDOWN_SECONDS` | Cuenta atrás inicio | `5` |
| `RESPAWN_SECONDS` | Reaparición | `3` |
