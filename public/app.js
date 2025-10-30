const API_BASE = '/api';

// グラフのインスタンス
let hourlyChart = null;

// ステータスの色定義
const statusColors = {
  '空き': '#10b981',
  'やや混雑': '#f59e0b',
  '混雑': '#ef4444',
  '大変混雑': '#dc2626',
  '不明': '#6b7280'
};

// 表示モード管理
let isFullHDMode = true;

/**
 * 表示モードを切り替え
 */
function toggleDisplayMode() {
  isFullHDMode = !isFullHDMode;
  const mainContent = document.getElementById('main-content');
  const appContainer = document.getElementById('app-container');
  const body = document.body;
  const modeText = document.getElementById('mode-text');
  const toggleBtn = document.getElementById('toggle-mode');
  const leftColumn = mainContent.children[0];
  const rightColumn = mainContent.children[1];
  
  if (isFullHDMode) {
    // Full HD固定表示モード (1:2の比率)
    body.style.overflow = 'hidden';
    appContainer.style.overflow = 'hidden';
    appContainer.style.height = '100vh';
    mainContent.className = 'flex-1 grid gap-4 overflow-hidden';
    mainContent.style.gridTemplateColumns = '1fr 2fr';
    leftColumn.className = 'flex flex-col space-y-3';
    rightColumn.className = 'flex flex-col space-y-3';
    modeText.textContent = 'レスポンシブ';
    toggleBtn.querySelector('i').className = 'fas fa-desktop';
  } else {
    // レスポンシブモード（縦1カラム、全体スクロール）
    body.style.overflow = 'auto';
    appContainer.style.overflow = 'visible';
    appContainer.style.height = 'auto';
    mainContent.className = 'flex flex-col gap-4 pb-4';
    mainContent.style.gridTemplateColumns = '';
    leftColumn.className = 'flex flex-col space-y-3';
    rightColumn.className = 'flex flex-col space-y-3';
    modeText.textContent = 'Full HD固定';
    toggleBtn.querySelector('i').className = 'fas fa-mobile-alt';
  }
  
  // グラフを再描画
  setTimeout(() => {
    if (hourlyChart) hourlyChart.resize();
  }, 100);
}

/**
 * 初期化
 */
async function init() {
  await loadCurrentStatus();
  await loadRecordCount();
  await loadQueueStacks();
  await loadQueueStatus();
  await loadQueueHistory();
  await loadStatusHistory();
  
  // 週間時間別統計を読み込む
  await loadWeeklyHourlyStats();
  
  // 表示モード切替ボタン
  document.getElementById('toggle-mode').addEventListener('click', toggleDisplayMode);
  
  // Server-Sent Events (SSE) でリアルタイム更新
  connectSSE();
}

/**
 * SSE接続でリアルタイム更新を受信
 */
function connectSSE() {
  const eventSource = new EventSource('/api/events');
  
  eventSource.onmessage = async (event) => {
    console.log('📨 ステータス更新イベント受信:', event.data);
    
    // ステータスが変更されたら全データを再読み込み
    await loadCurrentStatus();
    await loadRecordCount();
    await loadQueueStacks();
    await loadQueueStatus();
    await loadQueueHistory();
    await loadStatusHistory();
    await loadWeeklyHourlyStats();
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE接続エラー:', error);
    eventSource.close();
    
    // 5秒後に再接続
    setTimeout(() => {
      console.log('SSE再接続中...');
      connectSSE();
    }, 5000);
  };
  
  console.log('✅ SSE接続を確立しました');
}

/**
 * 現在のステータスを取得
 */
