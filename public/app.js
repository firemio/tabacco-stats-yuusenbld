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
 * 行列が存在する時刻のみ表示（0埋めなし）
 */
function renderHourlyChart(dataArray) {
  const ctx = document.getElementById('hourly-chart').getContext('2d');
  
  // 既存のグラフを破棄
  if (hourlyChart) {
    hourlyChart.destroy();
  }
  
  // データが存在しない場合
  if (!dataArray || dataArray.length === 0) {
    hourlyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: []
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: '行列データがありません',
            font: { size: 14 },
            color: '#9ca3af'
          }
        }
      }
    });
    return;
  }
  
  // データが存在する時刻のみ抽出
  const labels = dataArray.map(d => `${d.hour}:00`);
  const totalMinutes = dataArray.map(d => d.total_minutes || 0);
  
  const datasets = [{
    label: '行列の長さ（合計分）',
    data: totalMinutes,
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
    borderWidth: 2,
    fill: false,
    yAxisID: 'y'
  }];
  
  // 新しいグラフを作成
  hourlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
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
            text: '行列時間（分）',
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
          titleFont: { size: 12 },
          callbacks: {
            afterBody: function(context) {
              if (context && context.length > 0) {
                const dataIndex = context[0].dataIndex;
                const data = dataArray[dataIndex];
                return [
                  `平均継続: ${Math.floor(data.avg_duration)}分`,
                  `イベント数: ${data.record_count}件`,
                  `平均入替: ${data.avg_turnover.toFixed(1)}回`,
                  `平均待ち: ${Math.floor(data.avg_estimated_queue || 0)}人`
                ];
              }
              return [];
            }
          }
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
      const turnoverCount = queue.turnover_count || 0;
      const estimatedQueue = queue.estimated_queue || 0;
      
      container.innerHTML = `
        <div class="flex items-center justify-between">
          <div>
            <p class="text-amber-700 font-bold text-xs">🚶 行列発生中</p>
            <p class="text-gray-600 text-xs">
              入替<span class="font-bold">${turnoverCount}</span>回 / 
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
    const turnoverCount = item.turnover_count || 0;
    const estimatedQueue = item.estimated_queue || 0;
    const maxCount = item.max_count || 0;
    const duration = item.duration_minutes || 0;
    
    return `
      <div class="px-1.5 py-0.5 rounded text-xs ${isRecent ? 'bg-amber-50 border-l-2 border-amber-500' : 'bg-gray-50'}">
        <span class="inline-block w-8 text-gray-600">#${history.length - index}</span>
        <span class="inline-block w-12 text-red-600 font-bold">${maxCount}人</span>
        <span class="inline-block w-12 text-blue-600 font-bold">${turnoverCount}回</span>
        <span class="inline-block w-12 text-amber-600 font-bold">${estimatedQueue}人</span>
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
  
  // 時刻は7-23時（営業時間帯）
  const hours = Array.from({ length: 17 }, (_, i) => i + 7);
  
  // 日付×時刻のマップを作成
  const heatmapData = {};
  dates.forEach(date => {
    heatmapData[date] = {};
    hours.forEach(hour => {
      heatmapData[date][hour] = [];
    });
  });
  
  // スタックデータをマッピング（行列が存在していた各時刻に配置）
  stacks.forEach(stack => {
    const hour = parseInt(stack.start_hour); // start_hourは「その時刻」を表す
    
    // 行列が存在していた時刻にデータを追加
    if (heatmapData[stack.date] && heatmapData[stack.date][hour] !== undefined) {
      heatmapData[stack.date][hour].push(stack);
    }
  });
  
  // 時間帯ごとの平均を計算するための集計
  const hourlyTotals = {};
  hours.forEach(hour => {
    hourlyTotals[hour] = { totals: [], sum: 0, count: 0 };
  });
  
  // 各日の各時間帯の合計を計算
  dates.forEach(date => {
    hours.forEach(hour => {
      const stacksInCell = heatmapData[date][hour];
      // 開始時刻のセルのみ集計（継続セルは除外）
      const startingStacks = stacksInCell.filter(s => hour === parseInt(s.original_start_hour));
      if (startingStacks.length > 0) {
        const cellTotal = startingStacks.reduce((sum, s) => sum + (s.turnover_count || 0), 0);
        hourlyTotals[hour].totals.push(cellTotal);
        hourlyTotals[hour].sum += cellTotal;
        hourlyTotals[hour].count++;
      }
    });
  });
  
  // ヒートマップを描画
  let html = '<div class="inline-block">';
  html += '<table class="border-collapse border border-gray-300 text-xs">';
  
  // ヘッダー（日付 + 平均列）
  html += '<thead><tr class="bg-gray-100">';
  html += '<th class="border border-gray-300 px-2 py-1 sticky left-0 bg-gray-100 z-10">時刻</th>';
  dates.forEach(date => {
    html += `<th class="border border-gray-300 px-3 py-1">${date}</th>`;
  });
  html += '<th class="border border-gray-300 px-3 py-1 bg-blue-50">平均</th>';
  html += '</tr></thead>';
  
  // ボディ（時刻×日付 + 平均列）
  html += '<tbody>';
  hours.forEach(hour => {
    html += '<tr>';
    html += `<td class="border border-gray-300 px-2 py-1 text-center font-semibold sticky left-0 bg-white z-10">${String(hour).padStart(2, '0')}:00</td>`;
    
    dates.forEach(date => {
      const stacksInCell = heatmapData[date][hour];
      const cellContent = renderHeatmapCell(stacksInCell, hour);
      html += `<td class="border border-gray-300 px-1 py-1" style="min-width: 80px;">${cellContent}</td>`;
    });
    
    // 平均列
    const hourData = hourlyTotals[hour];
    if (hourData.count > 0) {
      const avg = Math.round(hourData.sum / hourData.count);
      const intensity = Math.min(avg / 50, 1);
      const bgColor = `rgba(59, 130, 246, ${0.2 + intensity * 0.5})`; // 青系
      html += `<td class="border border-gray-300 px-2 py-1 text-center font-bold" style="background-color: ${bgColor};">${avg}</td>`;
    } else {
      html += '<td class="border border-gray-300 px-2 py-1"></td>';
    }
    
    html += '</tr>';
  });
  html += '</tbody>';
  html += '</table>';
  html += '</div>';
  
  container.innerHTML = html;
}

