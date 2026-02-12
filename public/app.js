const API_BASE = '/api';
let hourlyChart = null;
let isFullHDMode = true;

function toggleDisplayMode() {
  isFullHDMode = !isFullHDMode;
  const mainContent = document.getElementById('main-content');
  const appContainer = document.getElementById('app-container');
  const body = document.body;
  const modeText = document.getElementById('mode-text');
  const toggleBtn = document.getElementById('toggle-mode');
  
  if (isFullHDMode) {
    body.style.overflow = 'hidden';
    appContainer.style.overflow = 'hidden';
    appContainer.style.height = '100vh';
    mainContent.className = 'flex-1 grid gap-4 overflow-hidden';
    mainContent.style.gridTemplateColumns = '1fr 2fr';
    modeText.textContent = 'レスポンシブ';
    toggleBtn.querySelector('i').className = 'fas fa-desktop';
  } else {
    body.style.overflow = 'auto';
    appContainer.style.overflow = 'visible';
    appContainer.style.height = 'auto';
    mainContent.className = 'flex flex-col gap-4 pb-4';
    mainContent.style.gridTemplateColumns = '';
    modeText.textContent = 'Full HD固定';
    toggleBtn.querySelector('i').className = 'fas fa-mobile-alt';
  }
  
  setTimeout(() => {
    if (hourlyChart) hourlyChart.resize();
  }, 100);
}

async function init() {
  await loadDashboardData();
  await loadWeeklyHourlyStats();
  await loadQueueStacks();
  document.getElementById('toggle-mode').addEventListener('click', toggleDisplayMode);
  connectSSE();
}

function connectSSE() {
  const eventSource = new EventSource('/api/events');
  
  eventSource.onmessage = async (event) => {
    console.log('📨 ステータス更新イベント受信:', event.data);
    await loadDashboardData();
    await loadWeeklyHourlyStats();
    await loadQueueStacks();
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE接続エラー:', error);
    eventSource.close();
    setTimeout(() => {
      console.log('SSE再接続中...');
      connectSSE();
    }, 5000);
  };
  
  console.log('✅ SSE接続を確立しました');
}

async function loadDashboardData() {
  try {
    const response = await fetch(`${API_BASE}/dashboard/current`);
    const result = await response.json();
    
    if (result.success && result.data) {
      renderCurrentStatus(result.data);
      renderPrediction(result.data);
    }
  } catch (error) {
    console.error('ダッシュボードデータ取得エラー:', error);
  }
}

function renderCurrentStatus(data) {
  const { current, queue, average, comparison } = data;
  const container = document.getElementById('current-status');
  
  let statusColor = '#6b7280';
  if (current.status === '空き') statusColor = '#10b981';
  else if (current.status === 'やや混雑') statusColor = '#f59e0b';
  else if (current.status === '混雑') statusColor = '#ef4444';
  else if (current.status === '大変混雑') statusColor = '#dc2626';
  
  let percentageColor = '#6b7280';
  if (comparison.percentage <= 80) percentageColor = '#10b981';
  else if (comparison.percentage <= 120) percentageColor = '#f59e0b';
  else percentageColor = '#ef4444';
  
  let trendText = '→ 安定';
  let trendClass = 'text-gray-500';
  if (comparison.trend === 'rising') {
    trendText = '↑ 上昇中';
    trendClass = 'text-red-500';
  } else if (comparison.trend === 'falling') {
    trendText = '↓ 下降中';
    trendClass = 'text-green-500';
  }
  
  const timeOnly = current.formatted_time ? current.formatted_time.split(' ')[1]?.substring(0, 5) : '-';
  
  container.innerHTML = `
    <div class="w-full">
      <div class="flex items-end gap-4 mb-3">
        <span class="text-6xl font-bold text-blue-600">${current.count}</span>
        <span class="text-2xl text-gray-400 mb-2">人</span>
        <span class="text-xl font-semibold px-3 py-1 rounded-full mb-2" style="background-color: ${statusColor}20; color: ${statusColor};">
          ${current.status}
        </span>
      </div>
      
      <div class="bg-slate-50 rounded-xl p-4 mb-3">
        <div class="flex items-center justify-between mb-2">
          <span class="text-gray-600">平均（この時刻）</span>
          <span class="text-xl font-bold text-slate-700">${average.count}人</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-4 mb-2">
          <div class="h-4 rounded-full transition-all duration-500" style="width: ${Math.min(comparison.percentage, 100)}%; background-color: ${percentageColor};"></div>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="${trendClass} font-semibold">${trendText}</span>
          <span class="font-bold" style="color: ${percentageColor};">${comparison.percentage}%</span>
        </div>
      </div>
      
      ${queue.total > 0 ? `
      <div class="bg-orange-50 rounded-xl p-4 mb-3 border-l-4 border-orange-500">
        <div class="text-sm text-gray-600 mb-2">行列状況</div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-gray-600">処理済み</span>
          <span class="text-xl font-bold text-green-600">${queue.processed}人</span>
        </div>
        <div class="flex items-center justify-between mb-2">
          <span class="text-gray-600">残り</span>
          <span class="text-xl font-bold text-orange-600">${queue.remaining}人</span>
        </div>
        <div class="w-full bg-gray-200 rounded-full h-3">
          <div class="h-3 rounded-full bg-orange-500 transition-all duration-500" style="width: ${queue.total > 0 ? Math.round((queue.processed / queue.total) * 100) : 0}%;"></div>
        </div>
      </div>
      ` : ''}
      
      <p class="text-sm text-gray-400">更新: ${timeOnly}</p>
    </div>
  `;
}

