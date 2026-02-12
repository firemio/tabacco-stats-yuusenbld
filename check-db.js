import Database from 'better-sqlite3';
const db = new Database('tobacco_stats.db');

const rows = db.prepare('SELECT id, start_time, end_time, datetime(start_time/1000, \'unixepoch\', \'localtime\') as local FROM queue_events ORDER BY start_time DESC LIMIT 10').all();
console.log('Recent events:', JSON.stringify(rows, null, 2));

const now = Date.now();
const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
console.log('Now:', new Date(now).toISOString());
console.log('Week ago:', new Date(weekAgo).toISOString());

const weekRows = db.prepare('SELECT id, start_time, end_time, datetime(start_time/1000, \'unixepoch\', \'localtime\') as local FROM queue_events WHERE start_time >= ? ORDER BY start_time DESC LIMIT 10').all(weekAgo);
console.log('Last 7 days events:', JSON.stringify(weekRows, null, 2));
