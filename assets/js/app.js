// ── STATE ─────────────────────────────────────
let DATA = [];
let currentTab = 'scatter';
let sourceFilter = 'all';

// ── INIT ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
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
  const res = await fetch('./data.json');
  DATA = await res.json();
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
const tooltip = document.getElementById('tooltip');

function showTooltip(e, d) {
  tooltip.replaceChildren();

  const title = document.createElement('div');
  title.textContent = d.paper || '';
  tooltip.appendChild(title);

  tooltip.style.display = 'block';
  moveTooltip(e);
}

function moveTooltip(e) {
  tooltip.style.left = e.clientX + 'px';
  tooltip.style.top = e.clientY + 'px';
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

// ── CHARTS (EXAMPLE) ──────────────────────────
function drawScatter() {
  const el = document.getElementById('tab-scatter');
  el.replaceChildren();

  const data = getFiltered();

  const svg = d3.select(el)
    .append('svg')
    .attr('viewBox', '0 0 800 400');

  svg.selectAll('circle')
    .data(data)
    .enter()
    .append('circle')
    .attr('cx', (d,i) => i * 5)
    .attr('cy', 200)
    .attr('r', 3)
    .on('mouseover', showTooltip)
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