function renderPrediction(data) {
  const { prediction, queue } = data;
  const container = document.getElementById('prediction-info');
  
  if (!prediction.has_queue) {
    container.innerHTML = `
      <div class="text-center py-4">
        <div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-3">
          <i class="fas fa-check text-green-500 text-2xl"></i>
        </div>
        <p class="text-lg font-semibold text-gray-700">現在行列はありません</p>
        <p class="text-sm text-gray-500">すぐに利用できます</p>
      </div>
    `;
    return;
  }
  
  let minutes = prediction.estimated_minutes;
  let timeText = '';
  if (minutes < 1) {
    timeText = '1分以内';
  } else if (minutes < 60) {
    timeText = `約${minutes}分`;
  } else {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    timeText = mins > 0 ? `約${hours}時間${mins}分` : `約${hours}時間`;
  }
  
  container.innerHTML = `
    <div class="text-center py-4">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-3">
        <i class="fas fa-clock text-orange-500 text-2xl"></i>
      </div>
      <p class="text-lg font-semibold text-gray-700 mb-1">残り人数がゼロになるまで</p>
      <p class="text-4xl font-bold text-orange-600 mb-2">${timeText}</p>
      <p class="text-sm text-gray-500">(${queue.remaining}人残り / 3分で1人処理と計算)</p>
    </div>
  `;
}

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

function renderHourlyChart(dataArray) {
  const ctx = document.getElementById('hourly-chart').getContext('2d');
  
  if (hourlyChart) {
    hourlyChart.destroy();
  }
  
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
            text: 'データがありません',
            font: { size: 14 },
            color: '#9ca3af'
          }
        }
      }
    });
    return;
  }
  
  const labels = dataArray.map(d => `${d.hour}:00`);
  const avgCount = dataArray.map(d => Math.round(d.avg_count || 0));
  const avgQueue = dataArray.map(d => Math.round(d.avg_estimated_queue || 0));
  
  hourlyChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: '平均人数',
        data: avgCount,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        yAxisID: 'y'
      }, {
        label: '平均行列',
        data: avgQueue,
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        yAxisID: 'y'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          title: {
            display: true,
            text: '時刻',
            font: { size: 12 }
          },
          ticks: { font: { size: 10 }, maxRotation: 45, minRotation: 45 }
        },
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: '人数',
            font: { size: 12 }
          },
          ticks: { font: { size: 10 } }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { font: { size: 11 }, padding: 12 }
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          bodyFont: { size: 11 },
          titleFont: { size: 12 }
        }
      }
    }
  });
}

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

