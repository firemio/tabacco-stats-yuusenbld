const API_BASE = '/api';

// グラフのインスタンス
let dailyChart = null;
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
    // Full HD固定表示モード
    body.style.overflow = 'hidden';
    appContainer.style.overflow = 'hidden';
    appContainer.style.height = '100vh';
    mainContent.className = 'flex-1 grid grid-cols-2 gap-4 overflow-hidden';
    leftColumn.className = 'flex flex-col space-y-3 overflow-y-auto';
    rightColumn.className = 'flex flex-col space-y-3';
    modeText.textContent = 'レスポンシブ';
    toggleBtn.querySelector('i').className = 'fas fa-desktop';
  } else {
    // レスポンシブモード（縦1カラム、全体スクロール）
    body.style.overflow = 'auto';
    appContainer.style.overflow = 'visible';
    appContainer.style.height = 'auto';
    mainContent.className = 'flex flex-col gap-4 pb-4';
    leftColumn.className = 'flex flex-col space-y-3';
    rightColumn.className = 'flex flex-col space-y-3';
    modeText.textContent = 'Full HD固定';
    toggleBtn.querySelector('i').className = 'fas fa-mobile-alt';
  }
  
  // グラフを再描画
  setTimeout(() => {
    if (dailyChart) dailyChart.resize();
    if (hourlyChart) hourlyChart.resize();
  }, 100);
}

/**
 * 初期化
 */
async function init() {
  await loadCurrentStatus();
  await loadRecordCount();
  await loadDailyStats();
  await loadQueueStatus();
  await loadQueueHistory();
  await loadStatusHistory();
  
  // 日付選択の初期値を今日に設定
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('hourly-date').value = today;
  await loadHourlyStats(today);
  
  // 日付変更イベント
  document.getElementById('hourly-date').addEventListener('change', (e) => {
    loadHourlyStats(e.target.value);
  });
  
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
    await loadDailyStats();
    await loadQueueStatus();
    await loadQueueHistory();
    await loadStatusHistory();
    
    const today = new Date().toISOString().split('T')[0];
    const selectedDate = document.getElementById('hourly-date').value;
    if (selectedDate === today) {
      await loadHourlyStats(selectedDate);
    }
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
 * 日別統計を取得・表示
 */
async function loadDailyStats() {
  try {
    const response = await fetch(`${API_BASE}/stats/daily?days=7`);
    const result = await response.json();
    
    if (result.success) {
      renderDailyChart(result.data);
    }
  } catch (error) {
    console.error('日別統計取得エラー:', error);
  }
}

/**
 * 日別グラフを描画（人数ベース）
 */
function renderDailyChart(data) {
  const ctx = document.getElementById('daily-chart').getContext('2d');
  
  // データを整形（人数ベース）
  const dates = data.map(d => d.date);
  
  const datasets = [{
    label: '平均人数',
    data: data.map(d => d.avg_count || 0),
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
    borderWidth: 2,
    type: 'line',
    fill: false
  }, {
    label: '最大人数',
    data: data.map(d => d.max_count || 0),
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
    borderWidth: 1,
    type: 'bar'
  }];
  
  // 既存のグラフを破棄
  if (dailyChart) {
    dailyChart.destroy();
  }
  
  // 新しいグラフを作成
  dailyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dates,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: '日付',
            font: { size: 11 }
          },
          ticks: { font: { size: 10 } }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '人数',
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
    label: '平均人数',
    data: hours.map(hour => dataMap[hour]?.avg_count || 0),
    backgroundColor: '#3b82f6',
    borderColor: '#2563eb',
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
            text: '人数',
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
    
    return `
      <div class="flex items-center justify-between p-2 rounded-lg ${isFirst ? 'bg-blue-50 border-l-4 border-blue-500' : 'bg-gray-50'}">
        <div class="flex items-center space-x-2">
          <div class="w-2 h-2 rounded-full" style="background-color: ${color};"></div>
          <span class="text-xl font-bold text-blue-600">${peopleCount}人</span>
          <span class="font-semibold text-base" style="color: ${color};">（${item.status}）</span>
          ${isFirst ? '<span class="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded">最新</span>' : ''}
        </div>
        <span class="text-xs text-gray-600">${item.formatted_time}</span>
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
            <p class="text-amber-700 font-bold text-base">🚶 現在行列発生中</p>
            <p class="text-gray-600 text-sm mt-1">
              入れ替わり: <span class="font-bold">${turnoverCount}回</span> / 
              待ち人数: <span class="font-bold text-lg text-amber-600">${estimatedQueue}人</span>
            </p>
          </div>
          <div class="bg-amber-200 rounded-full p-3">
            <i class="fas fa-users text-amber-700 text-2xl"></i>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="flex items-center">
          <i class="fas fa-check-circle text-green-500 mr-2 text-xl"></i>
          <p class="text-gray-700 text-sm font-semibold">現在行列は発生していません</p>
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
    const isRecent = index < 3;
    const estimatedQueue = item.estimated_queue || 0;
    const turnoverCount = item.turnover_count || 0;
    const duration = item.duration_minutes || 0;
    
    return `
      <div class="p-2 rounded-lg ${isRecent ? 'bg-amber-50 border-l-4 border-amber-500' : 'bg-gray-50'}">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center space-x-2">
            <i class="fas fa-users text-amber-600 text-sm"></i>
            <span class="font-semibold text-gray-800 text-sm">行列 #${history.length - index}</span>
            ${isRecent ? '<span class="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded">最近</span>' : ''}
          </div>
          <span class="text-xs text-gray-500">${duration}分</span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p class="text-gray-600">入替: <span class="font-bold text-blue-600">${turnoverCount}回</span></p>
          </div>
          <div>
            <p class="text-gray-600">待: <span class="font-bold text-amber-600">${estimatedQueue}人</span></p>
          </div>
        </div>
        <div class="mt-1 text-xs text-gray-500">
          ${item.start_formatted}
        </div>
      </div>
    `;
  }).join('');
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', init);
