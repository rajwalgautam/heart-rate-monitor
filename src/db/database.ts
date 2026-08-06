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
const LATEST_SCHEMA_VERSION = 2;

/**
 * Apply pending schema migrations, tracked by SQLite's `user_version`. Fresh
 * installs start at 0 and run every migration; the steps are written to be
 * idempotent so re-running is harmless.
 */
async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  const row = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  let version = row?.user_version ?? 0;

  if (version < 2) {
    await migrateToV2(database);
    version = 2;
  }

  if (version !== LATEST_SCHEMA_VERSION) version = LATEST_SCHEMA_VERSION;
  // PRAGMA can't be parameterized; the value is a trusted integer constant.
  await database.execAsync(`PRAGMA user_version = ${version}`);
}

/**
 * v2: active tracking. Each recorded point becomes an interval summary rather
 * than a lone sample, so `session_readings` gains the interval's range, and
 * `sessions` records the cadence it was captured at.
 *
 * Existing rows were written one-per-notification, where the sample *is* the
 * whole interval — so they backfill to `hr_min = hr_max = hr_value`, which is
 * true rather than merely convenient. `interval_ms` stays NULL for those
 * sessions: they had no fixed cadence, and inventing one would misrepresent
 * their x-axis. `ADD COLUMN` isn't idempotent, so guard on existing columns.
 */
async function migrateToV2(database: SQLite.SQLiteDatabase): Promise<void> {
  const readingCols = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(session_readings)',
  );
  if (!readingCols.some((c) => c.name === 'hr_min')) {
    await database.execAsync('ALTER TABLE session_readings ADD COLUMN hr_min INTEGER');
  }
  if (!readingCols.some((c) => c.name === 'hr_max')) {
    await database.execAsync('ALTER TABLE session_readings ADD COLUMN hr_max INTEGER');
  }
  await database.runAsync(
    'UPDATE session_readings SET hr_min = hr_value, hr_max = hr_value WHERE hr_min IS NULL',
  );

  const sessionCols = await database.getAllAsync<{ name: string }>(
    'PRAGMA table_info(sessions)',
  );
  if (!sessionCols.some((c) => c.name === 'interval_ms')) {
    await database.execAsync('ALTER TABLE sessions ADD COLUMN interval_ms INTEGER');
  }
}
