import { recordStatus } from './database.js';

const API_URL = 'https://api.mebaru.blue/api/cameras/getLatestDataForGroup?id=77adc011-b0d6-4421-989e-625560ffd53a';
const CAMERA_ID = 'abd6ab54-0eb9-4f52-a5a0-df6d8fd1ecb2';
const POLL_INTERVAL = 10000; // 10秒ごと

let lastStatus = null;
let broadcastCallback = null;
let intervalId = null;

/**
 * ステータス変更時のコールバックを設定
 */
export function setStatusChangeCallback(callback) {
  broadcastCallback = callback;
}

/**
 * APIからステータスを取得
 */
async function fetchStatusFromAPI() {
  try {
    const timestamp = Date.now();
    const response = await fetch(`${API_URL}&_=${timestamp}`);
    
    if (!response.ok) {
      console.error(`❌ APIエラー: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log('📦 APIレスポンス:', JSON.stringify(data).substring(0, 500));
    
    // データ構造を解析してカウンターとステータスを抽出
    let counter = 0;
    let status = '不明';
    
    // レスポンス構造: { success, message: { results: [...] } }
    let cameraData = null;
    
    if (data.message && data.message.results && Array.isArray(data.message.results)) {
      // message.results 配列から対象カメラを探す
      cameraData = data.message.results.find(c => 
        c.camera_id === CAMERA_ID || c.cameraId === CAMERA_ID
      );
      
      if (!cameraData && data.message.results.length > 0) {
        console.log('⚠️ カメラIDが見つかりません。最初のカメラを使用します');
        cameraData = data.message.results[0];
      }
    } else if (Array.isArray(data)) {
      // 直接配列の場合
      cameraData = data.find(c => c.id === CAMERA_ID || c.cameraId === CAMERA_ID);
      if (!cameraData && data.length > 0) {
        cameraData = data[0];
      }
    } else if (typeof data === 'object') {
      // オブジェクトの場合
      cameraData = data;
    }
    
    if (cameraData) {
      counter = extractCounter(cameraData);
    }
    
    // 人数からステータスを判定
    status = getStatusFromCount(counter);
    
    console.log(`📊 現在の人数: ${counter}人 → ステータス: ${status}`);
    return { status, count: counter };
    
  } catch (error) {
    console.error('❌ API取得エラー:', error.message);
    return null;
  }
}

/**
 * データからカウンター（人数）を抽出
 */
function extractCounter(data) {
  console.log('🔍 人数抽出中:', JSON.stringify(data).substring(0, 300));
  
  // よくあるフィールド名をチェック
  const counterFields = ['counter', 'count', 'people', 'persons', 'occupancy', 'number'];
  
  for (const field of counterFields) {
    if (data[field] !== undefined && data[field] !== null) {
      const count = parseInt(data[field]);
      if (!isNaN(count)) {
        return count;
      }
    }
  }
  
  // ネストされたデータをチェック
  if (data.data && typeof data.data === 'object') {
    return extractCounter(data.data);
  }
  
  // latestData などのネストもチェック
  if (data.latestData && typeof data.latestData === 'object') {
    return extractCounter(data.latestData);
  }
  
  return 0;
}

/**
 * 人数からステータスを判定
 * 0: 空いています
 * 1～5: やや混雑
 * 6以上: 大変混雑
 */
function getStatusFromCount(count) {
  if (count === 0) {
    return '空き';
  } else if (count >= 1 && count <= 5) {
    return 'やや混雑';
  } else if (count >= 6) {
    return '大変混雑';
  }
  return '不明';
}

/**
 * ポーリング開始
 */
export async function startMonitoring() {
  console.log('👀 API監視を開始します...');
  console.log(`🔗 API: ${API_URL}`);
  console.log(`⏰ ${POLL_INTERVAL / 1000}秒ごとにチェックします\n`);
  
  // 初回取得
  const initialData = await fetchStatusFromAPI();
  if (initialData && initialData.status !== '不明') {
    recordStatus(CAMERA_ID, initialData.status, initialData.count);
    lastStatus = initialData.status;
    console.log(`✅ 初回ステータスを記録: ${initialData.status} (${initialData.count}人)\n`);
    
    // SSE通知
    if (broadcastCallback) {
      broadcastCallback(initialData.status);
    }
  }
  
  // 定期ポーリング
  intervalId = setInterval(async () => {
    const currentData = await fetchStatusFromAPI();
    
    if (currentData && currentData.status !== '不明' && currentData.status !== lastStatus) {
      recordStatus(CAMERA_ID, currentData.status, currentData.count);
      console.log(`🔄 ステータス変更を記録: ${lastStatus} → ${currentData.status} (${currentData.count}人)`);
      lastStatus = currentData.status;
      
      // SSE通知
      if (broadcastCallback) {
        broadcastCallback(currentData.status);
      }
    } else if (currentData && currentData.status !== '不明') {
      console.log(`ℹ️ ステータス変更なし: ${currentData.status} (${currentData.count}人)`);
    }
  }, POLL_INTERVAL);
  
  console.log('✅ 監視を開始しました');
}

/**
 * 監視を停止
 */
export async function stopMonitoring() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('🛑 監視を停止しました');
  }
}

// プロセス終了時のクリーンアップ
process.on('SIGINT', async () => {
  console.log('\n👋 終了処理中...');
  await stopMonitoring();
  process.exit(0);
});
