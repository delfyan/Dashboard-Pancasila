/* ===================================================
   EduSpatial Dashboard — script.js
   =================================================== */

'use strict';

// ---- Global State ----
let DATA = null;
let filteredData = [];
let currentSection = 'overview';
let currentSort = { col: 'indeks_pendidikan', dir: 'desc' };
let currentPage = 1;
const PAGE_SIZE = 10;
let currentLayer = 'indeks';
let mapMarkers = [];
let leafletMap = null;

// Chart instances
const charts = {};

// ---- DOM ready ----
document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  initTheme();
  initSidebar();
  initNavigation();
  initFilters();
  renderAll();
  initAOS();
  setTimeout(hideLoader, 2400);
});

// ===================================================
// DATA LOADING
// ===================================================
async function loadData() {
  try {
    const res = await fetch('data.json');
    DATA = await res.json();
    filteredData = [...DATA.kabupaten];
  } catch (e) {
    console.warn('Could not fetch data.json, using inline fallback.');
    DATA = FALLBACK_DATA;
    filteredData = [...DATA.kabupaten];
  }
}

// ===================================================
// RENDER ALL
// ===================================================
function renderAll() {
  renderKPIs();
  renderInsight();
  renderCharts();
  renderSpasialStats();
  renderPCALoadings();
  renderTable();
  initMap();
}

// ===================================================
// THEME
// ===================================================
function initTheme() {
  const saved = localStorage.getItem('edu-theme') || 'dark';
  setTheme(saved);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    setTheme(cur === 'dark' ? 'light' : 'dark');
  });
}

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('edu-theme', t);
  const btn = document.getElementById('theme-toggle');
  if (t === 'light') btn.classList.add('active'); else btn.classList.remove('active');
  // Refresh charts to pick up new colors
  if (DATA) setTimeout(refreshChartColors, 50);
}

function getCSSVar(v) {
  return getComputedStyle(document.documentElement).getPropertyValue(v).trim();
}

// ===================================================
// SIDEBAR & NAVIGATION
// ===================================================
function initSidebar() {
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const closeBtn = document.getElementById('sidebar-close');

  hamburger.addEventListener('click', () => {
    sidebar.classList.add('open');
    overlay.classList.add('active');
  });
  [overlay, closeBtn].forEach(el => el.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  }));
}

function initNavigation() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const section = item.dataset.section;
      navigateTo(section);
      // close sidebar on mobile
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('active');
    });
  });
}

function navigateTo(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(section).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`[data-section="${section}"]`).classList.add('active');
  currentSection = section;
  if (section === 'peta') setTimeout(() => { if (leafletMap) leafletMap.invalidateSize(); }, 100);
  initAOS();
}

// ===================================================
// FILTERS
// ===================================================
function initFilters() {
  document.getElementById('filter-cluster').addEventListener('change', applyFilters);
  document.getElementById('filter-tahun').addEventListener('change', () => {
    applyFilters();
    renderTrenChart(); // update tren based on year
  });
  document.getElementById('global-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    if (q) {
      document.getElementById('table-search').value = q;
    }
    applyFilters();
    navigateTo('data');
  });
  document.getElementById('table-search').addEventListener('input', () => {
    applyFilters();
    currentPage = 1;
    renderTable();
  });
  document.getElementById('btn-download-csv').addEventListener('click', downloadCSV);
  document.getElementById('btn-table-csv').addEventListener('click', downloadCSV);

  document.querySelectorAll('.btn-export-chart').forEach(btn => {
    btn.addEventListener('click', () => exportChart(btn.dataset.chart));
  });

  document.querySelectorAll('input[name="map-layer"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentLayer = e.target.value;
      updateMapColors();
    });
  });
}

function applyFilters() {
  const cluster = document.getElementById('filter-cluster').value;
  const search = document.getElementById('table-search').value.toLowerCase();
  filteredData = DATA.kabupaten.filter(d => {
    const matchCluster = cluster === 'all' || d.cluster_label === cluster;
    const matchSearch = !search || d.nama.toLowerCase().includes(search);
    return matchCluster && matchSearch;
  });
  currentPage = 1;
  renderTable();
  refreshBarChart();
}

