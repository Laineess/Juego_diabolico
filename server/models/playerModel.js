// Consultas SQL para usuarios, rondas y puntuaciones del torneo.

import { getPool } from '../config/db.js';

function required(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function createModels() {
  return {
    async upsertPlayer(nickname, color) {
      const pool = getPool();
      required(pool, 'sin conexión MySQL');
      await pool.query(
        'INSERT INTO players (nickname, color) VALUES (?, ?) ON DUPLICATE KEY UPDATE color = VALUES(color)',
        [nickname, color],
      );
      const [rows] = await pool.query('SELECT id FROM players WHERE nickname = ?', [nickname]);
      required(rows.length, `no se encontró el jugador ${nickname}`);
      return rows[0].id;
    },

    async createMatch() {
      const pool = getPool();
      required(pool, 'sin conexión MySQL');
      const [result] = await pool.query('INSERT INTO matches () VALUES ()');
      return result.insertId;
    },

    async saveRoundResult(matchId, roundNumber, weapon, playerId, kills, deaths) {
      const pool = getPool();
      required(pool, 'sin conexión MySQL');
      await pool.query(
        `INSERT INTO round_results (match_id, round_number, weapon, player_id, kills, deaths)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [matchId, roundNumber, weapon, playerId, kills, deaths],
      );
    },

    async saveMatchResults(matchId, rows) {
      const pool = getPool();
      required(pool, 'sin conexión MySQL');
      if (!rows.length) return;
      const values = rows.map((r) => [matchId, r.playerId, r.rank, r.kills, r.deaths]);
      await pool.query(
        'INSERT INTO match_results (match_id, player_id, `rank`, kills, deaths) VALUES ?',
        [values],
      );
    },

    async finishMatch(matchId) {
      const pool = getPool();
      required(pool, 'sin conexión MySQL');
      await pool.query('UPDATE matches SET finished_at = NOW() WHERE id = ?', [matchId]);
    },

    async getLeaderboard(limit = 50) {
      const pool = getPool();
      required(pool, 'sin conexión MySQL');
      const [rows] = await pool.query('SELECT * FROM leaderboard LIMIT ?', [Number(limit) || 50]);
      return rows;
    },
  };
}
