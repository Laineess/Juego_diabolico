// RoomManager: crea y administra múltiples salas (Game), enruta a cada socket
// a su sala y publica el listado de salas disponibles.

import { Game } from './gameState.js';
import { ROOM_DEFAULTS, publicRoomInfo } from './roomConfig.js';

let seq = 0;
function makeRoomId() {
  return `room_${Date.now().toString(36)}_${(++seq).toString(36)}`;
}

export class RoomManager {
  constructor(io, models) {
    this.io = io;
    this.models = models;
    this.rooms = new Map();       // roomId -> Game
    this.socketRoom = new Map();  // socketId -> roomId
    this.defaultRoomId = null;
  }

  list() {
    return [...this.rooms.values()].map(publicRoomInfo);
  }

  broadcastList() {
    this.io.emit('rooms:list', this.list());
  }

  get(roomId) {
    return this.rooms.get(roomId) || null;
  }

  createRoom(rawConfig = {}, { isDefault = false } = {}) {
    const id = isDefault ? 'public_1' : makeRoomId();
    const game = new Game(this.io, this.models, rawConfig, id);
    this.rooms.set(id, game);
    game.start();
    if (isDefault) this.defaultRoomId = id;
    this.broadcastList();
    return game;
  }

  // sala pública para "partida rápida": reutiliza una con hueco o crea otra
  defaultRoom() {
    const d = this.defaultRoomId ? this.rooms.get(this.defaultRoomId) : null;
    if (d && d.humanCount() < d.config.maxPlayers) return d;
    for (const r of this.rooms.values()) {
      if (!r.config.isPrivate && r.humanCount() < r.config.maxPlayers) return r;
    }
    return this.createRoom(
      { ...ROOM_DEFAULTS, name: 'Sala pública' },
      { isDefault: !this.defaultRoomId },
    );
  }

  quickJoin(socket, payload) {
    return this.attach(socket, this.defaultRoom(), payload);
  }

  joinRoom(socket, roomId, payload = {}) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('La sala no existe');
    if (room.config.isPrivate && room.config.password &&
        room.config.password !== String(payload.password || '')) {
      throw new Error('Contraseña incorrecta');
    }
    return this.attach(socket, room, payload);
  }

  attach(socket, room, payload) {
    if (!room.players.has(socket.id) && room.humanCount() >= room.config.maxPlayers) {
      throw new Error('La sala está llena');
    }
    // si ya estaba en otra sala, la abandona primero
    this.detach(socket.id);
    const player = room.join(socket, payload);
    this.socketRoom.set(socket.id, room.id);
    this.broadcastList();
    return { room, player };
  }

  detach(socketId) {
    const roomId = this.socketRoom.get(socketId);
    if (!roomId) return;
    this.socketRoom.delete(socketId);
    const room = this.rooms.get(roomId);
    if (!room) return;
    room.leave(socketId);
    this.cleanupIfEmpty(room);
    this.broadcastList();
  }

  cleanupIfEmpty(room) {
    if (room.id === this.defaultRoomId) return; // la pública por defecto se conserva
    if (room.isEmpty()) {
      room.stop();
      this.rooms.delete(room.id);
    }
  }

  roomOf(socketId) {
    const id = this.socketRoom.get(socketId);
    return id ? this.rooms.get(id) : null;
  }

  // housekeeping: elimina salas vacías antiguas (no la pública por defecto)
  sweep(maxAgeMs = 60000) {
    const now = Date.now();
    let changed = false;
    for (const room of [...this.rooms.values()]) {
      if (room.id === this.defaultRoomId) continue;
      if (room.isEmpty() && now - room.createdAt > maxAgeMs) {
        room.stop();
        this.rooms.delete(room.id);
        changed = true;
      }
    }
    if (changed) this.broadcastList();
  }

  stopAll() {
    for (const room of this.rooms.values()) room.stop();
    this.rooms.clear();
    this.socketRoom.clear();
  }
}