// ===================================================
// KPI CARDS
// ===================================================
function renderKPIs() {
  const kab = DATA.kabupaten;
  const avg = (kab.reduce((s, d) => s + d.indeks_pendidikan, 0) / kab.length).toFixed(1);
  const best = kab.reduce((a, b) => a.indeks_pendidikan > b.indeks_pendidikan ? a : b);
  const worst = kab.reduce((a, b) => a.indeks_pendidikan < b.indeks_pendidikan ? a : b);
  const ss = DATA.statistik_spasial;

  animateCounter('kpi-avg', avg, 1);
  document.getElementById('kpi-best').textContent = best.nama;
  document.getElementById('kpi-best-val').textContent = `Indeks: ${best.indeks_pendidikan}`;
  document.getElementById('kpi-worst').textContent = worst.nama;
  document.getElementById('kpi-worst-val').textContent = `Indeks: ${worst.indeks_pendidikan}`;
  animateCounter('kpi-morans', ss.morans_i, 4);
  document.getElementById('kpi-pvalue').textContent = ss.p_value < 0.001 ? '< 0.001' : ss.p_value;

  document.getElementById('sd-morans').textContent = ss.morans_i.toFixed(4);
  document.getElementById('sd-zscore').textContent = ss.z_score.toFixed(4);
  document.getElementById('sd-pvalue').textContent = ss.p_value < 0.001 ? '< 0.001' : ss.p_value.toFixed(4);
  document.getElementById('sd-expected').textContent = ss.expected_i.toFixed(4);
}

function animateCounter(id, target, decimals = 0) {
  const el = document.getElementById(id);
  if (!el) return;
  const start = 0; const dur = 1200;
  const startTime = performance.now();
  const step = (now) => {
    const p = Math.min((now - startTime) / dur, 1);
    const val = start + (target - start) * easeOut(p);
    el.textContent = val.toFixed(decimals);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

// ===================================================
// INSIGHT BANNERS
// ===================================================
function renderInsight() {
  const ss = DATA.statistik_spasial;
  document.getElementById('insight-text').textContent = ss.interpretasi;
  document.getElementById('spasial-text').textContent =
    `Moran's I = ${ss.morans_i} (Z = ${ss.z_score}, p ${ss.p_value < 0.001 ? '< 0.001' : '= ' + ss.p_value}). ` +
    `Nilai I yang positif dan signifikan mengkonfirmasi adanya autokorelasi spasial positif — wilayah dengan indeks pendidikan tinggi cenderung bertetangga dengan wilayah berkualitas tinggi pula, membentuk klaster spasial yang khas.`;
}

// ===================================================
// CHART UTILITIES
// ===================================================
function chartDefaults() {
  return {
    color: getCSSVar('--text-secondary'),
    gridColor: getCSSVar('--border'),
    fontFamily: 'Inter, sans-serif',
  };
}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// ===================================================
// RENDER ALL CHARTS
// ===================================================
function renderCharts() {
  renderRankingChart();
  renderClusterChart();
  renderTrenChart();
  renderRadarChart();
  renderMoranChart();
  renderHeatmapChart();
  renderPCAVarChart();
  renderPCACumChart();
}

function refreshChartColors() {
  renderCharts();
}

// ---- Bar Chart: Ranking ----
function renderRankingChart() {
  destroyChart('chart-ranking');
  const sorted = [...DATA.kabupaten].sort((a,b) => b.indeks_pendidikan - a.indeks_pendidikan).slice(0, 15);
  const ctx = document.getElementById('chart-ranking').getContext('2d');
  const { gridColor, fontFamily } = chartDefaults();
  charts['chart-ranking'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(d => d.nama.replace('Kab. ','').replace('Kota ','')),
      datasets: [{
        label: 'Indeks Pendidikan',
        data: sorted.map(d => d.indeks_pendidikan),
        backgroundColor: sorted.map((d, i) => {
          const p = 1 - i / sorted.length;
          return `rgba(0, ${Math.round(160 + 52*p)}, ${Math.round(200 + 55*p)}, ${0.5 + 0.5*p})`;
        }),
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 800 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` Indeks: ${ctx.parsed.y}`,
            afterLabel: ctx => {
              const d = sorted[ctx.dataIndex];
              return ` Cluster: ${d.cluster}`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: getCSSVar('--text-secondary'), font: { family: fontFamily, size: 10 }, maxRotation: 40 }, grid: { color: gridColor } },
        y: { ticks: { color: getCSSVar('--text-secondary'), font: { family: fontFamily } }, grid: { color: gridColor }, beginAtZero: false, min: 40 }
      }
    }
  });
}

