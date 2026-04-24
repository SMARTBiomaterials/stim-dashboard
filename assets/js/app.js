function isSafeUrl(url) {
  try {
    const u = new URL(url, window.location.origin);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}
// ── STATE ─────────────────────────────────────
let DATA = [];
let currentTab = 'scatter';
let sourceFilter = 'all';

// ── INIT ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const tooltip = document.getElementById('tooltip');
  bindUI();
  initTheme();
  await loadData();
  render();
});

// ── UI BINDINGS (CSP SAFE) ────────────────────
function bindUI() {
  document.getElementById('theme-btn')
    ?.addEventListener('click', toggleTheme);

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      switchTab();
      render();
    });
  });

  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sourceFilter = btn.dataset.source;
      document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
  });
}

// ── DATA ──────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch('./data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);

    const json = await res.json();
    DATA = Array.isArray(json) ? json : (json.items || []);

  } catch (err) {
    console.error('Data load failed:', err);

    const el = document.getElementById('tab-scatter');
    if (el) el.textContent = 'Failed to load data.json';
  }
}

// ── FILTER ────────────────────────────────────
function getFiltered() {
  return DATA.filter(d => {
    if (sourceFilter !== 'all' && d.source !== sourceFilter) return false;
    return true;
  });
}

// ── RENDER ROOT ───────────────────────────────
function render() {
  updateStats();

  if (currentTab === 'scatter') drawScatter();
  if (currentTab === 'dose') drawDose();
}

// ── STATS ─────────────────────────────────────
function updateStats() {
  const el = document.getElementById('header-stats');
  const count = getFiltered().length;
  el.textContent = `${count} conditions`;
}

// ── TABS ──────────────────────────────────────
function switchTab() {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(`tab-${currentTab}`).classList.remove('hidden');
}

// ── TOOLTIP (SAFE) ────────────────────────────
let tooltip = null;


function showTooltip(e, d) {
  if (!tooltip) return;

  tooltip.replaceChildren();

  const title = document.createElement('div');
  title.textContent = d.paper || 'Unknown';

  const fc = document.createElement('div');
  fc.textContent = `Fold change: ${d.fold_change ?? '—'}`;

  tooltip.append(title, fc);

  tooltip.style.display = 'block';
  moveTooltip(e);
}

function moveTooltip(e) {
  if (!tooltip) return;
  tooltip.style.left = e.clientX + 10 + 'px';
  tooltip.style.top = e.clientY + 10 + 'px';
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

// ── CHARTS (EXAMPLE) ──────────────────────────
function drawScatter() {
  const el = document.getElementById('tab-scatter');
  el.replaceChildren();

  const data = getFiltered().filter(d => d.fold_change != null);

  if (!data.length) {
    el.textContent = 'No data';
    return;
  }

  const W = 800, H = 400;

  const svg = d3.select(el)
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`);

  const x = d3.scaleLinear()
    .domain(d3.extent(data, d => d.fold_change))
    .range([40, W - 20]);

  const y = d3.scaleLinear()
    .domain([0, data.length])
    .range([20, H - 20]);

  svg.selectAll('circle')
    .data(data)
    .enter()
    .append('circle')
    .attr('cx', d => x(d.fold_change))
    .attr('cy', (_, i) => y(i))
    .attr('r', 4)
    .attr('fill', '#7c9ef5')
    .on('mouseover', showTooltip)
    .on('mousemove', moveTooltip)
    .on('mouseout', hideTooltip);
}

function drawDose() {
  const el = document.getElementById('tab-dose');
  el.textContent = 'Dose view (stub)';
}

// ── THEME ─────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved);
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('theme', theme);
}
