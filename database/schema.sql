-- ============================================================
-- Esquema MySQL: Torneo de shooter multiplayer 3D
-- Uso:  mysql -u root -p < database/schema.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS web_fps_tournament
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE web_fps_tournament;

-- ------------------------------------------------------------
-- Perfiles de jugadores del torneo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS players (
  id          INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  nickname    VARCHAR(24)      NOT NULL,
  color       VARCHAR(20)      NOT NULL DEFAULT '#4fc3f7',
  created_at  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_players_nickname (nickname)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Cabecera de cada partida (3 rondas de 3 minutos)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS matches (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  started_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at  TIMESTAMP     NULL DEFAULT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Resultados por ronda (kills/deaths de cada jugador en cada ronda)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS round_results (
  id            INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  match_id      INT UNSIGNED   NOT NULL,
  round_number  TINYINT UNSIGNED NOT NULL,
  weapon        VARCHAR(20)    NOT NULL,
  player_id     INT UNSIGNED   NOT NULL,
  kills         INT UNSIGNED   NOT NULL DEFAULT 0,
  deaths        INT UNSIGNED   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_round_match (match_id, round_number),
  CONSTRAINT fk_round_match   FOREIGN KEY (match_id)  REFERENCES matches (id)   ON DELETE CASCADE,
  CONSTRAINT fk_round_player  FOREIGN KEY (player_id) REFERENCES players (id)   ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Podio final de la partida (1º, 2º, 3º y clasificados)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS match_results (
  match_id   INT UNSIGNED   NOT NULL,
  player_id  INT UNSIGNED   NOT NULL,
  `rank`     TINYINT UNSIGNED NOT NULL,
  kills      INT UNSIGNED   NOT NULL DEFAULT 0,
  deaths     INT UNSIGNED   NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, player_id),
  KEY idx_result_rank (match_id, `rank`),
  CONSTRAINT fk_result_match  FOREIGN KEY (match_id)  REFERENCES matches (id) ON DELETE CASCADE,
  CONSTRAINT fk_result_player FOREIGN KEY (player_id) REFERENCES players (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------------------
-- Tabla oficial del torneo: total de kills/bajas por jugador
-- ------------------------------------------------------------
DROP VIEW IF EXISTS leaderboard;
CREATE VIEW leaderboard AS
SELECT
  p.id,
  p.nickname,
  p.color,
  COUNT(DISTINCT mr.match_id)                    AS matches_played,
  COALESCE(SUM(mr.kills), 0)                     AS total_kills,
  COALESCE(SUM(mr.deaths), 0)                    AS total_deaths,
  COALESCE(SUM(mr.kills) - SUM(mr.deaths), 0)    AS kd_diff,
  SUM(CASE WHEN mr.`rank` = 1 THEN 1 ELSE 0 END)  AS first_places,
  SUM(CASE WHEN mr.`rank` = 2 THEN 1 ELSE 0 END)  AS second_places,
  SUM(CASE WHEN mr.`rank` = 3 THEN 1 ELSE 0 END)  AS third_places
FROM players p
LEFT JOIN match_results mr ON mr.player_id = p.id
GROUP BY p.id, p.nickname, p.color
ORDER BY total_kills DESC, total_deaths ASC;