function refreshBarChart() {
  destroyChart('chart-ranking');
  const sorted = [...filteredData].sort((a,b) => b.indeks_pendidikan - a.indeks_pendidikan).slice(0, 15);
  const ctx = document.getElementById('chart-ranking').getContext('2d');
  const { gridColor, fontFamily } = chartDefaults();
  charts['chart-ranking'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(d => d.nama.replace('Kab. ','').replace('Kota ','')),
      datasets: [{
        label: 'Indeks Pendidikan',
        data: sorted.map(d => d.indeks_pendidikan),
        backgroundColor: sorted.map((_, i) => {
          const p = 1 - i / sorted.length;
          return `rgba(0, ${Math.round(160 + 52*p)}, ${Math.round(200 + 55*p)}, ${0.5 + 0.5*p})`;
        }),
        borderRadius: 6, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: getCSSVar('--text-secondary'), font: { family: fontFamily, size: 10 }, maxRotation: 40 }, grid: { color: gridColor } },
        y: { ticks: { color: getCSSVar('--text-secondary'), font: { family: fontFamily } }, grid: { color: gridColor }, beginAtZero: false, min: 40 }
      }
    }
  });
}

// ---- Pie/Doughnut: Cluster ----
function renderClusterChart() {
  destroyChart('chart-cluster');
  const counts = { HH: 0, HL: 0, LH: 0, LL: 0 };
  DATA.kabupaten.forEach(d => { if (counts[d.cluster_label] !== undefined) counts[d.cluster_label]++; });
  const ctx = document.getElementById('chart-cluster').getContext('2d');
  charts['chart-cluster'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['High-High (HH)', 'High-Low (HL)', 'Low-High (LH)', 'Low-Low (LL)'],
      datasets: [{
        data: [counts.HH, counts.HL, counts.LH, counts.LL],
        backgroundColor: ['#10b981','#f59e0b','#3b82f6','#ef4444'],
        borderWidth: 2, borderColor: getCSSVar('--bg-card'),
        hoverOffset: 8,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      cutout: '62%',
      animation: { animateRotate: true, duration: 900 },
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: getCSSVar('--text-secondary'), font: { family: 'Inter', size: 11 }, padding: 12 }
        },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed} kab/kota` } }
      }
    }
  });
}

// ---- Line Chart: Trend ----
function renderTrenChart() {
  destroyChart('chart-tren');
  const tr = DATA.tren_tahunan;
  const { gridColor, fontFamily } = chartDefaults();
  const ctx = document.getElementById('chart-tren').getContext('2d');
  charts['chart-tren'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: tr.tahun,
      datasets: [{
        label: 'Rata-rata Indeks Pendidikan',
        data: tr.rata_indeks,
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0,212,255,0.08)',
        tension: 0.45,
        pointBackgroundColor: '#00d4ff',
        pointRadius: 5, pointHoverRadius: 8,
        fill: true,
      }, {
        label: 'Ketimpangan (Gini × 100)',
        data: tr.ketimpangan_gini.map(v => v * 100),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.06)',
        tension: 0.45,
        pointBackgroundColor: '#ef4444',
        pointRadius: 4, pointHoverRadius: 7,
        fill: true,
        borderDash: [4, 3],
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 800 },
      plugins: {
        legend: { labels: { color: getCSSVar('--text-secondary'), font: { family: fontFamily, size: 11 } } }
      },
      scales: {
        x: { ticks: { color: getCSSVar('--text-secondary'), font: { family: fontFamily } }, grid: { color: gridColor } },
        y: { ticks: { color: getCSSVar('--text-secondary'), font: { family: fontFamily } }, grid: { color: gridColor } }
      }
    }
  });
}

// ---- Radar Chart ----
function renderRadarChart() {
  destroyChart('chart-radar');
  const kab = DATA.kabupaten;
  const avg = (k) => (kab.reduce((s, d) => s + d[k], 0) / kab.length).toFixed(1);
  const best = kab.reduce((a, b) => a.indeks_pendidikan > b.indeks_pendidikan ? a : b);
  const worst = kab.reduce((a, b) => a.indeks_pendidikan < b.indeks_pendidikan ? a : b);
  const ctx = document.getElementById('chart-radar').getContext('2d');
  charts['chart-radar'] = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['APS', 'RLS (×10)', 'Melek Huruf', 'APK SMA', 'Indeks Pend.'],
      datasets: [{
        label: 'Rata-rata Jatim',
        data: [avg('aps'), avg('rls')*10, avg('melek_huruf'), avg('apk_sma'), avg('indeks_pendidikan')],
        borderColor: '#00d4ff', backgroundColor: 'rgba(0,212,255,0.1)',
        pointBackgroundColor: '#00d4ff', borderWidth: 2,
      }, {
        label: best.nama.replace('Kota ',''),
        data: [best.aps, best.rls*10, best.melek_huruf, best.apk_sma, best.indeks_pendidikan],
        borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.1)',
        pointBackgroundColor: '#10b981', borderWidth: 2,
      }, {
        label: worst.nama,
        data: [worst.aps, worst.rls*10, worst.melek_huruf, worst.apk_sma, worst.indeks_pendidikan],
        borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)',
        pointBackgroundColor: '#ef4444', borderWidth: 2,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 900 },
      plugins: {
        legend: { labels: { color: getCSSVar('--text-secondary'), font: { family: 'Inter', size: 10 }, boxWidth: 10 } }
      },
      scales: {
        r: {
          ticks: { color: getCSSVar('--text-muted'), font: { size: 9 }, backdropColor: 'transparent' },
          grid: { color: getCSSVar('--border') },
          pointLabels: { color: getCSSVar('--text-secondary'), font: { size: 11 } }
        }
      }
    }
  });
}

// ---- Moran Scatterplot ----
function renderMoranChart() {
  destroyChart('chart-moran');
  const kab = DATA.kabupaten;
  const vals = kab.map(d => d.indeks_pendidikan);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length);
  // Standardize
  const z = vals.map(v => (v - mean) / std);
  // Spatial lag: simple average of 3 nearest neighbors (simulated)
  const lag = z.map((_, i) => {
    const neighbors = [
      z[(i - 1 + z.length) % z.length],
      z[(i + 1) % z.length],
      z[(i + 2) % z.length]
    ];
    return neighbors.reduce((a, b) => a + b, 0) / 3;
  });

  const clusterColor = {
    'HH': '#10b981', 'HL': '#f59e0b', 'LH': '#3b82f6', 'LL': '#ef4444'
  };

  const ctx = document.getElementById('chart-moran').getContext('2d');
  const { gridColor, fontFamily } = chartDefaults();
  charts['chart-moran'] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Kab/Kota',
        data: kab.map((d, i) => ({ x: z[i], y: lag[i], nama: d.nama, cluster: d.cluster_label })),
        backgroundColor: kab.map(d => clusterColor[d.cluster_label] + 'cc'),
        borderColor: kab.map(d => clusterColor[d.cluster_label]),
        borderWidth: 1,
        pointRadius: 6, pointHoverRadius: 9,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = ctx.raw;
              return [`${d.nama}`, `z: ${d.x.toFixed(3)}  lag: ${d.y.toFixed(3)}`, `Cluster: ${d.cluster}`];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Nilai Terstandarisasi (z)', color: getCSSVar('--text-muted'), font: { family: fontFamily, size: 11 } },
          ticks: { color: getCSSVar('--text-secondary') }, grid: { color: gridColor }
        },
        y: {
          title: { display: true, text: 'Spatial Lag (Wz)', color: getCSSVar('--text-muted'), font: { family: fontFamily, size: 11 } },
          ticks: { color: getCSSVar('--text-secondary') }, grid: { color: gridColor }
        }
      }
    }
  });
}

// ---- Heatmap Correlation ----
function renderHeatmapChart() {
  destroyChart('chart-heatmap');
  const vars = ['APS','RLS','MH','APK','Indeks'];
  // Simulated correlation matrix
  const corr = [
    [1.00, 0.87, 0.83, 0.79, 0.91],
    [0.87, 1.00, 0.81, 0.76, 0.94],
    [0.83, 0.81, 1.00, 0.71, 0.88],
    [0.79, 0.76, 0.71, 1.00, 0.85],
    [0.91, 0.94, 0.88, 0.85, 1.00],
  ];
  const n = vars.length;
  const data = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      data.push({ x: vars[c], y: vars[r], v: corr[r][c] });

  function corrToColor(v) {
    const h = v >= 0 ? Math.round(200 - v * 130) : Math.round(200 + Math.abs(v) * 50);
    return `hsla(${h}, 80%, 52%, ${0.3 + Math.abs(v) * 0.7})`;
  }

  const ctx = document.getElementById('chart-heatmap').getContext('2d');
  charts['chart-heatmap'] = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        data: data,
        backgroundColor: data.map(d => corrToColor(d.v)),
        borderColor: 'transparent',
        pointRadius: 22, pointHoverRadius: 24,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 700 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const d = ctx.raw;
              return `${d.y} vs ${d.x}: r = ${d.v.toFixed(2)}`;
            }
          }
        }
      },
      scales: {
        x: {
          type: 'category', labels: vars,
          ticks: { color: getCSSVar('--text-secondary'), font: { family: 'Inter', size: 12 } },
          grid: { display: false }
        },
        y: {
          type: 'category', labels: [...vars].reverse(),
          ticks: { color: getCSSVar('--text-secondary'), font: { family: 'Inter', size: 12 } },
          grid: { display: false }
        }
      }
    },
    plugins: [{
      id: 'heatmap-labels',
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        ctx.save();
        chart.getDatasetMeta(0).data.forEach((pt, i) => {
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 10px Inter';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(data[i].v.toFixed(2), pt.x, pt.y);
        });
        ctx.restore();
      }
    }]
  });
}

// ---- PCA Variance Bar ----
function renderPCAVarChart() {
  destroyChart('chart-pca-var');
  const pca = DATA.pca;
  const { gridColor, fontFamily } = chartDefaults();
  const ctx = document.getElementById('chart-pca-var').getContext('2d');
  charts['chart-pca-var'] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: pca.komponen,
      datasets: [{
        label: 'Variansi Dijelaskan (%)',
        data: pca.variance_explained,
        backgroundColor: ['#00d4ff','#3b82f6','#8b5cf6','#f59e0b','#10b981'],
        borderRadius: 8, borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 800 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: getCSSVar('--text-secondary'), font: { family: fontFamily } }, grid: { color: gridColor } },
        y: {
          ticks: { color: getCSSVar('--text-secondary'), font: { family: fontFamily }, callback: v => v + '%' },
          grid: { color: gridColor }, max: 70,
        }
      }
    }
  });
}

// ---- PCA Cumulative Line ----
function renderPCACumChart() {
  destroyChart('chart-pca-cum');
  const pca = DATA.pca;
  const { gridColor, fontFamily } = chartDefaults();
  const ctx = document.getElementById('chart-pca-cum').getContext('2d');
  charts['chart-pca-cum'] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: pca.komponen,
      datasets: [{
        label: 'Cumulative Variance (%)',
        data: pca.cumulative_variance,
        borderColor: '#00d4ff',
        backgroundColor: 'rgba(0,212,255,0.1)',
        tension: 0.3, fill: true,
        pointBackgroundColor: '#00d4ff',
        pointRadius: 5, pointHoverRadius: 8,
      }, {
        label: 'Threshold 80%',
        data: Array(pca.komponen.length).fill(80),
        borderColor: '#ef4444', borderDash: [5,4],
        borderWidth: 1, pointRadius: 0,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 800 },
      plugins: {
        legend: { labels: { color: getCSSVar('--text-secondary'), font: { family: fontFamily, size: 11 } } }
      },
      scales: {
        x: { ticks: { color: getCSSVar('--text-secondary'), font: { family: fontFamily } }, grid: { color: gridColor } },
        y: {
          ticks: { color: getCSSVar('--text-secondary'), font: { family: fontFamily }, callback: v => v + '%' },
          grid: { color: gridColor }, max: 105, min: 0,
        }
      }
    }
  });
}

// ===================================================
// STATISTIK SPASIAL PANEL
// ===================================================
function renderSpasialStats() {
  // Already handled in renderKPIs via shared IDs
}

// ===================================================
// PCA LOADINGS TABLE
// ===================================================
function renderPCALoadings() {
  const loadings = DATA.pca.loadings;
  const vars = Object.keys(loadings.PC1);
  const tbody = document.querySelector('#pca-loadings-table tbody');
  tbody.innerHTML = vars.map(v => {
    const pc1 = loadings.PC1[v];
    const pc2 = loadings.PC2[v];
    const bar1 = `<span class="loading-bar ${pc1<0?'loading-neg':''}" style="width:${Math.abs(pc1)*60}px"></span>`;
    const bar2 = `<span class="loading-bar ${pc2<0?'loading-neg':''}" style="width:${Math.abs(pc2)*60}px"></span>`;
    return `<tr>
      <td><strong>${v}</strong></td>
      <td>${pc1.toFixed(2)} ${bar1}</td>
      <td>${pc2.toFixed(2)} ${bar2}</td>
    </tr>`;
  }).join('');
}

// ===================================================
// DATA TABLE
// ===================================================
function renderTable() {
  let data = [...filteredData];

  // Sort
  data.sort((a, b) => {
    const av = a[currentSort.col], bv = b[currentSort.col];
    if (typeof av === 'string') return currentSort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return currentSort.dir === 'asc' ? av - bv : bv - av;
  });

  const total = data.length;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageData = data.slice(start, start + PAGE_SIZE);

  document.getElementById('table-count').textContent = `${total} entri`;

  const tbody = document.getElementById('table-body');
  tbody.innerHTML = pageData.map((d, i) => {
    const barW = Math.round(d.indeks_pendidikan);
    return `<tr>
      <td><strong>${d.nama}</strong></td>
      <td>${d.aps}%</td>
      <td>${d.rls}</td>
      <td>${d.melek_huruf}%</td>
      <td>
        <div class="indeks-bar-cell">
          <span>${d.indeks_pendidikan}</span>
          <div class="indeks-bar"><div class="indeks-bar-fill" style="width:${barW}%"></div></div>
        </div>
      </td>
      <td><span class="cluster-badge badge-${d.cluster_label}">${d.cluster}</span></td>
    </tr>`;
  }).join('');

  renderPagination(total);
  initSortHeaders();
}

function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const pg = document.getElementById('pagination');
  if (pages <= 1) { pg.innerHTML = ''; return; }

  let html = `<button class="page-btn" ${currentPage===1?'disabled':''} onclick="goPage(${currentPage-1})"><i class="fas fa-chevron-left"></i></button>`;
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - currentPage) <= 1) {
      html += `<button class="page-btn ${p===currentPage?'active':''}" onclick="goPage(${p})">${p}</button>`;
    } else if (Math.abs(p - currentPage) === 2) {
      html += `<button class="page-btn" disabled>…</button>`;
    }
  }
  html += `<button class="page-btn" ${currentPage===pages?'disabled':''} onclick="goPage(${currentPage+1})"><i class="fas fa-chevron-right"></i></button>`;
  pg.innerHTML = html;
}

window.goPage = (p) => { currentPage = p; renderTable(); };

function initSortHeaders() {
  document.querySelectorAll('.data-table th.sortable').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.col === currentSort.col) {
      th.classList.add(currentSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
    }
    th.onclick = () => {
      if (currentSort.col === th.dataset.col) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.col = th.dataset.col;
        currentSort.dir = 'desc';
      }
      currentPage = 1;
      renderTable();
    };
  });
}

// ===================================================
// MAP
// ===================================================
function initMap() {
  if (leafletMap) { leafletMap.remove(); leafletMap = null; }
  leafletMap = L.map('map', { zoomControl: true, scrollWheelZoom: false }).setView([-7.5, 112.5], 8);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap &copy; CARTO',
    subdomains: 'abcd', maxZoom: 19
  }).addTo(leafletMap);

  renderMapMarkers();
}

function getMarkerColor(d) {
  if (currentLayer === 'cluster') {
    const c = { 'HH': '#1d7a4a', 'HL': '#f59e0b', 'LH': '#3b82f6', 'LL': '#ef4444' };
    return c[d.cluster_label] || '#888';
  }
  const v = d.indeks_pendidikan;
  if (v >= 80) return '#1a7a4a';
  if (v >= 70) return '#52b788';
  if (v >= 65) return '#f9c74f';
  if (v >= 60) return '#f77f00';
  return '#d62828';
}

function renderMapMarkers() {
  mapMarkers.forEach(m => leafletMap.removeLayer(m));
  mapMarkers = [];

  DATA.kabupaten.forEach(d => {
    const color = getMarkerColor(d);
    const marker = L.circleMarker([d.lat, d.lng], {
      radius: 10 + (d.indeks_pendidikan - 55) / 8,
      fillColor: color,
      color: '#fff',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.85
    }).addTo(leafletMap);

    marker.bindPopup(`
      <div class="popup-title">${d.nama}</div>
      <div class="popup-row"><span class="popup-key">APS</span><span class="popup-val">${d.aps}%</span></div>
      <div class="popup-row"><span class="popup-key">RLS</span><span class="popup-val">${d.rls} tahun</span></div>
      <div class="popup-row"><span class="popup-key">Melek Huruf</span><span class="popup-val">${d.melek_huruf}%</span></div>
      <div class="popup-row"><span class="popup-key">APK SMA</span><span class="popup-val">${d.apk_sma}%</span></div>
      <div class="popup-row"><span class="popup-key">Indeks Pendidikan</span><span class="popup-val" style="color:${color}">${d.indeks_pendidikan}</span></div>
      <div class="popup-row"><span class="popup-key">Cluster LISA</span><span class="popup-val">${d.cluster}</span></div>
    `);

    marker.on('mouseover', function() { this.openPopup(); });
    mapMarkers.push(marker);
  });
}

function updateMapColors() {
  mapMarkers.forEach((m, i) => {
    const d = DATA.kabupaten[i];
    m.setStyle({ fillColor: getMarkerColor(d) });
  });
}

// ===================================================
// CSV DOWNLOAD
// ===================================================
function downloadCSV() {
  const headers = ['Kabupaten', 'APS', 'RLS', 'Melek Huruf', 'APK SMA', 'Indeks Pendidikan', 'Cluster'];
  const rows = DATA.kabupaten.map(d => [
    d.nama, d.aps, d.rls, d.melek_huruf, d.apk_sma, d.indeks_pendidikan, d.cluster
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = 'data_pendidikan_jatim.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ===================================================
// EXPORT CHART AS PNG
// ===================================================
function exportChart(chartId) {
  const canvas = document.getElementById(chartId);
  if (!canvas) return;
  const a = document.createElement('a');
  a.download = `${chartId}_export.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
}

