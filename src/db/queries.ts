import { getDatabase } from './database';
import type { IntervalSummary, Session, SessionReading } from '@/types';

interface SessionRow {
  id: number;
  start_time: number;
  end_time: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  interval_ms: number | null;
  created_at: number;
}

interface ReadingRow {
  id: number;
  session_id: number;
  timestamp: number;
  hr_value: number;
  hr_min: number | null;
  hr_max: number | null;
}

function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    startTime: row.start_time,
    endTime: row.end_time,
    avgHr: row.avg_hr,
    maxHr: row.max_hr,
    intervalMs: row.interval_ms,
    createdAt: row.created_at,
  };
}

function toReading(row: ReadingRow): SessionReading {
  return {
    id: row.id,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    hrValue: row.hr_value,
    hrMin: row.hr_min,
    hrMax: row.hr_max,
  };
}

/**
 * Open a new session. Summary columns stay null until it ends.
 *
 * `intervalMs` is recorded here rather than read from settings when the chart
 * renders, so a past session keeps the cadence it was actually captured at even
 * after the preference changes.
 */
export async function createSession(
  intervalMs: number,
  startTime: number = Date.now(),
): Promise<Session> {
  const db = getDatabase();
  const now = Date.now();
  const result = await db.runAsync(
    'INSERT INTO sessions (start_time, end_time, avg_hr, max_hr, interval_ms, created_at) VALUES (?, NULL, NULL, NULL, ?, ?)',
    [startTime, intervalMs, now],
  );
  return {
    id: result.lastInsertRowId,
    startTime,
    endTime: null,
    avgHr: null,
    maxHr: null,
    intervalMs,
    createdAt: now,
  };
}

/**
 * Close a session, writing the summary computed by the store's in-memory
 * accumulator rather than aggregating the readings table — see D3. Keeps the
 * summary correct even if an individual reading insert failed, and keeps a
 * query off the session-end path.
 */
export async function finalizeSession(
  sessionId: number,
  summary: { endTime: number; avgHr: number | null; maxHr: number | null },
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'UPDATE sessions SET end_time = ?, avg_hr = ?, max_hr = ? WHERE id = ?',
    [summary.endTime, summary.avgHr, summary.maxHr, sessionId],
  );
}

/**
 * Append one interval summary. Called once per tracking interval, not once per
 * BLE notification — see `summarizeInterval`.
 */
export async function insertReading(
  sessionId: number,
  summary: IntervalSummary,
  timestamp: number = Date.now(),
): Promise<void> {
  const db = getDatabase();
  await db.runAsync(
    'INSERT INTO session_readings (session_id, timestamp, hr_value, hr_min, hr_max) VALUES (?, ?, ?, ?, ?)',
    [sessionId, timestamp, summary.mean, summary.min, summary.max],
  );
}

/** Most recent sessions, newest first. */
export async function listSessions(limit = 50): Promise<Session[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    'SELECT * FROM sessions ORDER BY start_time DESC LIMIT ?',
    [limit],
  );
  return rows.map(toSession);
}

export async function getSession(id: number): Promise<Session | null> {
  const db = getDatabase();
  const row = await db.getFirstAsync<SessionRow>('SELECT * FROM sessions WHERE id = ?', [
    id,
  ]);
  return row === null ? null : toSession(row);
}

/** All readings for a session, oldest first. */
export async function getSessionReadings(sessionId: number): Promise<SessionReading[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<ReadingRow>(
    'SELECT * FROM session_readings WHERE session_id = ? ORDER BY timestamp ASC',
    [sessionId],
  );
  return rows.map(toReading);
}

/** Delete a session; readings cascade. */
export async function deleteSession(id: number): Promise<void> {
  const db = getDatabase();
  await db.runAsync('DELETE FROM sessions WHERE id = ?', [id]);
}

/**
 * Sessions that recorded at least one point, newest first.
 *
 * The History tab uses this rather than `listSessions` so a session that was
 * started and immediately stopped — or one that never got a reading because the
 * strap dropped — does not appear as an empty row with nothing to show.
 */
export async function listSessionsWithData(limit = 50): Promise<Session[]> {
  const db = getDatabase();
  const rows = await db.getAllAsync<SessionRow>(
    `SELECT s.* FROM sessions s
       WHERE EXISTS (SELECT 1 FROM session_readings r WHERE r.session_id = s.id)
       ORDER BY s.start_time DESC
       LIMIT ?`,
    [limit],
  );
  return rows.map(toSession);
}
