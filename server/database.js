import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'tobacco_stats.db');

// データベース接続
const db = new Database(dbPath);

// テーブル作成
db.exec(`
  CREATE TABLE IF NOT EXISTS status_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id TEXT NOT NULL,
    status TEXT NOT NULL,
    count INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_timestamp ON status_records(timestamp);
  CREATE INDEX IF NOT EXISTS idx_camera_id ON status_records(camera_id);
`);

// 既存テーブルにcountカラムを追加（存在しない場合）
try {
  db.exec('ALTER TABLE status_records ADD COLUMN count INTEGER DEFAULT 0');
  console.log('✅ countカラムを追加しました');
} catch (error) {
  // カラムが既に存在する場合はエラーを無視
  if (!error.message.includes('duplicate column')) {
    console.error('⚠️ カラム追加エラー:', error.message);
  }
}

// 行列検知用のテーブル作成
db.exec(`
  CREATE TABLE IF NOT EXISTS queue_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    max_count INTEGER DEFAULT 0,
    turnover_count INTEGER DEFAULT 1,
    estimated_queue INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_queue_start ON queue_events(start_time);
  CREATE INDEX IF NOT EXISTS idx_queue_camera ON queue_events(camera_id);
`);

// 既存テーブルにmax_countカラムを追加（存在しない場合）
try {
  db.exec('ALTER TABLE queue_events ADD COLUMN max_count INTEGER DEFAULT 0');
  console.log('✅ max_countカラムを追加しました');
} catch (error) {
  // カラムが既に存在する場合はエラーを無視
  if (!error.message.includes('duplicate column')) {
    console.error('⚠️ カラム追加エラー:', error.message);
  }
}

/**
 * ステータスを記録
 */
export function recordStatus(cameraId, status, count = 0) {
  const timestamp = Date.now();
  const stmt = db.prepare(
    'INSERT INTO status_records (camera_id, status, count, timestamp) VALUES (?, ?, ?, ?)'
  );
  return stmt.run(cameraId, status, count, timestamp);
}

/**
 * 日ごとの統計を取得（人数ベース）
 */
export function getDailyStats(cameraId, days = 7) {
  const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const stmt = db.prepare(`
    SELECT 
      date(timestamp / 1000, 'unixepoch', 'localtime') as date,
      AVG(count) as avg_count,
      MAX(count) as max_count,
      MIN(count) as min_count,
      COUNT(*) as record_count
    FROM status_records
    WHERE camera_id = ? AND timestamp >= ?
    GROUP BY date
    ORDER BY date DESC
  `);
  
  return stmt.all(cameraId, startTime);
}

/**
 * 時間帯別の統計を取得（指定日、人数ベース）
 */
export function getHourlyStats(cameraId, date) {
  const stmt = db.prepare(`
    SELECT 
      strftime('%H', timestamp / 1000, 'unixepoch', 'localtime') as hour,
      AVG(count) as avg_count,
      MAX(count) as max_count,
      MIN(count) as min_count,
      COUNT(*) as record_count
    FROM status_records
    WHERE camera_id = ? 
      AND date(timestamp / 1000, 'unixepoch', 'localtime') = ?
    GROUP BY hour
    ORDER BY hour
  `);
  
  return stmt.all(cameraId, date);
}

/**
 * 週間時間別統計を取得（過去7日間の各時刻の平均行列人数）
 * 行列イベントの最大人数を時刻別に集計
 */
export function getWeeklyHourlyStats(cameraId, days = 7) {
  const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const stmt = db.prepare(`
    SELECT 
      strftime('%H', start_time / 1000, 'unixepoch', 'localtime') as hour,
      AVG(max_count) as avg_count,
      MAX(max_count) as max_count,
      COUNT(*) as record_count
    FROM queue_events
    WHERE camera_id = ? 
      AND start_time >= ?
      AND end_time IS NOT NULL
      AND max_count > 0
    GROUP BY hour
    ORDER BY hour
  `);
  
  return stmt.all(cameraId, startTime);
}

/**
 * 最新のステータスを取得
 */
export function getLatestStatus(cameraId) {
  const stmt = db.prepare(`
    SELECT status, count, timestamp, datetime(timestamp / 1000, 'unixepoch', 'localtime') as formatted_time
    FROM status_records
    WHERE camera_id = ?
    ORDER BY timestamp DESC
    LIMIT 1
  `);
  
  return stmt.get(cameraId);
}

/**
 * すべてのレコード数を取得
 */
export function getRecordCount(cameraId) {
  const stmt = db.prepare('SELECT COUNT(*) as count FROM status_records WHERE camera_id = ?');
  return stmt.get(cameraId);
}

/**
 * ステータスの変化履歴を取得（同じステータスが連続する場合は1つにまとめる）
 */
