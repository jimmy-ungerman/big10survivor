CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT,
  is_admin INTEGER DEFAULT 0,
  is_eliminated INTEGER DEFAULT 0,
  eliminated_week INTEGER,
  is_paid INTEGER DEFAULT 0,
  must_change_password INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  espn_id TEXT UNIQUE NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_abbr TEXT NOT NULL,
  away_abbr TEXT NOT NULL,
  week_number INTEGER NOT NULL,
  season INTEGER NOT NULL,
  commence_time TEXT NOT NULL,
  status TEXT DEFAULT 'scheduled',
  home_score INTEGER,
  away_score INTEGER,
  home_rank INTEGER,
  away_rank INTEGER,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS split_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  vote INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, season)
);

-- A player's planned-but-not-yet-locked picks (the Plan tab), synced up from
-- localStorage. The auto-picker cron (src/jobs/autoPicker.js) converts these
-- into real picks once the game's week goes live and hasn't kicked off yet.
CREATE TABLE IF NOT EXISTS planned_picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  week_number INTEGER NOT NULL,
  team_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, season, team_name)
);

CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id INTEGER NOT NULL REFERENCES games(id),
  week_number INTEGER NOT NULL,
  season INTEGER NOT NULL,
  picked_team TEXT NOT NULL CHECK(picked_team IN ('home', 'away')),
  result TEXT DEFAULT 'pending' CHECK(result IN ('pending', 'win', 'loss')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, game_id)
);
