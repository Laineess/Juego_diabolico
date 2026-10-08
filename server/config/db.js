// Conexión MySQL (pool) desde variables de entorno.
// Si MySQL no está disponible el servidor sigue funcionando en memoria.

import mysql from 'mysql2/promise';

let pool = null;

export function initPool() {
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'web_fps_tournament',
      waitForConnections: true,
      connectionLimit: 10,
      namedPlaceholders: false,
    });
    return pool;
  } catch (err) {
    console.warn('[db] no se pudo crear el pool:', err.message);
    pool = null;
    return null;
  }
}

export function getPool() {
  return pool;
}

export async function ping() {
  if (!pool) return false;
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    console.warn('[db] ping falló:', err.message);
    pool = null;
    return false;
  }
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
