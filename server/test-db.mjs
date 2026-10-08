// Verificación de persistencia: ciclo completo de una partida en MySQL.
import './config/env.js';
import { initPool, ping, closePool, getPool } from './config/db.js';
import { createModels } from './models/playerModel.js';

initPool();
const ok = await ping();
if (!ok) { console.error('FAIL: sin conexión MySQL'); process.exit(1); }

// limpia solo los jugadores de prueba de ejecuciones anteriores (cascada)
await getPool().query("DELETE FROM players WHERE nickname IN ('Alpha', 'Beta')");
await getPool().query('DELETE FROM matches WHERE id NOT IN (SELECT DISTINCT match_id FROM match_results)');

const m = createModels();
try {
  const p1 = await m.upsertPlayer('Alpha', '#ff0000');
  const p2 = await m.upsertPlayer('Beta', '#00ff00');
  const p1b = await m.upsertPlayer('Alpha', '#ff4444'); // upsert debe devolver el mismo id
  console.log('OK upsertPlayer →', { p1, p2, p1b, mismoId: p1 === p1b });

  const match = await m.createMatch();
  console.log('OK createMatch → id', match);

  await m.saveRoundResult(match, 1, 'knife', p1, 5, 2);
  await m.saveRoundResult(match, 2, 'sniper', p1, 3, 1);
  await m.saveRoundResult(match, 3, 'smg', p2, 7, 4);
  console.log('OK saveRoundResult → 3 filas');

  await m.saveMatchResults(match, [
    { playerId: p2, rank: 1, kills: 7, deaths: 4 },
    { playerId: p1, rank: 2, kills: 8, deaths: 3 },
  ]);
  await m.finishMatch(match);
  console.log('OK saveMatchResults + finishMatch');

  const lb = await m.getLeaderboard();
  console.log('OK leaderboard →', JSON.stringify(lb, null, 1));

  const aparentado = lb.find((r) => r.nickname === 'Alpha');
  if (!aparentado || Number(aparentado.total_kills) !== 8) throw new Error('leaderboard mal calculado');
  if (Number(aparentado.matches_played) !== 1 || Number(aparentado.second_places) !== 1) throw new Error('podio mal contado');
  console.log('\nPERSISTENCIA MySQL VERIFICADA ✅');
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
} finally {
  await closePool();
}
