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
  tooltip = document.getElementById('tooltip');
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
  if (!el) return;

  const count = getFiltered().length;
  el.textContent = `${count} conditions`;
}

// ── TABS ──────────────────────────────────────
function switchTab() {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));

  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === currentTab);
  });

  document.getElementById(`tab-${currentTab}`)?.classList.remove('hidden');
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
  if (!tooltip) return;
  tooltip.style.display = 'none';
}

// ── CHARTS (EXAMPLE) ──────────────────────────
function drawScatter() {
  const el = document.getElementById('tab-scatter');
  el.replaceChildren();

  // Filter: need duration + fold_change
  const data = getFiltered().filter(d =>
    d.stim_duration_hrs != null &&
    d.stim_duration_hrs > 0 &&
    d.fold_change != null
  );

  if (!data.length) {
    el.textContent = 'No data for current filters';
    return;
  }

  const W = el.clientWidth || 800;
  const H = 420;
  const M = { t: 20, r: 20, b: 50, l: 60 };
  const w = W - M.l - M.r;
  const h = H - M.t - M.b;

  const svg = d3.select(el)
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`);

  const g = svg.append('g')
    .attr('transform', `translate(${M.l},${M.t})`);

  // ── SCALES ───────────────────────────────
  const xExtent = d3.extent(data, d => d.stim_duration_hrs);
  const yExtent = d3.extent(data, d => d.fold_change);

  const x = d3.scaleLog()
    .domain([
      Math.max(0.001, xExtent[0] * 0.8),
      xExtent[1] * 1.2
    ])
    .range([0, w])
    .clamp(true);

  const y = d3.scaleLinear()
    .domain([
      Math.min(0, yExtent[0] - 0.1),
      yExtent[1] + 0.2
    ])
    .range([h, 0])
    .nice();

  // ── GRID ────────────────────────────────
  g.append('g')
    .attr('class', 'grid')
    .call(d3.axisLeft(y).tickSize(-w).tickFormat('').ticks(6))
    .selectAll('line')
    .attr('stroke', '#333')
    .attr('stroke-dasharray', '2,4');

  // ── AXES ────────────────────────────────
  g.append('g')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(6, "~g"));

  g.append('g')
    .call(d3.axisLeft(y).ticks(6));

  // ── AXIS LABELS ─────────────────────────
  g.append('text')
    .attr('x', w / 2)
    .attr('y', h + 40)
    .attr('text-anchor', 'middle')
    .attr('font-size', 11)
    .text('Stimulation Duration (hours, log)');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2)
    .attr('y', -45)
    .attr('text-anchor', 'middle')
    .attr('font-size', 11)
    .text('Fold Change');

  // ── FC = 1 REFERENCE LINE ───────────────
  g.append('line')
    .attr('x1', 0)
    .attr('x2', w)
    .attr('y1', y(1))
    .attr('y2', y(1))
    .attr('stroke', '#666')
    .attr('stroke-dasharray', '4,4');

  // ── COLOR BY MODALITY ───────────────────
  const COLOR = {
    Mechanical: '#4fc3a1',
    Electrical: '#f5845a'
  };

  // ── POINTS ──────────────────────────────
  g.selectAll('circle')
    .data(data)
    .enter()
    .append('circle')
    .attr('cx', d => x(Math.max(0.001, d.stim_duration_hrs)))
    .attr('cy', d => y(d.fold_change))
    .attr('r', 4.5)
    .attr('fill', d => COLOR[d.stim_modality] || '#999')
    .attr('fill-opacity', 0.65)
    .attr('stroke', d => COLOR[d.stim_modality] || '#999')
    .attr('stroke-width', 0.5)
    .style('cursor', 'pointer')
    .on('mouseover', showTooltip)
    .on('mousemove', moveTooltip)
    .on('mouseout', hideTooltip)
    .on('click', (_, d) => {
      if (d.doi && isSafeUrl(d.doi)) {
        window.open(d.doi, '_blank', 'noopener');
      }
    });
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
