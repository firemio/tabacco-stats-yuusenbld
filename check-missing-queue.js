import db from './server/database.js';

console.log('\n=== 最新20件の行列イベント ===\n');

const stmt = db.prepare(`
  SELECT 
    id,
    datetime(start_time / 1000, 'unixepoch', 'localtime') as start_time,
    datetime(end_time / 1000, 'unixepoch', 'localtime') as end_time,
    max_count,
    turnover_count,
    estimated_queue,
    CAST((end_time - start_time) / 60000 AS INTEGER) as duration
  FROM queue_events
  WHERE camera_id = 'abd6ab54-0eb9-4f52-a5a0-df6d8fd1ecb2'
    AND end_time IS NOT NULL
  ORDER BY start_time DESC
  LIMIT 20
`);

const results = stmt.all();

results.forEach((r, i) => {
  console.log(`${i + 1}. ID ${r.id}: ${r.start_time} ~ ${r.end_time}`);
  console.log(`   ${r.duration}分, 最大${r.max_count}人, 入替${r.turnover_count}回, 推定待ち${r.estimated_queue}人\n`);
});

// 13:06以降の行列を探す
console.log('=== 13:06以降に開始した行列 ===\n');

const stmt2 = db.prepare(`
  SELECT 
    id,
    datetime(start_time / 1000, 'unixepoch', 'localtime') as start_time,
    datetime(end_time / 1000, 'unixepoch', 'localtime') as end_time,
    max_count,
    turnover_count,
    estimated_queue
  FROM queue_events
  WHERE camera_id = 'abd6ab54-0eb9-4f52-a5a0-df6d8fd1ecb2'
    AND start_time >= strftime('%s', '2025-11-10 13:06:00') * 1000
    AND end_time IS NOT NULL
  ORDER BY start_time DESC
`);

const after1306 = stmt2.all();

if (after1306.length > 0) {
  after1306.forEach(r => {
    console.log(`ID ${r.id}: ${r.start_time} ~ ${r.end_time}`);
    console.log(`  最大${r.max_count}人, 入替${r.turnover_count}回, 推定待ち${r.estimated_queue}人\n`);
  });
} else {
  console.log('❌ 13:06以降に開始した行列イベントが見つかりません！');
  console.log('   → 13:06～14:30の行列が記録されていない可能性があります\n');
}

// サーバーが稼働中か確認
console.log('=== サーバー状態確認 ===\n');

const latestStatus = db.prepare(`
  SELECT 
    datetime(timestamp / 1000, 'unixepoch', 'localtime') as time,
    count,
    status
  FROM status_records
  WHERE camera_id = 'abd6ab54-0eb9-4f52-a5a0-df6d8fd1ecb2'
  ORDER BY timestamp DESC
  LIMIT 1
`).get();

console.log(`最新ステータス: ${latestStatus.time} - ${latestStatus.count}人 (${latestStatus.status})`);

const timeDiff = Date.now() - new Date(latestStatus.time).getTime();
const minutesAgo = Math.floor(timeDiff / 60000);

if (minutesAgo > 5) {
  console.log(`⚠️  最新ステータスが${minutesAgo}分前です。サーバーが停止している可能性があります。`);
} else {
  console.log(`✅ サーバーは稼働中です（${minutesAgo}分前に更新）`);
}

console.log('');