async function loadCurrentStatus() {
  try {
    const response = await fetch(`${API_BASE}/status/latest`);
    const result = await response.json();
    
    if (result.success && result.data) {
      const { status, count, formatted_time } = result.data;
      const color = statusColors[status] || statusColors['不明'];
      const peopleCount = count !== undefined ? count : 0;
      
      document.getElementById('current-status').innerHTML = `
        <div class="flex items-center space-x-3">
          <div class="w-3 h-3 rounded-full animate-pulse" style="background-color: ${color};"></div>
          <div>
            <div class="flex items-baseline space-x-2">
              <span class="text-3xl font-bold text-blue-600">${peopleCount}</span>
              <span class="text-lg text-gray-500">人</span>
              <span class="text-xl font-semibold" style="color: ${color};">（${status}）</span>
            </div>
            <p class="text-xs text-gray-500 mt-1">更新: ${formatted_time || '-'}</p>
          </div>
        </div>
      `;
      
      if (formatted_time) {
        // 時:分のみ抽出（例: "2024-10-27 13:00:00" -> "13:00"）
        const timeOnly = formatted_time.split(' ')[1]?.substring(0, 5) || formatted_time;
        document.getElementById('last-update').textContent = timeOnly;
      }
    }
  } catch (error) {
    console.error('ステータス取得エラー:', error);
    document.getElementById('current-status').innerHTML = `
      <span class="text-red-500">⚠️ ステータスを取得できませんでした</span>
    `;
  }
}

/**
 * レコード数を取得
 */
async function loadRecordCount() {
  try {
    const response = await fetch(`${API_BASE}/stats/count`);
    const result = await response.json();
    
    if (result.success && result.data) {
      document.getElementById('total-records').textContent = 
        result.data.count.toLocaleString();
    }
  } catch (error) {
    console.error('レコード数取得エラー:', error);
  }
}

/**
 * 時間帯別統計を取得・表示
 */
async function loadHourlyStats(date) {
  try {
    const response = await fetch(`${API_BASE}/stats/hourly?date=${date}`);
    const result = await response.json();
    
    if (result.success) {
      renderHourlyChart(result.data);
    }
  } catch (error) {
    console.error('時間帯別統計取得エラー:', error);
  }
}

/**
 * 週間時間別統計を取得・表示（過去7日間の各時刻の平均）
 */
async function loadWeeklyHourlyStats() {
  try {
    const response = await fetch(`${API_BASE}/stats/weekly-hourly?days=7`);
    const result = await response.json();
    
    if (result.success) {
      renderHourlyChart(result.data);
    }
  } catch (error) {
    console.error('週間時間別統計取得エラー:', error);
  }
}

/**
 * 時間帯別グラフを描画（人数ベース）
 */
function renderHourlyChart(dataArray) {
  const ctx = document.getElementById('hourly-chart').getContext('2d');
  
  // 0～23時のラベルを作成
  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  
  // データをマップに変換
  const dataMap = {};
  dataArray.forEach(d => {
    dataMap[d.hour] = d;
  });
  
  const datasets = [{
    label: '平均行列人数',
    data: hours.map(hour => dataMap[hour]?.avg_count || 0),
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
    borderWidth: 2,
    fill: false
  }];
  
  // 既存のグラフを破棄
  if (hourlyChart) {
    hourlyChart.destroy();
  }
  
  // 新しいグラフを作成
  hourlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: hours.map(h => `${h}:00`),
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: '時刻',
            font: { size: 11 }
          },
          ticks: { font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '行列人数',
            font: { size: 11 }
          },
          ticks: { font: { size: 10 } }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 11 }, padding: 8 }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          bodyFont: { size: 11 },
          titleFont: { size: 12 }
        }
      },
      layout: {
        padding: { top: 5, bottom: 5, left: 5, right: 5 }
      }
    }
  });
}

/**
 * ステータス変化履歴を取得・表示
 */
async function loadStatusHistory() {
  try {
    const response = await fetch(`${API_BASE}/status/history?limit=30`);
    const result = await response.json();
    
    if (result.success) {
      renderStatusHistory(result.data);
    }
  } catch (error) {
    console.error('履歴取得エラー:', error);
  }
}

