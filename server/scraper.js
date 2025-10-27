import { chromium } from 'playwright';
import { recordStatus } from './database.js';

const TARGET_URL = 'https://thetobacco.mebaru.blue/c201/';
const CAMERA_ID = 'abd6ab54-0eb9-4f52-a5a0-df6d8fd1ecb2';

let browser = null;
let page = null;
let lastStatus = null;
let broadcastCallback = null;

/**
 * ステータス変更時のコールバックを設定
 */
export function setStatusChangeCallback(callback) {
  broadcastCallback = callback;
}

/**
 * ブラウザを初期化
 */
async function initBrowser() {
  console.log('🚀 ブラウザを起動中...');
  browser = await chromium.launch({
    headless: true
  });
  
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  page = await context.newPage();
  
  console.log('✅ ブラウザが起動しました');
}

/**
 * WebSocketメッセージからステータスを抽出
 */
function extractStatusFromMessage(message) {
  try {
    // JSON形式のメッセージをパース
    const data = typeof message === 'string' ? JSON.parse(message) : message;
    
    console.log('📦 WebSocketメッセージ:', JSON.stringify(data).substring(0, 200));
    
    // メッセージ内のステータス情報を探す
    // 実際の構造に応じて調整が必要
    if (data.status) {
      return data.status;
    }
    if (data.congestion) {
      return data.congestion;
    }
    if (data.state) {
      return data.state;
    }
    
    // メッセージ全体を文字列化して検索
    const msgStr = JSON.stringify(data).toLowerCase();
    if (msgStr.includes('空き') || msgStr.includes('vacant')) {
      return '空き';
    } else if (msgStr.includes('大変混雑') || msgStr.includes('very crowded')) {
      return '大変混雑';
    } else if (msgStr.includes('やや混雑') || msgStr.includes('busy')) {
      return 'やや混雑';
    } else if (msgStr.includes('混雑') || msgStr.includes('crowded')) {
      return '混雑';
    }
    
    return null;
  } catch (error) {
    console.log('⚠️ メッセージ解析エラー:', error.message);
    return null;
  }
}

/**
 * WebSocket接続を監視
 */
async function monitorWebSocket() {
  console.log('🔌 WebSocket監視を開始...');
  
  // WebSocket接続を監視
  page.on('websocket', ws => {
    console.log(`🔗 WebSocket接続検出: ${ws.url()}`);
    
    // メッセージ受信時
    ws.on('framereceived', event => {
      const message = event.payload;
      console.log('📨 WebSocketメッセージ受信');
      
      const status = extractStatusFromMessage(message);
      if (status && status !== lastStatus) {
        recordStatus(CAMERA_ID, status);
        console.log(`✅ ステータス変更を記録: ${lastStatus} → ${status}`);
        lastStatus = status;
        
        // SSEでクライアントに通知
        if (broadcastCallback) {
          broadcastCallback(status);
        }
      }
    });
    
    // メッセージ送信時（デバッグ用）
    ws.on('framesent', event => {
      console.log('📤 WebSocketメッセージ送信:', event.payload.substring(0, 100));
    });
    
    // 接続終了時
    ws.on('close', () => {
      console.log('🔌 WebSocket接続が切断されました');
    });
  });
  
  // DOMの変更も監視（WebSocketが見つからない場合のフォールバック）
  await page.exposeFunction('onStatusChange', (status) => {
    if (status && status !== lastStatus) {
      recordStatus(CAMERA_ID, status);
      console.log(`✅ ステータス変更を記録（DOM監視）: ${lastStatus} → ${status}`);
      lastStatus = status;
      
      // SSEでクライアントに通知
      if (broadcastCallback) {
        broadcastCallback(status);
      }
    }
  });
}

/**
 * リアルタイム監視を開始（WebSocket + DOM監視）
 */
export async function startMonitoring() {
  console.log('👀 リアルタイム監視を開始します...');
  
  await initBrowser();
  
  // WebSocket監視を設定
  await monitorWebSocket();
  
  console.log('📡 ページにアクセス中...');
  await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
  
  // iframeを待機
  await page.waitForSelector('iframe', { timeout: 10000 });
  
  console.log('✅ WebSocket監視モードで接続しました');
  console.log('🔄 ステータスが変更されると自動的に記録されます');
  
  // デバッグ: フレームの情報を表示
  const allFrames = page.frames();
  console.log(`📄 フレーム数: ${allFrames.length}`);
  allFrames.forEach((f, i) => {
    console.log(`  フレーム${i}: ${f.url()}`);
  });
  
  // iframe内でのDOM変更も監視（フォールバック）
  const frame = allFrames.find(f => f.url().includes('iframe.html'));
  
  if (frame) {
    // デバッグ: iframe内のHTML構造を確認
    const htmlContent = await frame.content();
    console.log('\n📝 iframe内のHTML（最初の1000文字）:');
    console.log(htmlContent.substring(0, 1000));
    console.log('...\n');
    
    // 初回のステータスを取得
    const initialStatus = await frame.evaluate(() => {
      const bodyText = document.body.textContent;
      console.log('Body全文:', bodyText);
      return bodyText;
    });
    console.log('📄 iframe内のテキスト:', initialStatus.substring(0, 500));
    
    await frame.evaluate(() => {
      // MutationObserverでDOM変更を監視
      const observer = new MutationObserver((mutations) => {
        const bodyText = document.body.textContent.toLowerCase();
        console.log('🔄 DOM変更検知:', bodyText.substring(0, 200));
        
        let status = '不明';
        if (bodyText.includes('空き') || bodyText.includes('vacant')) {
          status = '空き';
        } else if (bodyText.includes('大変混雑') || bodyText.includes('very crowded')) {
          status = '大変混雑';
        } else if (bodyText.includes('やや混雑') || bodyText.includes('busy')) {
          status = 'やや混雑';
        } else if (bodyText.includes('混雑') || bodyText.includes('crowded')) {
          status = '混雑';
        }
        
        console.log('判定されたステータス:', status);
        
        // コールバック関数を呼び出し（page.exposeFunctionで登録済み）
        if (typeof window.onStatusChange === 'function') {
          window.onStatusChange(status);
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
      
      console.log('✅ DOM監視を開始しました');
    }).catch(err => {
      console.log('⚠️ DOM監視の設定に失敗:', err.message);
    });
  } else {
    console.log('⚠️ iframe.htmlを含むフレームが見つかりませんでした');
  }
}

/**
 * 監視を停止
 */
export async function stopMonitoring() {
  if (browser) {
    await browser.close();
    browser = null;
    page = null;
    console.log('🛑 ブラウザを終了しました');
  }
}

// プロセス終了時のクリーンアップ
process.on('SIGINT', async () => {
  console.log('\n👋 終了処理中...');
  await stopMonitoring();
  process.exit(0);
});
