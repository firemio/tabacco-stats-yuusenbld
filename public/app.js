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
        <div class="flex items-center space-x-4">
          <div class="w-4 h-4 rounded-full animate-pulse" style="background-color: ${color};"></div>
          <div>
            <div class="flex items-baseline space-x-2">
              <span class="text-4xl font-bold text-blue-600">${peopleCount}</span>
              <span class="text-xl text-gray-500">人</span>
              <span class="text-2xl font-semibold" style="color: ${color};">（${status}）</span>
            </div>
            <p class="text-sm text-gray-500 mt-1">更新: ${formatted_time || '-'}</p>
          </div>
        </div>
      `;
      
      if (formatted_time) {
        document.getElementById('last-update').textContent = formatted_time;
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
            text: '日付'
          }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '人数'
          }
        }
      },
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
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
            text: '時刻'
          }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '人数'
          }
        }
      },
      plugins: {
        legend: {
          position: 'top'
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      }
    }
  });
}

/**
 * ステータス変化履歴を取得・表示
 */
async function loadStatusHistory() {
  try {
    const response = await fetch(`${API_BASE}/status/history?limit=50`);
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
      <div class="flex items-center justify-between p-3 rounded-lg ${isFirst ? 'bg-blue-50 border-l-4 border-blue-500' : 'bg-gray-50'}">
        <div class="flex items-center space-x-3">
          <div class="w-3 h-3 rounded-full" style="background-color: ${color};"></div>
          <span class="text-2xl font-bold text-blue-600">${peopleCount}人</span>
          <span class="font-semibold text-lg" style="color: ${color};">（${item.status}）</span>
          ${isFirst ? '<span class="text-xs bg-blue-500 text-white px-2 py-1 rounded">最新</span>' : ''}
        </div>
        <span class="text-sm text-gray-600">${item.formatted_time}</span>
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
            <p class="text-amber-700 font-bold text-xl">🚶 現在行列発生中</p>
            <p class="text-gray-600 mt-2">
              入れ替わり回数: <span class="font-bold text-lg">${turnoverCount}回</span>
            </p>
            <p class="text-gray-600">
              推定待ち人数: <span class="font-bold text-2xl text-amber-600">${estimatedQueue}人</span>
            </p>
          </div>
          <div class="bg-amber-200 rounded-full p-4">
            <i class="fas fa-users text-amber-700 text-3xl"></i>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="flex items-center">
          <i class="fas fa-check-circle text-green-500 mr-3 text-2xl"></i>
          <p class="text-gray-700 font-semibold">現在行列は発生していません</p>
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
    const response = await fetch(`${API_BASE}/queue/history?limit=20`);
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
      <div class="p-4 rounded-lg ${isRecent ? 'bg-amber-50 border-l-4 border-amber-500' : 'bg-gray-50'}">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center space-x-3">
            <i class="fas fa-users text-amber-600"></i>
            <span class="font-semibold text-gray-800">行列イベント #${history.length - index}</span>
            ${isRecent ? '<span class="text-xs bg-amber-500 text-white px-2 py-1 rounded">最近</span>' : ''}
          </div>
          <span class="text-sm text-gray-500">${duration}分間</span>
        </div>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p class="text-gray-600">入れ替わり回数</p>
            <p class="font-bold text-lg text-blue-600">${turnoverCount}回</p>
          </div>
          <div>
            <p class="text-gray-600">推定待ち人数</p>
            <p class="font-bold text-lg text-amber-600">${estimatedQueue}人</p>
          </div>
        </div>
        <div class="mt-2 text-xs text-gray-500">
          ${item.start_formatted} 〜 ${item.end_formatted}
        </div>
      </div>
    `;
  }).join('');
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', init);
