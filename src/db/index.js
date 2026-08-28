import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || './data/big10survivor.db';

// Ensure the data directory exists
const dbDir = DB_PATH.substring(0, DB_PATH.lastIndexOf('/'));
if (dbDir) {
  mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

export function query(sql, params = []) {
  const normalized = sql.replace(/\$(\d+)/g, '@p$1');
  const namedParams = {};
  params.forEach((val, i) => { namedParams[`p${i + 1}`] = val; });
  const stmt = db.prepare(normalized);
  const isRead = /^\s*SELECT\b/i.test(normalized) || /\bRETURNING\b/i.test(normalized);
  if (isRead) return { rows: stmt.all(namedParams) };
  const result = stmt.run(namedParams);
  return { rows: [], lastInsertRowid: result?.lastInsertRowid };
}

export function initDb() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Migrations for columns added after initial release
  try { db.exec('ALTER TABLE users ADD COLUMN is_paid INTEGER DEFAULT 0'); } catch {}
  try { db.exec('ALTER TABLE users ADD COLUMN full_name TEXT'); } catch {}
  try { db.exec('ALTER TABLE games ADD COLUMN home_rank INTEGER'); } catch {}
  try { db.exec('ALTER TABLE games ADD COLUMN away_rank INTEGER'); } catch {}
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS split_votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      season INTEGER NOT NULL,
      vote INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, season)
    )`);
  } catch {}

  console.log('Database initialized');
}

export default { query };