function renderQueueHeatmap(stacks) {
  const container = document.getElementById('queue-heatmap');
  
  if (!stacks || stacks.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center py-4">行列データがありません</p>';
    return;
  }
  
  const dates = [...new Set(stacks.map(s => s.date))].sort();
  const timeSlots = [
    '09:00', '09:10', '09:20', '09:30', '09:40', '09:50',
    '10:00', '10:10', '10:20', '10:30', '10:40', '10:50',
    '11:00', '11:10', '11:20', '11:30', '11:40', '11:50',
    '12:00', '12:10', '12:20', '12:30', '12:40', '12:50',
    '13:00', '13:10', '13:20', '13:30', '13:40', '13:50',
    '14:00', '14:10', '14:20', '14:30', '14:40', '14:50',
    '15:00', '15:10', '15:20', '15:30', '15:40', '15:50',
    '16:00', '16:10', '16:20', '16:30', '16:40', '16:50',
    '17:00', '17:10', '17:20', '17:30', '17:40', '17:50',
    '18:00', '18:10', '18:20', '18:30', '18:40', '18:50',
    '19:00', '19:10', '19:20', '19:30', '19:40', '19:50',
    '20:00', '20:10', '20:20', '20:30', '20:40', '20:50',
    '21:00', '21:10', '21:20', '21:30', '21:40', '21:50',
    '22:00', '22:10', '22:20', '22:30', '22:40', '22:50'
  ];
  
  const heatmapData = {};
  dates.forEach(date => {
    heatmapData[date] = {};
    timeSlots.forEach(slot => {
      heatmapData[date][slot] = [];
    });
  });
  
  stacks.forEach(stack => {
    if (heatmapData[stack.date] && heatmapData[stack.date][stack.time_slot] !== undefined) {
      heatmapData[stack.date][stack.time_slot].push(stack);
    }
  });
  
  const slotTotals = {};
  timeSlots.forEach(slot => {
    slotTotals[slot] = { sum: 0, count: 0 };
  });
  
  dates.forEach(date => {
    timeSlots.forEach(slot => {
      const stacksInCell = heatmapData[date][slot];
      if (stacksInCell.length > 0) {
        const cellTotal = stacksInCell.reduce((sum, s) => sum + (s.estimated_queue || 0), 0);
        slotTotals[slot].sum += cellTotal;
        slotTotals[slot].count++;
      }
    });
  });
  
  const cellWidth = `clamp(28px, 2.5vw, 40px)`;
  const cellHeight = `clamp(16px, 1.8vh, 24px)`;
  
  let html = '<table class="border-collapse border border-gray-300" style="font-size: clamp(9px, 1.1vh, 13px); table-layout: fixed;">';
  
  html += '<thead><tr class="bg-slate-100">';
  html += '<th class="border border-gray-300 px-0.5 py-0.5 sticky left-0 bg-slate-100 z-10">時刻</th>';
  dates.forEach(date => {
    html += `<th class="border border-gray-300 px-0.5 py-0.5">${date}</th>`;
  });
  html += '<th class="border border-gray-300 px-0.5 py-0.5 bg-blue-50">平均</th>';
  html += '</tr></thead>';
  
  html += '<tbody>';
  timeSlots.forEach(slot => {
    html += '<tr>';
    html += `<td class="border border-gray-300 px-0.5 py-0.5 text-center font-semibold sticky left-0 bg-white z-10">${slot}</td>`;
    
    dates.forEach(date => {
      const stacksInCell = heatmapData[date][slot];
      const cellContent = renderHeatmapCell(stacksInCell);
      html += `<td class="border border-gray-300 px-0.5 py-0.5" style="width: ${cellWidth}; height: ${cellHeight};">${cellContent}</td>`;
    });
    
    const slotData = slotTotals[slot];
    if (slotData.count > 0) {
      const avg = Math.round(slotData.sum / slotData.count);
      const intensity = Math.min(avg / 20, 1);
      const bgColor = `rgba(59, 130, 246, ${0.2 + intensity * 0.5})`;
      html += `<td class="border border-gray-300 px-0.5 py-0.5 text-center font-bold" style="background-color: ${bgColor}; width: ${cellWidth}; height: ${cellHeight};">${avg}</td>`;
    } else {
      html += `<td class="border border-gray-300 px-0.5 py-0.5" style="width: ${cellWidth}; height: ${cellHeight};"></td>`;
    }
    
    html += '</tr>';
  });
  html += '</tbody>';
  html += '</table>';
  
  container.innerHTML = html;
}

function renderHeatmapCell(stacksInCell) {
  if (!stacksInCell || stacksInCell.length === 0) {
    return '<div class="h-3"></div>';
  }
  
  const totalQueue = stacksInCell.reduce((sum, s) => sum + (s.estimated_queue || 0), 0);
  const maxQueue = Math.max(...stacksInCell.map(s => s.estimated_queue || 0));
  const intensity = Math.min(maxQueue / 20, 1);
  const bgColor = `rgba(249, 115, 22, ${0.15 + intensity * 0.5})`;
  
  return `
    <div class="h-3 flex items-center justify-center rounded" style="background-color: ${bgColor};">
      <span class="font-bold text-gray-800" style="font-size: 9px;">${totalQueue}</span>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', init);
