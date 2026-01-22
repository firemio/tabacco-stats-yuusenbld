/**
 * 本番データベース修正パッチ
 * 
 * 目的：
 * - 不正な行列イベント（2人以下で終了していない）を削除
 * - ステータス履歴から正しい行列イベントを再生成
 * 
 * 実行方法：
 * node patch-queue-events.js
 */

import db from './server/database.js';

const CAMERA_ID = 'abd6ab54-0eb9-4f52-a5a0-df6d8fd1ecb2';
const CAPACITY = 6; // 満員の基準

console.log('\n========================================');
console.log('  本番データベース修正パッチ');
console.log('========================================\n');

// ステップ1: 現在の状況を確認
console.log('【ステップ1】現在の状況を確認\n');

const currentCountStmt = db.prepare('SELECT COUNT(*) as count FROM queue_events WHERE camera_id = ?');
const currentCount = currentCountStmt.get(CAMERA_ID).count;
console.log(`現在の行列イベント数: ${currentCount}件`);

// 不正なイベントをカウント
const invalidCheckStmt = db.prepare(`
  SELECT COUNT(*) as count
  FROM queue_events qe
  WHERE qe.camera_id = ?
    AND qe.end_time IS NOT NULL
    AND (
      SELECT count 
      FROM status_records sr 
      WHERE sr.camera_id = qe.camera_id 
        AND sr.timestamp <= qe.end_time
      ORDER BY sr.timestamp DESC 
      LIMIT 1
    ) > 2
`);
const invalidCount = invalidCheckStmt.get(CAMERA_ID).count;

console.log(`不正なイベント数: ${invalidCount}件（2人以下で終了していない）`);
console.log(`正常なイベント数: ${currentCount - invalidCount}件\n`);

if (invalidCount === 0) {
  console.log('✅ すべてのイベントが正常です。パッチの実行は不要です。\n');
  process.exit(0);
}

// ステップ2: バックアップ（オプション）
console.log('【ステップ2】既存の行列イベントを削除\n');

const deleteStmt = db.prepare('DELETE FROM queue_events WHERE camera_id = ?');
const deleteResult = deleteStmt.run(CAMERA_ID);
console.log(`✅ ${deleteResult.changes}件の行列イベントを削除しました\n`);

// ステップ3: ステータス履歴を取得
console.log('【ステップ3】ステータス履歴から行列イベントを再生成\n');

const statusStmt = db.prepare(`
  SELECT timestamp, status, count
  FROM status_records
  WHERE camera_id = ?
  ORDER BY timestamp ASC
`);
const statuses = statusStmt.all(CAMERA_ID);
console.log(`ステータスレコード数: ${statuses.length}件\n`);

// ステップ4: 行列イベントを再生成
console.log('【ステップ4】行列検知ロジックを実行\n');

let queueState = {
  isMonitoring: false,     // 行列監視中か
  startTime: null,         // 行列開始時刻
  peakCount: 0,            // 最高人数
  turnoverCount: 0,        // 入れ替わり回数
  totalWaitingPeople: 0,   // 累積待ち人数
  minCountDuringGap: 999,  // 空き時の最小人数
  wasFull: false           // 直前が満員だったか
};

let generatedCount = 0;
const insertStmt = db.prepare(
  'INSERT INTO queue_events (camera_id, start_time, end_time, max_count, turnover_count, estimated_queue) VALUES (?, ?, ?, ?, ?, ?)'
);

let lastProgress = 0;