/**
 * ステータス変化履歴を描画
 */
function renderStatusHistory(history) {
  const container = document.getElementById('status-history');
  
  if (!history || history.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-4">履歴データがありません</p>';
    return;
  }
  
  container.innerHTML = history.map((item, index) => {
    const color = statusColors[item.status] || statusColors['不明'];
    const isFirst = index === 0;
    const peopleCount = item.count !== undefined ? item.count : 0;
    const timeOnly = item.formatted_time.split(' ')[1]?.substring(0, 5) || item.formatted_time;
    
    return `
      <div class="px-1.5 py-0.5 rounded text-xs ${isFirst ? 'bg-blue-50 border-l-2 border-blue-500' : 'bg-gray-50'}">
        <span class="inline-block w-6">
          <div class="w-1.5 h-1.5 rounded-full inline-block" style="background-color: ${color};"></div>
        </span>
        <span class="inline-block w-12 font-bold text-blue-600">${peopleCount}</span>
        <span class="text-gray-400">${timeOnly}</span>
      </div>
    `;
  }).join('');
}

/**
 * 現在の行列状況を取得
 */
async function loadQueueStatus() {
  try {
    const response = await fetch(`${API_BASE}/queue/current`);
    const result = await response.json();
    
    const container = document.getElementById('current-queue');
    
    if (result.success && result.hasQueue && result.data) {
      const queue = result.data;
      const estimatedQueue = queue.estimated_queue || 0;
      const turnoverCount = queue.turnover_count || 0;
      
      container.innerHTML = `
        <div class="flex items-center justify-between">
          <div>
            <p class="text-amber-700 font-bold text-xs">🚶 行列発生中</p>
            <p class="text-gray-600 text-xs">
              入替<span class="font-bold">${turnoverCount}</span> / 
              待ち<span class="font-bold text-amber-600">${estimatedQueue}</span>人
            </p>
          </div>
          <div class="bg-amber-200 rounded-full p-2">
            <i class="fas fa-users text-amber-700 text-base"></i>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="flex items-center">
          <i class="fas fa-check-circle text-green-500 mr-1.5 text-sm"></i>
          <p class="text-gray-700 text-xs font-semibold">現在行列は発生していません</p>
        </div>
      `;
    }
  } catch (error) {
    console.error('行列状況取得エラー:', error);
  }
}

/**
 * 行列履歴を取得・表示
 */
async function loadQueueHistory() {
  try {
    const response = await fetch(`${API_BASE}/queue/history?limit=10`);
    const result = await response.json();
    
    if (result.success) {
      renderQueueHistory(result.data);
    }
  } catch (error) {
    console.error('行列履歴取得エラー:', error);
  }
}

/**
 * 行列履歴を描画
 */
function renderQueueHistory(history) {
  const container = document.getElementById('queue-history');
  
  if (!history || history.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-4">行列履歴データがありません</p>';
    return;
  }
  
  container.innerHTML = history.map((item, index) => {
    const isRecent = index === 0;
    const estimatedQueue = item.estimated_queue || 0;
    const turnoverCount = item.turnover_count || 0;
    const maxCount = item.max_count || 0;
    const duration = item.duration_minutes || 0;
    
    return `
      <div class="px-1.5 py-0.5 rounded text-xs ${isRecent ? 'bg-amber-50 border-l-2 border-amber-500' : 'bg-gray-50'}">
        <span class="inline-block w-8 text-gray-600">#${history.length - index}</span>
        <span class="inline-block w-10 text-red-600 font-bold">${maxCount}</span>
        <span class="inline-block w-10 text-blue-600 font-bold">${turnoverCount}</span>
        <span class="inline-block w-10 text-amber-600 font-bold">${estimatedQueue}</span>
        <span class="text-gray-400">${duration}m</span>
      </div>
    `;
  }).join('');
}

/**
 * 行列スタックを取得・表示
 */
