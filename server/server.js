// Punto de entrada: servidor HTTP + Socket.io + salas de juego.
// Sirve el cliente web (client/public) en el mismo puerto.

import './config/env.js';
import http from 'http';
import path from 'path';
import express from 'express';
import { Server } from 'socket.io';

import { initPool, ping, closePool } from './config/db.js';
import { createModels } from './models/playerModel.js';
import { RoomManager } from './game/roomManager.js';
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
const rooms = new RoomManager(io, models);

// sala pública por defecto para partida rápida
rooms.createRoom({ name: 'Sala pública' }, { isDefault: true });

function clientPayload(socket, payload) {
  const { nick, color, password } = payload || {};
  return { nick, color, password, socketId: socket.id };
}

io.on('connection', (socket) => {
  console.log(`[net] conectado: ${socket.id}`);

  socket.emit('rooms:list', rooms.list());

  socket.on('rooms:list', () => {
    socket.emit('rooms:list', rooms.list());
  });

  socket.on('room:create', (payload) => {
    try {
      const { config } = payload || {};
      const room = rooms.createRoom(config || {});
      const { player } = rooms.attach(socket, room, clientPayload(socket, payload));
      console.log(`[room] ${player.nick} creó ${room.id} (${room.config.name})`);
    } catch (err) {
      console.error('[room] error al crear:', err.message);
      socket.emit('game:error', { message: err.message || 'No se pudo crear la sala' });
    }
  });

  socket.on('room:join', (payload) => {
    try {
      const { roomId } = payload || {};
      const { room, player } = rooms.joinRoom(socket, roomId, clientPayload(socket, payload));
      console.log(`[room] ${player.nick} entró a ${room.id}`);
    } catch (err) {
      console.error('[room] error al unirse:', err.message);
      socket.emit('game:error', { message: err.message || 'No se pudo entrar a la sala' });
    }
  });

  socket.on('player:join', (payload) => {
    try {
      const { room, player } = rooms.quickJoin(socket, clientPayload(socket, payload));
      console.log(`[game] ${player.nick} (${socket.id}) entró a ${room.id}`);
    } catch (err) {
      console.error('[game] error al entrar:', err.message);
      socket.emit('game:error', { message: err.message || 'No se pudo entrar a la partida' });
    }
  });

  socket.on('player:input', (payload) => {
    rooms.roomOf(socket.id)?.onInput(socket.id, payload);
  });

  socket.on('player:ready', (payload) => {
    rooms.roomOf(socket.id)?.setReady(socket.id, payload?.ready !== false);
  });

  socket.on('room:leave', () => {
    rooms.detach(socket.id);
    socket.emit('lobby:back');
  });

  socket.on('disconnect', () => {
    rooms.detach(socket.id);
    console.log(`[net] desconectado: ${socket.id}`);
  });
});

const sweeper = setInterval(() => rooms.sweep(), 30000);
sweeper.unref?.();

async function main() {
  initPool();
  const dbOk = await ping();
  console.log(dbOk
    ? `[db] MySQL conectado (${process.env.DB_NAME})`
    : '[db] MySQL NO disponible: se jugará sin persistencia');

  server.listen(PORT, () => {
    console.log(`[server] Shooter tournament en http://localhost:${PORT}`);
  });
}

async function shutdown() {
  console.log('\n[server] cerrando…');
  clearInterval(sweeper);
  rooms.stopAll();
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