statuses.forEach((record, index) => {
  const count = record.count;
  const isFull = count >= CAPACITY; // 6人以上で満員
  const isEmpty = count <= 2; // 2人以下で行列終了
  
  // 進捗表示（10%ごと）
  const progress = Math.floor((index / statuses.length) * 100);
  if (progress >= lastProgress + 10) {
    console.log(`  処理中... ${progress}% (${index}/${statuses.length})`);
    lastProgress = progress;
  }
  
  // 満員に達した
  if (isFull) {
    if (!queueState.isMonitoring) {
      // 行列開始
      queueState.isMonitoring = true;
      queueState.startTime = record.timestamp;
      queueState.peakCount = count;
      queueState.turnoverCount = 0;
      queueState.totalWaitingPeople = 0;
      queueState.minCountDuringGap = 999;
      queueState.wasFull = true;
    } else {
      // 既に監視中：一度6人未満になってから再び6人以上 = 入れ替わり
      if (!queueState.wasFull && isFull) {
        queueState.turnoverCount++;
        
        // 待ち人数 = 増えた人数 = 現在 - 空き時の最小人数
        const waitingPeople = count - queueState.minCountDuringGap;
        queueState.totalWaitingPeople += waitingPeople;
        
        // 次の入れ替わりのために最小人数をリセット
        queueState.minCountDuringGap = 999;
      }
      queueState.wasFull = true;
      queueState.peakCount = Math.max(queueState.peakCount, count);
    }
  } else {
    // 6人未満
    if (queueState.isMonitoring) {
      queueState.wasFull = false;
      
      // 空き時の最小人数を記録
      queueState.minCountDuringGap = Math.min(queueState.minCountDuringGap, count);
      
      // 2人以下になったら行列終了
      if (isEmpty) {
        const estimatedQueue = queueState.totalWaitingPeople;
        
        // 行列イベントを記録
        insertStmt.run(
          CAMERA_ID,
          queueState.startTime,
          record.timestamp,
          queueState.peakCount,
          queueState.turnoverCount,
          estimatedQueue
        );
        
        generatedCount++;
        
        // 監視リセット
        queueState.isMonitoring = false;
        queueState.startTime = null;
        queueState.peakCount = 0;
        queueState.turnoverCount = 0;
        queueState.totalWaitingPeople = 0;
        queueState.minCountDuringGap = 999;
        queueState.wasFull = false;
      }
    }
  }
});

// 未完了の行列がある場合は警告
if (queueState.isMonitoring) {
  const startDate = new Date(queueState.startTime);
  console.log(`\n⚠️  警告: 未完了の行列が1件あります`);
  console.log(`   開始: ${startDate.toLocaleString('ja-JP')}`);
  console.log(`   最大${queueState.peakCount}人, 入替${queueState.turnoverCount}回`);
  console.log(`   → データベースには保存されません（正常な動作です）\n`);
}

console.log(`\n✅ ${generatedCount}件の行列イベントを生成しました\n`);

// ステップ5: 検証
console.log('【ステップ5】生成されたデータを検証\n');

const verifyStmt = db.prepare(`
  SELECT 
    COUNT(*) as total_count,
    SUM(CASE WHEN (
      SELECT count 
      FROM status_records sr 
      WHERE sr.camera_id = qe.camera_id 
        AND sr.timestamp <= qe.end_time
      ORDER BY sr.timestamp DESC 
      LIMIT 1
    ) > 2 THEN 1 ELSE 0 END) as invalid_count
  FROM queue_events qe
  WHERE qe.camera_id = ?
    AND qe.end_time IS NOT NULL
`);

const verifyResult = verifyStmt.get(CAMERA_ID);
const totalCount = verifyResult.total_count || 0;
const verifyInvalidCount = verifyResult.invalid_count || 0;

console.log(`生成された行列イベント数: ${totalCount}件`);
console.log(`不正なイベント数: ${verifyInvalidCount}件`);
console.log(`正常なイベント数: ${totalCount - verifyInvalidCount}件\n`);

if (verifyInvalidCount === 0) {
  console.log('✅ すべての行列イベントが正しく生成されました！');
  console.log('   すべてのイベントが2人以下で終了しています。\n');
} else {
  console.log('❌ 一部のイベントに問題があります。');
  console.log('   開発者に連絡してください。\n');
  process.exit(1);
}

// ステップ6: サマリー
console.log('========================================');
console.log('  パッチ適用完了');
console.log('========================================');
console.log(`削除: ${deleteResult.changes}件`);
console.log(`生成: ${generatedCount}件`);
console.log(`差分: ${generatedCount - deleteResult.changes}件\n`);
console.log('本番サーバーを再起動してください。\n');