async function loadQueueStacks() {
  try {
    const response = await fetch(`${API_BASE}/queue/stacks?days=7`);
    const result = await response.json();
    
    if (result.success) {
      renderQueueHeatmap(result.data);
    }
  } catch (error) {
    console.error('行列スタック取得エラー:', error);
  }
}

/**
 * 行列スタックをヒートマップとして描画
 * 横軸: 日付、縦軸: 時刻（0-23時）
 */
function renderQueueHeatmap(stacks) {
  const container = document.getElementById('queue-heatmap');
  
  if (!stacks || stacks.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-4">行列データがありません</p>';
    return;
  }
  
  // 日付一覧を取得（ユニークでソート済み）
  const dates = [...new Set(stacks.map(s => s.date))].sort();
  
  // 時刻は0-23時
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  // 日付×時刻のマップを作成
  const heatmapData = {};
  dates.forEach(date => {
    heatmapData[date] = {};
    hours.forEach(hour => {
      heatmapData[date][hour] = [];
    });
  });
  
  // スタックデータをマッピング（開始時刻の時のみに配置）
  stacks.forEach(stack => {
    const startHour = parseInt(stack.start_hour);
    
    // 開始時刻の時にのみデータを追加
    if (heatmapData[stack.date] && heatmapData[stack.date][startHour] !== undefined) {
      heatmapData[stack.date][startHour].push(stack);
    }
  });
  
  // ヒートマップを描画
  let html = '<div class="inline-block">';
  html += '<table class="border-collapse border border-gray-300 text-xs">';
  
  // ヘッダー（日付）
  html += '<thead><tr class="bg-gray-100">';
  html += '<th class="border border-gray-300 px-2 py-1 sticky left-0 bg-gray-100 z-10">時刻</th>';
  dates.forEach(date => {
    html += `<th class="border border-gray-300 px-3 py-1">${date}</th>`;
  });
  html += '</tr></thead>';
  
  // ボディ（時刻×日付）
  html += '<tbody>';
  hours.forEach(hour => {
    html += '<tr>';
    html += `<td class="border border-gray-300 px-2 py-1 text-center font-semibold sticky left-0 bg-white z-10">${String(hour).padStart(2, '0')}:00</td>`;
    
    dates.forEach(date => {
      const stacksInCell = heatmapData[date][hour];
      const cellContent = renderHeatmapCell(stacksInCell, hour);
      html += `<td class="border border-gray-300 px-1 py-1" style="min-width: 80px;">${cellContent}</td>`;
    });
    
    html += '</tr>';
  });
  html += '</tbody>';
  html += '</table>';
  html += '</div>';
  
  container.innerHTML = html;
}

/**
 * ヒートマップセルの内容を描画
 */
function renderHeatmapCell(stacksInCell, hour) {
  if (!stacksInCell || stacksInCell.length === 0) {
    return '<div class="h-6"></div>';
  }
  
  // この時刻に複数の行列がある場合、すべての最大人数を表示
  // 最大人数でソート（降順）
  const sortedStacks = stacksInCell.sort((a, b) => (b.max_count || 0) - (a.max_count || 0));
  
  // 最も大きい人数で背景色を決定
  const maxCount = sortedStacks[0].max_count || 0;
  const intensity = Math.min(maxCount / 8, 1); // 8人以上で最大強度
  const bgColor = `rgba(239, 68, 68, ${0.2 + intensity * 0.6})`; // 赤系
  
  // 複数の行列がある場合は縦に並べる
  const countItems = sortedStacks.map(stack => 
    `<span class="font-bold text-gray-800 text-xs">${stack.max_count || 0}</span>`
  ).join(' ');
  
  return `
    <div class="min-h-6 flex items-center justify-center rounded p-1" style="background-color: ${bgColor};">
      <div class="flex flex-wrap gap-1 items-center justify-center">
        ${countItems}
      </div>
    </div>
  `;
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', init);