/**
 * ヒートマップセルの内容を描画
 * 行列が継続している場合は視覚的に表現
 */
function renderHeatmapCell(stacksInCell, hour) {
  if (!stacksInCell || stacksInCell.length === 0) {
    return '<div class="h-6"></div>';
  }
  
  // IDでグループ化（同じ行列イベントをまとめる）
  const groupedById = {};
  stacksInCell.forEach(stack => {
    if (!groupedById[stack.id]) {
      groupedById[stack.id] = [];
    }
    groupedById[stack.id].push(stack);
  });
  
  // 入れ替え回数でソート（降順）- 混雑度の指標として
  const sortedStacks = Object.values(groupedById)
    .map(group => group[0]) // 各グループの代表
    .sort((a, b) => (b.turnover_count || 0) - (a.turnover_count || 0));
  
  // 最も多い入れ替え回数で背景色を決定（混雑度の指標）
  const maxTurnover = sortedStacks[0].turnover_count || 0;
  const intensity = Math.min(maxTurnover / 50, 1); // 50回以上で最大強度
  const bgColor = `rgba(239, 68, 68, ${0.2 + intensity * 0.6})`; // 赤系
  
  // 開始セルのみ入れ替え回数を収集
  const startingStacks = sortedStacks.filter(stack => hour === parseInt(stack.original_start_hour));
  const turnovers = startingStacks.map(stack => stack.turnover_count || 0);
  const total = turnovers.reduce((a, b) => a + b, 0);
  
  // 各行列について、開始/継続/終了を判定して表示
  const countItems = sortedStacks.map(stack => {
    const originalStartHour = parseInt(stack.original_start_hour); // 行列の開始時刻
    const originalEndHour = parseInt(stack.original_end_hour); // 行列の終了時刻
    
    // 開始時刻：入れ替え回数を表示
    if (hour === originalStartHour) {
      const turnoverCount = stack.turnover_count || 0;
      return `<span class="font-bold text-gray-800 text-xs">${turnoverCount}</span>`;
    }
    // 終了時刻：継続マーク（終了）
    else if (hour === originalEndHour) {
      return `<span class="text-gray-400 text-xs">↑</span>`;
    }
    // 中間時刻：継続マーク
    else {
      return `<span class="text-gray-400 text-xs">│</span>`;
    }
  }).join(' ');
  
  // 開始セルがある場合のみ合計を表示
  const summaryLine = startingStacks.length > 0 
    ? `<div class="text-xs text-blue-600 font-bold mt-0.5">計${total}</div>`
    : '';
  
  return `
    <div class="min-h-6 flex flex-col items-center justify-center rounded p-1" style="background-color: ${bgColor};">
      <div class="flex flex-wrap gap-1 items-center justify-center">
        ${countItems}
      </div>
      ${summaryLine}
    </div>
  `;
}

// ページ読み込み時に初期化
document.addEventListener('DOMContentLoaded', init);
