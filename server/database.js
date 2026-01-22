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
 * 週間時間別統計を取得（過去7日間の各時刻の平均行列人数・継続時間）
 * 行列イベントが存在していた各時刻に記録を展開して集計（滞在時間ベース）
 * ※日付をまたぐことはない前提
 */
export function getWeeklyHourlyStats(cameraId, days = 7) {
  const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const stmt = db.prepare(`
    WITH RECURSIVE queue_hours AS (
      -- 各行列イベントの開始時刻（最初の時刻）
    SELECT 
        id,
        start_time,
        end_time,
        max_count,
        turnover_count,
        CAST(strftime('%H', start_time / 1000, 'unixepoch', 'localtime') AS INTEGER) as start_hour,
        CAST(strftime('%H', end_time / 1000, 'unixepoch', 'localtime') AS INTEGER) as end_hour,
        CAST(strftime('%H', start_time / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
        CAST(strftime('%M', start_time / 1000, 'unixepoch', 'localtime') AS INTEGER) as start_minute,
        CAST(strftime('%M', end_time / 1000, 'unixepoch', 'localtime') AS INTEGER) as end_minute
    FROM queue_events
    WHERE camera_id = ? 
      AND start_time >= ?
      AND end_time IS NOT NULL
      AND max_count > 0
      
      UNION ALL
      
      -- 次の時刻まで1時間ずつ進める
      SELECT 
        qh.id,
        qh.start_time,
        qh.end_time,
        qh.max_count,
        qh.turnover_count,
        qh.start_hour,
        qh.end_hour,
        qh.hour + 1 as hour,
        qh.start_minute,
        qh.end_minute
      FROM queue_hours qh
      WHERE qh.hour < qh.end_hour
    ),
    queue_hour_durations AS (
      SELECT 
        hour,
        id,
        max_count,
        turnover_count,
        -- その時刻における滞在時間（分）
        CASE 
          WHEN hour = start_hour AND hour = end_hour THEN 
            -- 同じ時刻内で開始・終了（例：12:30～12:45 = 15分）
            end_minute - start_minute
          WHEN hour = start_hour THEN 
            -- 開始時刻（例：12:30開始なら12:30～13:00 = 30分）
            60 - start_minute
          WHEN hour = end_hour THEN 
            -- 終了時刻（例：13:45終了なら13:00～13:45 = 45分）
            end_minute
          ELSE 
            -- 中間の時刻（丸々1時間 = 60分）
            60
        END as duration_minutes
      FROM queue_hours
    )
    SELECT 
      printf('%02d', hour) as hour,
      AVG(max_count) as avg_count,
      MAX(max_count) as max_count,
      COUNT(DISTINCT id) as record_count,
      SUM(duration_minutes) as total_minutes,
      AVG(duration_minutes) as avg_duration,
      AVG(turnover_count) as avg_turnover,
      AVG(CAST((SELECT estimated_queue FROM queue_events WHERE id = queue_hour_durations.id) AS REAL)) as avg_estimated_queue
    FROM queue_hour_durations
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
 * すべての未完了行列イベントを削除
 * （サーバー再起動などで正しく終了できなかったイベントは信頼できないため削除）
 */
export function cleanupIncompleteQueueEvents(cameraId) {
  const stmt = db.prepare(
    'DELETE FROM queue_events WHERE camera_id = ? AND end_time IS NULL'
  );
  const result = stmt.run(cameraId);
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
 * 行列が継続している各時刻にデータを展開（滞在時間ベース）
 */
export function getQueueStacks(cameraId, days = 7) {
  const startTime = Date.now() - (days * 24 * 60 * 60 * 1000);
  
  const stmt = db.prepare(`
    WITH RECURSIVE queue_hours AS (
      -- 各行列イベントの開始時刻
    SELECT 
      id,
      start_time,
      end_time,
      max_count,
      turnover_count,
      estimated_queue,
      date(start_time / 1000, 'unixepoch', 'localtime') as date,
        CAST(strftime('%H', start_time / 1000, 'unixepoch', 'localtime') AS INTEGER) as start_hour,
        CAST(strftime('%H', end_time / 1000, 'unixepoch', 'localtime') AS INTEGER) as end_hour,
        CAST(strftime('%H', start_time / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
      datetime(start_time / 1000, 'unixepoch', 'localtime') as start_formatted,
      datetime(end_time / 1000, 'unixepoch', 'localtime') as end_formatted,
      CAST((end_time - start_time) / 60000 AS INTEGER) as duration_minutes
    FROM queue_events
      WHERE camera_id = ? 
        AND start_time >= ?
        AND end_time IS NOT NULL
      
      UNION ALL
      
      -- 次の時刻まで1時間ずつ進める
      SELECT 
        qh.id,
        qh.start_time,
        qh.end_time,
        qh.max_count,
        qh.turnover_count,
        qh.estimated_queue,
        qh.date,
        qh.start_hour,
        qh.end_hour,
        qh.hour + 1 as hour,
        qh.start_formatted,
        qh.end_formatted,
        qh.duration_minutes
      FROM queue_hours qh
      WHERE qh.hour < qh.end_hour
    )
    SELECT 
      id,
      date,
      printf('%02d', hour) as start_hour,
      printf('%02d', start_hour) as original_start_hour,
      printf('%02d', end_hour) as original_end_hour,
      max_count,
      turnover_count,
      estimated_queue,
      start_formatted,
      end_formatted,
      duration_minutes
    FROM queue_hours
    ORDER BY start_time DESC, hour
  `);
  
  return stmt.all(cameraId, startTime);
}

export default db;
