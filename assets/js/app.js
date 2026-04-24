// ── SAFE URL ─────────────────────────────────
function isSafeUrl(url) {
  try {
    const u = new URL(url, window.location.origin);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

// ── STATE ────────────────────────────────────
let DATA = [];
let currentTab = 'scatter';
let sourceFilter = 'all';
let includeMixed = false;

let filters = {
  modality: new Set(),
  cell: new Set(),
  outcome: new Set(),
  model: new Set(),
  fcMin: 0,
  fcMax: 5
};

let tooltip = null;

// ── COLOR MAPS (ADD HERE) ───────────────
const MODALITY_COLOR = {
  Mechanical: '#4fc3a1',
  Electrical: '#f5845a'
};

const OUTCOME_COLOR = {
  Proliferation: '#7eb8e8',
  Migration: '#c87dd4',
  Morphology: '#e8c97e',
  Viability: '#7ee8a2'
};

// helper to pick colour
function getColor(d) {
  if (colorMode === 'outcome') {
    return OUTCOME_COLOR[d.outcome_type] || '#999';
  }
  return MODALITY_COLOR[d.stim_modality] || '#999';
}

// ── LEGEND RENDERER (ADD HERE) ──────────
function renderLegend(data) {
  const el = document.getElementById('scatter-legend');
  if (!el) return;

  el.replaceChildren();

  const map = colorMode === 'outcome' ? OUTCOME_COLOR : MODALITY_COLOR;

  const keys = Object.keys(map).filter(k =>
    data.some(d =>
      colorMode === 'outcome'
        ? d.outcome_type === k
        : d.stim_modality === k
    )
  );

  keys.forEach(k => {
    const item = document.createElement('div');
    item.className = 'legend-item';

    const dot = document.createElement('div');
    dot.className = 'legend-dot';
    dot.style.background = map[k];

    const label = document.createElement('span');
    label.textContent = k;

    item.append(dot, label);
    el.appendChild(item);
  });
}

// ── INIT ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  tooltip = document.getElementById('tooltip');

  bindUI();
  initTheme();
  await loadData();
  initFilters();
  render();
});
let colorMode = 'modality'; // 'modality' | 'outcome'

// ── UI BINDINGS ──────────────────────────────
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

      document.querySelectorAll('.source-btn')
        .forEach(b => b.classList.remove('active'));

      btn.classList.add('active');
      render();
    });
  });

  // sliders
  document.getElementById('fc-min')?.addEventListener('input', e => {
    filters.fcMin = +e.target.value;
    render();
  });

  document.getElementById('fc-max')?.addEventListener('input', e => {
    filters.fcMax = +e.target.value;
    render();
  });

  // mixed toggle
  document.getElementById('mixed-toggle')
    ?.addEventListener('change', e => {
      includeMixed = e.target.checked;
      render();
    });
document.querySelectorAll('.legend-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      colorMode = btn.dataset.color;
      document.querySelectorAll('.legend-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
  });
}

// ── DATA ─────────────────────────────────────
async function loadData() {
  try {
    const res = await fetch('./data.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);

    const json = await res.json();
    DATA = Array.isArray(json) ? json : (json.items || []);

  } catch (err) {
    console.error(err);
    document.getElementById('tab-scatter').textContent = 'Failed to load data';
  }
}

// ── FILTER SETUP ─────────────────────────────
function initFilters() {
  const uniq = key =>
    [...new Set(DATA.map(d => d[key]))].filter(Boolean);

  buildChips('filter-modality', uniq('stim_modality'), 'modality');
  buildChips('filter-cell', uniq('cell_type'), 'cell');
  buildChips('filter-outcome', uniq('outcome_type'), 'outcome');
  buildChips('filter-model', uniq('model'), 'model');
}

function buildChips(id, values, key) {
  const el = document.getElementById(id);
  if (!el) return;

  el.replaceChildren();

  values.forEach(v => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = v;

    btn.addEventListener('click', () => {
      const set = filters[key];

      if (set.has(v)) {
        set.delete(v);
        btn.classList.remove('active');
      } else {
        set.add(v);
        btn.classList.add('active');
      }

      render();
    });

    el.appendChild(btn);
  });
}

// ── FILTER LOGIC ─────────────────────────────
function getFiltered() {
  return DATA.filter(d => {
    if (!includeMixed && d.cell_type === 'Mixed') return false;
    if (sourceFilter !== 'all' && d.source !== sourceFilter) return false;

    if (filters.modality.size && !filters.modality.has(d.stim_modality)) return false;
    if (filters.cell.size && !filters.cell.has(d.cell_type)) return false;
    if (filters.outcome.size && !filters.outcome.has(d.outcome_type)) return false;
    if (filters.model.size && !filters.model.has(d.model)) return false;

    if (d.fold_change < filters.fcMin || d.fold_change > filters.fcMax) return false;

    return true;
  });
}

