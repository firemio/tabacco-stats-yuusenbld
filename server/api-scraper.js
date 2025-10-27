import { recordStatus, startQueueEvent, updateQueueEvent, endQueueEvent, getActiveQueueEvent } from './database.js';

const API_URL = 'https://api.mebaru.blue/api/cameras/getLatestDataForGroup?id=77adc011-b0d6-4421-989e-625560ffd53a';
const CAMERA_ID = 'abd6ab54-0eb9-4f52-a5a0-df6d8fd1ecb2';
const POLL_INTERVAL = 10000; // 10秒ごと
const CAPACITY = 6; // 定員

let lastStatus = null;
let lastCount = null;
let broadcastCallback = null;
let intervalId = null;

// 行列検知用
let queueDetectionState = {
  isMonitoring: false,  // 大変混雑を監視中か
  peakCount: 0,         // 最高人数
  turnoverCount: 0,     // 入れ替わり回数（=待ち人数）
  activeEventId: null,  // 現在の行列イベントID
  wasFull: false        // 直前が満員だったか
};

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
 * 6以上: 大変混雑（7人、8人も含む）
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
 * 行列を検知・記録
 * 6人以上で満員、3人以下で行列終了
 * 入れ替わり回数の累積 = 待ち人数
 */
function detectQueue(count) {
  const isFull = count >= CAPACITY; // 6人以上で満員
  const isEmpty = count <= 3; // 3人以下で行列終了
  
  // 満員に達した（6人以上）
  if (isFull) {
    if (!queueDetectionState.isMonitoring) {
      // 監視開始
      queueDetectionState.isMonitoring = true;
      queueDetectionState.peakCount = count;
      queueDetectionState.turnoverCount = 0;
      queueDetectionState.wasFull = true;
      
      // 行列イベント開始
      const result = startQueueEvent(CAMERA_ID, 0);
      queueDetectionState.activeEventId = result.lastInsertRowid;
      
      console.log(`🚶 行列検知開始 (${count}人で満員)`);
    } else {
      // 既に監視中
      // 一度6人未満になってから再び6人以上になった = 入れ替わり
      if (!queueDetectionState.wasFull && isFull) {
        queueDetectionState.turnoverCount++;
        
        // 入れ替わり回数 = 待ち人数
        const estimatedQueue = queueDetectionState.turnoverCount;
        
        // 行列イベント更新
        if (queueDetectionState.activeEventId) {
          updateQueueEvent(
            queueDetectionState.activeEventId, 
            queueDetectionState.turnoverCount, 
            estimatedQueue
          );
        }
        
        console.log(`🔄 入れ替わり検知 #${queueDetectionState.turnoverCount} (${count}人) - 推定待ち: ${estimatedQueue}人`);
      }
      
      queueDetectionState.wasFull = true;
      queueDetectionState.peakCount = Math.max(queueDetectionState.peakCount, count);
    }
  } else {
    // 6人未満
    if (queueDetectionState.isMonitoring) {
      queueDetectionState.wasFull = false;
      
      // 3人以下になったら行列終了
      if (isEmpty) {
        if (queueDetectionState.activeEventId) {
          endQueueEvent(queueDetectionState.activeEventId);
          
          const estimatedQueue = queueDetectionState.turnoverCount;
          console.log(`✅ 行列終了 - 入れ替わり: ${queueDetectionState.turnoverCount}回, 最大${queueDetectionState.peakCount}人, 推定待ち: ${estimatedQueue}人`);
        }
        
        // 監視リセット
        queueDetectionState.isMonitoring = false;
        queueDetectionState.peakCount = 0;
        queueDetectionState.turnoverCount = 0;
        queueDetectionState.activeEventId = null;
        queueDetectionState.wasFull = false;
      }
    }
  }
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
    lastCount = initialData.count;
    console.log(`✅ 初回ステータスを記録: ${initialData.status} (${initialData.count}人)\n`);
    
    // 行列検知
    detectQueue(initialData.count);
    
    // SSE通知
    if (broadcastCallback) {
      broadcastCallback(initialData.status);
    }
  }
  
  // 定期ポーリング
  intervalId = setInterval(async () => {
    const currentData = await fetchStatusFromAPI();
    
    if (currentData && currentData.status !== '不明') {
      // 行列検知（人数変化を常に監視）
      detectQueue(currentData.count);
      
      // ステータスが変わった場合のみ記録
      if (currentData.status !== lastStatus) {
        recordStatus(CAMERA_ID, currentData.status, currentData.count);
        console.log(`🔄 ステータス変更を記録: ${lastStatus} → ${currentData.status} (${currentData.count}人)`);
        lastStatus = currentData.status;
        
        // SSE通知
        if (broadcastCallback) {
          broadcastCallback(currentData.status);
        }
      } else {
        console.log(`ℹ️ ステータス変更なし: ${currentData.status} (${currentData.count}人)`);
      }
      
      // 人数を記録（次回の比較用）
      lastCount = currentData.count;
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
