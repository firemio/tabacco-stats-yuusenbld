import { chromium } from 'playwright';

const TARGET_URL = 'https://thetobacco.mebaru.blue/c201/';

async function debugPage() {
  console.log('🔍 ページを調査中...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // ネットワークリクエストを監視
  const requests = [];
  const websockets = [];
  
  page.on('request', request => {
    const url = request.url();
    const method = request.method();
    const resourceType = request.resourceType();
    
    if (resourceType === 'xhr' || resourceType === 'fetch') {
      console.log(`📡 XHR/Fetch: ${method} ${url}`);
      requests.push({ method, url, type: resourceType });
    }
  });
  
  page.on('websocket', ws => {
    console.log(`🔌 WebSocket接続: ${ws.url()}`);
    websockets.push(ws.url());
    
    ws.on('framereceived', event => {
      const payload = event.payload;
      console.log(`📨 WebSocket受信 (${payload.length}文字):`, payload.substring(0, 500));
    });
    
    ws.on('framesent', event => {
      console.log(`📤 WebSocket送信:`, event.payload.substring(0, 200));
    });
  });
  
  // ページにアクセス
  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
  
  console.log('\n📄 ページ読み込み完了');
  
  // iframeを確認
  await page.waitForSelector('iframe', { timeout: 5000 }).catch(() => {});
  const frames = page.frames();
  console.log(`\n📑 フレーム数: ${frames.length}`);
  frames.forEach((f, i) => {
    console.log(`  フレーム${i}: ${f.url()}`);
  });
  
  // iframe内のコンテンツを取得
  const iframe = frames.find(f => f.url().includes('iframe.html'));
  if (iframe) {
    const html = await iframe.content();
    console.log('\n📝 iframe HTML (最初の2000文字):');
    console.log(html.substring(0, 2000));
    
    const bodyText = await iframe.evaluate(() => document.body.textContent);
    console.log('\n📄 iframe Body Text:');
    console.log(bodyText.substring(0, 1000));
    
    // JavaScriptファイルを探す
    const scripts = await iframe.evaluate(() => {
      return Array.from(document.querySelectorAll('script')).map(s => ({
        src: s.src,
        inline: s.src ? false : true,
        content: s.src ? null : s.textContent.substring(0, 500)
      }));
    });
    
    console.log('\n📜 JavaScriptファイル:');
    scripts.forEach(s => {
      if (s.src) {
        console.log(`  外部: ${s.src}`);
      } else {
        console.log(`  インライン: ${s.content.substring(0, 200)}...`);
      }
    });
  }
  
  console.log('\n⏳ 60秒間、ネットワーク活動を監視します...');
  console.log('この間にページのステータスが変わるか確認してください\n');
  
  await page.waitForTimeout(60000);
  
  console.log('\n📊 監視結果:');
  console.log(`  - XHR/Fetchリクエスト数: ${requests.length}`);
  console.log(`  - WebSocket接続数: ${websockets.length}`);
  
  if (requests.length > 0) {
    console.log('\n📡 検出されたリクエスト:');
    requests.slice(0, 10).forEach(r => {
      console.log(`  ${r.method} ${r.url}`);
    });
  }
  
  await browser.close();
  console.log('\n✅ 調査完了');
}

debugPage().catch(console.error);