// ── RENDER ROOT ──────────────────────────────
function render() {
  updateStats();

  if (currentTab === 'scatter') drawScatter();
  if (currentTab === 'dose') drawDose();
}

// ── STATS ────────────────────────────────────
function updateStats() {
  const el = document.getElementById('header-stats');
  if (!el) return;

  const f = getFiltered();

  const mech = f.filter(d => d.stim_modality === 'Mechanical').length;
  const elec = f.filter(d => d.stim_modality === 'Electrical').length;

  el.textContent = `${f.length} conditions (${mech} mech / ${elec} elec)`;
}

// ── TABS ─────────────────────────────────────
function switchTab() {
  document.querySelectorAll('.panel')
    .forEach(p => p.classList.add('hidden'));

  document.querySelectorAll('.tab')
    .forEach(t => t.classList.toggle('active', t.dataset.tab === currentTab));

  document.getElementById(`tab-${currentTab}`)
    ?.classList.remove('hidden');
}

// ── TOOLTIP ──────────────────────────────────
function showTooltip(e, d) {
  if (!tooltip) return;

  tooltip.replaceChildren();

  const t = document.createElement('div');
  t.textContent = d.paper || 'Unknown';

  const r1 = document.createElement('div');
  r1.textContent = `Fold change: ${d.fold_change ?? '—'}`;

  const r2 = document.createElement('div');
  r2.textContent = `Duration: ${d.stim_duration_hrs ?? '—'} h`;

  tooltip.append(t, r1, r2);
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

// ── SCATTER ──────────────────────────────────
function drawScatter() {
  const el = document.getElementById('scatter-chart');
  el.replaceChildren();

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
  const H = 440;
  const M = { t: 24, r: 24, b: 56, l: 64 };
  const w = W - M.l - M.r;
  const h = H - M.t - M.b;

  const svg = d3.select(el)
    .append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`);

  const g = svg.append('g')
    .attr('transform', `translate(${M.l},${M.t})`);

  // ── scales
  const xExt = d3.extent(data, d => d.stim_duration_hrs);
  const yExt = d3.extent(data, d => d.fold_change);

  const x = d3.scaleLog()
    .domain([Math.max(1e-3, xExt[0] * 0.8), xExt[1] * 1.2])
    .range([0, w])
    .clamp(true);

  const y = d3.scaleLinear()
    .domain([Math.min(0, yExt[0] - 0.1), yExt[1] + 0.2])
    .range([h, 0])
    .nice();

  // ── grid
  g.append('g')
    .call(d3.axisLeft(y).tickSize(-w).tickFormat('').ticks(6))
    .selectAll('line')
    .attr('stroke', '#2a2a2a')
    .attr('stroke-dasharray', '2,4');

  // ── axes
  g.append('g')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).ticks(6, "~g"));

  g.append('g')
    .call(d3.axisLeft(y).ticks(6));

  // ── labels
  g.append('text')
    .attr('x', w / 2)
    .attr('y', h + 42)
    .attr('text-anchor', 'middle')
    .attr('font-size', 11)
    .text('Stimulation Duration (hours, log)');

  g.append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2)
    .attr('y', -48)
    .attr('text-anchor', 'middle')
    .attr('font-size', 11)
    .text('Fold Change');

  // ── FC = 1 line
  g.append('line')
    .attr('x1', 0)
    .attr('x2', w)
    .attr('y1', y(1))
    .attr('y2', y(1))
    .attr('stroke', '#666')
    .attr('stroke-dasharray', '4,4');

  // ── jitter to reduce overlap
  const jitter = () => (Math.random() - 0.5) * 6;

  // ── points
  g.selectAll('circle')
    .data(data)
    .enter()
    .append('circle')
    .attr('cx', d => x(Math.max(1e-3, d.stim_duration_hrs)) + jitter())
    .attr('cy', d => y(d.fold_change) + jitter() * 0.2)
    .attr('r', 4.5)
    .attr('fill', d => getColor(d))
    .attr('fill-opacity', 0.7)
    .attr('stroke', d => getColor(d))
    .attr('stroke-width', 0.6)
    .style('cursor', 'pointer')
    .on('mouseover', showTooltip)
    .on('mousemove', moveTooltip)
    .on('mouseout', hideTooltip)
    .on('click', (_, d) => {
      if (d.doi && isSafeUrl(d.doi)) {
        window.open(d.doi, '_blank', 'noopener');
      }
    });

  // ── counts badge (optional)
  const countEl = document.getElementById('scatter-count');
  if (countEl) countEl.textContent = `${data.length} points`;

  // ── legend
  renderLegend(data);
}

// ── DOSE (stub) ──────────────────────────────
function drawDose() {
  document.getElementById('tab-dose').textContent = 'Dose view';
}

// ── THEME ────────────────────────────────────
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
