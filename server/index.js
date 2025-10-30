import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  getDailyStats, 
  getHourlyStats, 
  getWeeklyHourlyStats,
  getLatestStatus, 
  getRecordCount,
  getStatusChanges,
  getQueueStatsByDay,
  getQueueHistory,
  getActiveQueueEvent,
  getQueueStacks
} from './database.js';
// Playwrightスクレイパーの代わりにAPI監視を使用
import { startMonitoring, setStatusChangeCallback } from './api-scraper.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3000;
const CAMERA_ID = 'abd6ab54-0eb9-4f52-a5a0-df6d8fd1ecb2';

// SSEクライアントのリスト
const sseClients = [];

// ミドルウェア
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API エンドポイント

/**
 * 最新のステータスを取得
 */
app.get('/api/status/latest', (req, res) => {
  try {
    const latest = getLatestStatus(CAMERA_ID);
    res.json({
      success: true,
      data: latest || { status: '未記録', timestamp: null }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 日ごとの統計を取得（人数ベース）
 */
app.get('/api/stats/daily', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = getDailyStats(CAMERA_ID, days);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 時間帯別の統計を取得（人数ベース）
 */
app.get('/api/stats/hourly', (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const stats = getHourlyStats(CAMERA_ID, date);
    
    res.json({
      success: true,
      date,
      data: stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 週間時間別統計を取得（過去7日間の各時刻の平均人数）
 */
app.get('/api/stats/weekly-hourly', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = getWeeklyHourlyStats(CAMERA_ID, days);
    
    res.json({
      success: true,
      days,
      data: stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ステータス変化履歴を取得
 */
app.get('/api/status/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const history = getStatusChanges(CAMERA_ID, limit);
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * レコード数を取得
 */
app.get('/api/stats/count', (req, res) => {
  try {
    const count = getRecordCount(CAMERA_ID);
    res.json({
      success: true,
      data: count
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 行列統計取得（日別）
 */
app.get('/api/queue/daily', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stats = getQueueStatsByDay(CAMERA_ID, days);
    
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 行列イベント履歴取得
 */
app.get('/api/queue/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const history = getQueueHistory(CAMERA_ID, limit);
    
    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 現在の行列状況取得
 */
app.get('/api/queue/current', (req, res) => {
  try {
    // 現在の人数を取得
    const currentStatus = getLatestStatus(CAMERA_ID);
    const currentCount = currentStatus?.count || 0;
    
    // 3人以下なら強制的に「行列なし」
    if (currentCount <= 3) {
      res.json({
        success: true,
        data: null,
        hasQueue: false
      });
      return;
    }
    
    // 4人以上の場合のみ行列イベントを確認
    const activeQueue = getActiveQueueEvent(CAMERA_ID);
    
    res.json({
      success: true,
      data: activeQueue || null,
      hasQueue: !!activeQueue
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 行列スタック取得（日時範囲指定）
 */
app.get('/api/queue/stacks', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const stacks = getQueueStacks(CAMERA_ID, days);
    
    res.json({
      success: true,
      data: stacks
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ヘルスチェック
 */
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

/**
 * Server-Sent Events (SSE) エンドポイント
 */
app.get('/api/events', (req, res) => {
  // SSEヘッダーを設定
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // クライアントをリストに追加
  const clientId = Date.now();
  const client = { id: clientId, res };
  sseClients.push(client);
  
  console.log(`✅ SSEクライアント接続: ${clientId} (合計: ${sseClients.length})`);
  
  // 初回接続メッセージ
  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);
  
  // 接続維持のためのハートビート（30秒ごと）
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);
  
  // クライアント切断時
  req.on('close', () => {
    clearInterval(heartbeat);
    const index = sseClients.findIndex(c => c.id === clientId);
    if (index !== -1) {
      sseClients.splice(index, 1);
    }
    console.log(`❌ SSEクライアント切断: ${clientId} (残り: ${sseClients.length})`);
  });
});

/**
 * 全SSEクライアントにイベントを送信
 */
export function broadcastStatusChange(status) {
  const message = `data: ${JSON.stringify({ type: 'status_change', status, timestamp: Date.now() })}\n\n`;
  
  sseClients.forEach(client => {
    try {
      client.res.write(message);
    } catch (error) {
      console.error(`SSE送信エラー (client ${client.id}):`, error.message);
    }
  });
  
  console.log(`📡 SSE送信: ${sseClients.length}クライアントに通知`);
}

// サーバー起動
app.listen(PORT, async () => {
  console.log(`\n🚀 サーバーが起動しました`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api`);
  console.log(`📡 SSE: http://localhost:${PORT}/api/events`);
  console.log('');
  
  // ステータス変更時のコールバックを設定
  setStatusChangeCallback(broadcastStatusChange);
  
  // スクレイピング開始
  await startMonitoring();
});
