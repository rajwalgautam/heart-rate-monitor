import * as SQLite from 'expo-sqlite';

let db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (db === null) {
    db = SQLite.openDatabaseSync('heart-rate-monitor.db');
  }
  return db;
}

/**
 * Create the schema idempotently. Safe to call on every boot.
 * See implementation.md §5.2.
 */
export async function initDatabase(): Promise<void> {
  const database = getDatabase();
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      start_time    INTEGER NOT NULL,
      end_time      INTEGER,
      avg_hr        INTEGER,
      max_hr        INTEGER,
      created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS session_readings (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      timestamp     INTEGER NOT NULL,
      hr_value      INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_session_readings_session
      ON session_readings (session_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_start ON sessions (start_time);
  `);
  await runMigrations(database);
}

/** Latest schema version; bump and add a branch in runMigrations per change. */
const LATEST_SCHEMA_VERSION = 1;

/**
 * Apply pending schema migrations, tracked by SQLite's `user_version`. Fresh
 * installs start at 0 and run every migration; the steps are written to be
 * idempotent so re-running is harmless.
 */
async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const version = row?.user_version ?? 0;

  // v1 is the initial schema created above; nothing to migrate yet. The
  // scaffolding is kept so the first real change is a one-branch edit.
  if (version === LATEST_SCHEMA_VERSION) return;

  // PRAGMA can't be parameterized; the value is a trusted integer constant.
  await database.execAsync(`PRAGMA user_version = ${LATEST_SCHEMA_VERSION}`);
}