export function getStatusChanges(cameraId, limit = 100) {
  const stmt = db.prepare(`
    WITH status_changes AS (
      SELECT 
        status,
        count,
        timestamp,
        datetime(timestamp / 1000, 'unixepoch', 'localtime') as formatted_time,
        LAG(status) OVER (ORDER BY timestamp) as prev_status
      FROM status_records
      WHERE camera_id = ?
      ORDER BY timestamp DESC
    )
    SELECT status, count, timestamp, formatted_time
    FROM status_changes
    WHERE prev_status IS NULL OR status != prev_status
    LIMIT ?
  `);
  
  return stmt.all(cameraId, limit);
}

/**
 * 行列イベントを開始
 */
export function startQueueEvent(cameraId, maxCount = 0, estimatedQueue = 0) {
  const timestamp = Date.now();
  const stmt = db.prepare(
    'INSERT INTO queue_events (camera_id, start_time, max_count, estimated_queue, turnover_count) VALUES (?, ?, ?, ?, 1)'
  );
  return stmt.run(cameraId, timestamp, maxCount, estimatedQueue);
}

/**
 * 行列イベントを更新（入れ替わり回数と最大人数を増やす）
 */
export function updateQueueEvent(eventId, turnoverCount, estimatedQueue, maxCount) {
  const stmt = db.prepare(
    'UPDATE queue_events SET turnover_count = ?, estimated_queue = ?, max_count = ? WHERE id = ?'
  );
  return stmt.run(turnoverCount, estimatedQueue, maxCount, eventId);
}

/**
 * 行列イベントを終了
 */
export function endQueueEvent(eventId) {
  const timestamp = Date.now();
  const stmt = db.prepare(
    'UPDATE queue_events SET end_time = ? WHERE id = ?'
  );
  return stmt.run(timestamp, eventId);
}

/**
 * 現在進行中の行列イベントを取得
 */
export function getActiveQueueEvent(cameraId) {
  const stmt = db.prepare(
    'SELECT * FROM queue_events WHERE camera_id = ? AND end_time IS NULL ORDER BY start_time DESC LIMIT 1'
  );
  
  return stmt.get(cameraId);
}

/**
 * すべての未完了行列イベントを強制終了
 */
export function cleanupIncompleteQueueEvents(cameraId) {
  const timestamp = Date.now();
  const stmt = db.prepare(
    'UPDATE queue_events SET end_time = ? WHERE camera_id = ? AND end_time IS NULL'
  );
  const result = stmt.run(timestamp, cameraId);
  return result.changes;
}

/**
 * 行列統計を取得（日別）
 */
export function getQueueStatsByDay(cameraId, days = 7) {
  const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const stmt = db.prepare(`
    SELECT 
      date(start_time / 1000, 'unixepoch', 'localtime') as date,
      COUNT(*) as queue_count,
      AVG(turnover_count) as avg_turnover,
      MAX(turnover_count) as max_turnover,
      AVG(estimated_queue) as avg_estimated_queue,
      MAX(estimated_queue) as max_estimated_queue
    FROM queue_events
    WHERE camera_id = ? AND start_time >= ? AND end_time IS NOT NULL
    GROUP BY date
    ORDER BY date DESC
  `);
  
  return stmt.all(cameraId, startTime);
}

/**
 * 行列イベント履歴を取得
 */
export function getQueueHistory(cameraId, limit = 50) {
  const stmt = db.prepare(`
    SELECT 
      start_time,
      end_time,
      max_count,
      turnover_count,
      estimated_queue,
      datetime(start_time / 1000, 'unixepoch', 'localtime') as start_formatted,
      datetime(end_time / 1000, 'unixepoch', 'localtime') as end_formatted,
      CAST((end_time - start_time) / 60000 AS INTEGER) as duration_minutes
    FROM queue_events
    WHERE camera_id = ? AND end_time IS NOT NULL
    ORDER BY start_time DESC
    LIMIT ?
  `);
  
  return stmt.all(cameraId, limit);
}

/**
 * 行列スタックを取得（日時範囲指定）
 * 横軸：日付、縦軸：時刻で表示するためのデータ
 */
export function getQueueStacks(cameraId, days = 7) {
  const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const stmt = db.prepare(`
    SELECT 
      id,
      start_time,
      end_time,
      max_count,
      turnover_count,
      estimated_queue,
      date(start_time / 1000, 'unixepoch', 'localtime') as date,
      strftime('%H', start_time / 1000, 'unixepoch', 'localtime') as start_hour,
      strftime('%M', start_time / 1000, 'unixepoch', 'localtime') as start_minute,
      strftime('%H', end_time / 1000, 'unixepoch', 'localtime') as end_hour,
      strftime('%M', end_time / 1000, 'unixepoch', 'localtime') as end_minute,
      datetime(start_time / 1000, 'unixepoch', 'localtime') as start_formatted,
      datetime(end_time / 1000, 'unixepoch', 'localtime') as end_formatted,
      CAST((end_time - start_time) / 60000 AS INTEGER) as duration_minutes
    FROM queue_events
    WHERE camera_id = ? AND start_time >= ? AND end_time IS NOT NULL
    ORDER BY start_time DESC
  `);
  
  return stmt.all(cameraId, startTime);
}

export default db;
