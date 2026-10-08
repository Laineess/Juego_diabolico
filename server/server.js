// Punto de entrada: servidor HTTP + Socket.io + loop del juego.
// Sirve el cliente web (client/public) en el mismo puerto.

import './config/env.js';
import http from 'http';
import path from 'path';
import express from 'express';
import { Server } from 'socket.io';

import { initPool, ping, closePool } from './config/db.js';
import { createModels } from './models/playerModel.js';
import { Game } from './game/gameState.js';
import { ROOT_DIR } from './config/env.js';

const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.use(express.static(path.join(ROOT_DIR, 'client', 'public')));
app.use('/src', express.static(path.join(ROOT_DIR, 'client', 'src')));

app.get('/api/leaderboard', async (_req, res) => {
  try {
    const models = createModels();
    res.json(await models.getLeaderboard(50));
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: false },
  serveClient: true,
});

const models = createModels();
const game = new Game(io, models);

io.on('connection', (socket) => {
  console.log(`[net] conectado: ${socket.id}`);

  socket.on('player:join', (payload) => {
    if (game.players.has(socket.id)) return;
    try {
      const player = game.join(socket, payload || {});
      console.log(`[game] ${player.nick} (${socket.id}) entró`);
    } catch (err) {
      console.error('[game] error al entrar:', err);
      socket.emit('game:error', { message: 'No se pudo entrar a la partida' });
    }
  });

  socket.on('player:input', (payload) => {
    game.onInput(socket.id, payload);
  });

  socket.on('disconnect', () => {
    game.leave(socket.id);
    console.log(`[net] desconectado: ${socket.id}`);
  });
});

async function main() {
  initPool();
  const dbOk = await ping();
  console.log(dbOk
    ? `[db] MySQL conectado (${process.env.DB_NAME})`
    : '[db] MySQL NO disponible: se jugará sin persistencia');

  game.start();
  server.listen(PORT, () => {
    console.log(`[server] Shooter tournament en http://localhost:${PORT}`);
  });
}

async function shutdown() {
  console.log('\n[server] cerrando…');
  game.stop();
  io.close();
  await closePool();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

main().catch((err) => {
  console.error('[server] fallo fatal:', err);
  process.exit(1);
});