// ===================================================
// LOADING SCREEN
// ===================================================
function hideLoader() {
  document.getElementById('loading-screen').classList.add('hidden');
}

// ===================================================
// SCROLL ANIMATION (AOS-lite)
// ===================================================
function initAOS() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('aos-visible');
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('[data-aos]').forEach(el => observer.observe(el));
}

// ===================================================
// FALLBACK DATA (if data.json fails to load)
// ===================================================
const FALLBACK_DATA = {
  metadata: { title: "Dashboard Ketimpangan Pendidikan Jawa Timur", tahun_tersedia: [2019,2020,2021,2022,2023] },
  statistik_spasial: {
    morans_i: 0.3847, z_score: 4.2156, p_value: 0.0001,
    expected_i: -0.0270, variance: 0.0086,
    interpretasi: "Terdapat autokorelasi spasial positif yang signifikan (p < 0.001). Wilayah dengan kualitas pendidikan tinggi cenderung berdekatan satu sama lain, membentuk klaster spasial HH yang khas di kawasan perkotaan Jawa Timur bagian barat."
  },
  pca: {
    variance_explained: [52.3, 24.1, 13.8, 6.2, 3.6],
    cumulative_variance: [52.3, 76.4, 90.2, 96.4, 100.0],
    komponen: ["PC1","PC2","PC3","PC4","PC5"],
    loadings: {
      PC1: { APS: 0.87, RLS: 0.91, MelekHuruf: 0.83, APK: 0.79, GER_SD: 0.72 },
      PC2: { APS: -0.21, RLS: 0.18, MelekHuruf: -0.35, APK: 0.62, GER_SD: 0.71 }
    }
  },
  tren_tahunan: {
    tahun: [2019,2020,2021,2022,2023],
    rata_indeks: [68.4,69.1,69.8,71.2,72.5],
    ketimpangan_gini: [0.187,0.181,0.175,0.168,0.162]
  },
  kabupaten: [
    { id:"3578", nama:"Kota Surabaya", aps:98.7, rls:11.2, melek_huruf:99.1, apk_sma:92.4, indeks_pendidikan:88.5, cluster:"High-High", cluster_label:"HH", lat:-7.2575, lng:112.7521, tren:[82.1,84.3,85.7,87.2,88.5] },
    { id:"3507", nama:"Kota Malang", aps:97.9, rls:10.8, melek_huruf:98.7, apk_sma:90.1, indeks_pendidikan:86.2, cluster:"High-High", cluster_label:"HH", lat:-7.9666, lng:112.6326, tren:[79.4,81.2,83.1,85.0,86.2] },
    { id:"3515", nama:"Sidoarjo", aps:97.2, rls:10.4, melek_huruf:98.2, apk_sma:88.7, indeks_pendidikan:85.1, cluster:"High-High", cluster_label:"HH", lat:-7.4478, lng:112.7183, tren:[78.2,79.9,81.5,83.4,85.1] },
    { id:"3525", nama:"Gresik", aps:95.1, rls:9.4, melek_huruf:96.7, apk_sma:84.8, indeks_pendidikan:81.7, cluster:"High-High", cluster_label:"HH", lat:-7.1580, lng:112.6521, tren:[74.8,76.4,78.1,80.0,81.7] },
    { id:"3510", nama:"Banyuwangi", aps:93.8, rls:8.7, melek_huruf:95.4, apk_sma:81.3, indeks_pendidikan:78.2, cluster:"High-Low", cluster_label:"HL", lat:-8.2192, lng:114.3691, tren:[71.1,72.8,74.6,76.5,78.2] },
    { id:"3509", nama:"Jember", aps:90.2, rls:7.5, melek_huruf:91.8, apk_sma:75.4, indeks_pendidikan:72.3, cluster:"Low-Low", cluster_label:"LL", lat:-8.1724, lng:113.7002, tren:[65.3,67.0,68.8,70.6,72.3] },
    { id:"3527", nama:"Sampang", aps:81.2, rls:5.4, melek_huruf:79.4, apk_sma:60.1, indeks_pendidikan:57.6, cluster:"Low-Low", cluster_label:"LL", lat:-7.1943, lng:113.2421, tren:[50.7,52.4,54.1,55.9,57.6] },
    { id:"3526", nama:"Bangkalan", aps:83.7, rls:6.1, melek_huruf:82.3, apk_sma:63.4, indeks_pendidikan:61.2, cluster:"Low-Low", cluster_label:"LL", lat:-7.0400, lng:112.7391, tren:[54.3,56.0,57.7,59.5,61.2] },
    { id:"3528", nama:"Pamekasan", aps:84.3, rls:5.9, melek_huruf:83.1, apk_sma:64.7, indeks_pendidikan:62.3, cluster:"Low-Low", cluster_label:"LL", lat:-7.1572, lng:113.4735, tren:[55.4,57.1,58.8,60.6,62.3] },
    { id:"3529", nama:"Sumenep", aps:86.1, rls:6.2, melek_huruf:85.7, apk_sma:67.3, indeks_pendidikan:64.8, cluster:"Low-Low", cluster_label:"LL", lat:-6.9998, lng:113.8621, tren:[57.8,59.5,61.3,63.1,64.8] }
  ]
};
