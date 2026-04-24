function cssVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}
function addAxes(svg, x, y, W, H) {
  svg.append('g')
    .attr('transform', `translate(0,${H - 40})`)
    .call(d3.axisBottom(x).ticks(6));

  svg.append('g')
    .attr('transform', `translate(60,0)`)
    .call(d3.axisLeft(y).ticks(6));
}

// === NUMERIC HELPERS ===
function localMedian(data, xKey, yKey, bins = 10) {
  if (data.length < 4) return [];
  const sorted = [...data].sort((a,b) => a[xKey] - b[xKey]);
  const size = Math.max(3, Math.floor(sorted.length / bins));
  const out = [];

  for (let i = 0; i <= sorted.length - size; i += Math.floor(size/2)) {
    const slice = sorted.slice(i, i + size);
    out.push({
      x: d3.mean(slice, d => d[xKey]),
      y: d3.median(slice, d => d[yKey])
    });
  }
  return out;
}

function kernelDensityEstimator(kernel, X) {
  return function(V) {
    return X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
  };
}

function kernelEpanechnikov(k) {
  return v => Math.abs(v /= k) <= 1 ? 0.75 * (1 - v*v) / k : 0;
}

// === SAFE HELPERS ===
function isSafeUrl(url) {
  try {
    const u = new URL(url, window.location.origin);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}
// === THEME SYSTEM (CSP SAFE) ===
function initTheme() {
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const theme = stored || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  const btn = document.getElementById('theme-btn');
  if (btn) {
    btn.textContent = theme === 'dark' ? '☀︎ Light' : '☾ Dark';
  }

  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');

  // important: redraw charts so CSS vars update
  render();
}
// === STATE ===
let DATA = [];
let currentTab = 'scatter';
let sourceFilter = 'all';
let includeMixed = false;
let colorMode = 'modality';

let filters = {
  modality: new Set(),
  cell: new Set(),
  outcome: new Set(),
  model: new Set(),
  fcMin: 0,
  fcMax: 5
};

let tooltip = null;

// === COLORS ===
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

function getColor(d) {
  return colorMode === 'outcome'
    ? OUTCOME_COLOR[d.outcome_type] || '#999'
    : MODALITY_COLOR[d.stim_modality] || '#999';
}

// === INIT ===
document.addEventListener('DOMContentLoaded', async () => {
  tooltip = document.getElementById('tooltip');

  initTheme();   // ← ADD THIS

  bindUI();
  await loadData();
  initFilters();
  render();
});

// === DATA ===
async function loadData() {
  try {
    const res = await fetch('./data.json', { cache: 'no-store' });
    DATA = await res.json();
  } catch {
    document.getElementById('scatter-chart').textContent = 'Failed to load data';
  }
}

// === UI BINDINGS ===
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

  document.getElementById('fc-min')?.addEventListener('input', e => {
    filters.fcMin = +e.target.value;
    render();
  });

  document.getElementById('fc-max')?.addEventListener('input', e => {
    filters.fcMax = +e.target.value;
    render();
  });

  document.getElementById('mixed-toggle')?.addEventListener('change', e => {
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

// === FILTERS ===
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

function initFilters() {
  const uniq = key => [...new Set(DATA.map(d => d[key]))].filter(Boolean);

  buildChips('filter-modality', uniq('stim_modality'), 'modality');
  buildChips('filter-cell', uniq('cell_type'), 'cell');
  buildChips('filter-outcome', uniq('outcome_type'), 'outcome');
  buildChips('filter-model', uniq('model'), 'model');
}

function buildChips(id, values, key) {
  const el = document.getElementById(id);
  if (!el) return;
  clear(el);

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

// === STATS ===
function updateStats() {
  const el = document.getElementById('header-stats');
  if (!el) return;

  clear(el);

  const f = getFiltered();

  const total = document.createElement('div');
  total.textContent = `${f.length} conditions`;

  const mech = document.createElement('div');
  mech.style.color = 'var(--mech)';
  mech.textContent = `${f.filter(d => d.stim_modality === 'Mechanical').length} mech`;

  const elec = document.createElement('div');
  elec.style.color = 'var(--elec)';
  elec.textContent = `${f.filter(d => d.stim_modality === 'Electrical').length} elec`;

  el.append(total, mech, elec);
}

// === TOOLTIP ===
function showTooltip(e, d) {
  clear(tooltip);

  // container
  const wrap = document.createElement('div');

  // title
  const title = document.createElement('div');
  title.className = 'tt-title';
  title.textContent = (d.paper || 'Unknown study').slice(0, 100);

  // DOI
  const doi = document.createElement('div');
  doi.className = 'tt-doi';
  doi.textContent = d.doi || '';

  wrap.append(title, doi);

  // rows helper
  function addRow(label, value) {
    if (value === undefined || value === null || value === '') return;

    const row = document.createElement('div');
    row.className = 'tt-row';

    const left = document.createElement('span');
    left.textContent = label;

    const right = document.createElement('span');
    right.textContent = value;

    row.append(left, right);
    wrap.appendChild(row);
  }

  // === FULL DATA (matches original) ===
  addRow('Modality', d.stim_modality);
  addRow('Cell type', d.cell_type);
  addRow('Outcome', d.outcome_type);
  addRow('Fold change', d.fold_change?.toFixed(3));
  addRow('Model', d.model);

  addRow('Stim type', typeof d.stim_type === 'string' ? d.stim_type.slice(0,40) : null);
  addRow('Frequency', d.frequency_hz ? `${d.frequency_hz} Hz` : null);
  addRow('Duration', d.stim_duration_hrs ? `${d.stim_duration_hrs} hrs` : null);
  addRow('Strain', d.strain_amplitude_pct ? `${d.strain_amplitude_pct} %` : null);
  addRow('Field', d.field_strength_mv_mm ? `${d.field_strength_mv_mm} mV/mm` : null);

  addRow('Dose', d.dose_value ? d.dose_value.toExponential(2) : null);

  tooltip.appendChild(wrap);

  tooltip.style.display = 'block';
  moveTooltip(e);
}

function moveTooltip(e) {
  tooltip.style.left = e.clientX + 10 + 'px';
  tooltip.style.top = e.clientY + 10 + 'px';
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

// === TABS ===
function switchTab() {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

  document.getElementById(`tab-${currentTab}`)?.classList.remove('hidden');
  document.querySelector(`[data-tab="${currentTab}"]`)?.classList.add('active');
}

// === LEGEND ===
function renderLegend(data) {
  const el = document.getElementById('scatter-legend');
  if (!el) return;
  clear(el);

  const map = colorMode === 'outcome' ? OUTCOME_COLOR : MODALITY_COLOR;

  Object.keys(map).forEach(k => {
    if (!data.some(d => d.stim_modality === k || d.outcome_type === k)) return;

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

// === SCATTER ===
function drawScatter() {
  const el = document.getElementById('scatter-chart');
  clear(el);

  const data = getFiltered().filter(d =>
    d.stim_duration_hrs && d.fold_change
  );

  if (!data.length) {
    el.textContent = 'No data';
    return;
  }

  const W = el.clientWidth || 800;
  const H = 420;

  const svg = d3.select(el).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`);

  const xExt = d3.extent(data, d => d.stim_duration_hrs);

const x = d3.scaleLog()
  .domain([
  Math.max(0.001, xExt[0] * 0.8),
  xExt[1] * 1.2
])
  .range([60, W - 20]);

  const y = d3.scaleLinear()
    .domain(d3.extent(data, d => d.fold_change))
    .range([H - 40, 20]);
  addAxes(svg, x, y, W, H);
  svg.selectAll('.domain, .tick line')
  .attr('stroke', cssVar('--border2'));

svg.selectAll('.tick text')
  .attr('fill', cssVar('--text-dim'));
  svg.append('line')
  .attr('x1', 60)
  .attr('x2', W - 20)
  .attr('y1', y(1))
  .attr('y2', y(1))
  .attr('stroke', cssVar('--border2'))
  .attr('stroke-dasharray', '4,4');
  // points
  svg.selectAll('circle')
    .data(data)
    .enter()
    .append('circle')
    .attr('cx', d => x(d.stim_duration_hrs))
    .attr('cy', d => y(d.fold_change))
    .attr('r', 4.5)
    .attr('fill', d => getColor(d))
    .attr('opacity', 0.7)
    .attr('stroke', d => getColor(d))
    .attr('stroke-width', 0.5)
    .style('cursor', 'pointer')
.on('mouseover', function(e,d){
  d3.select(this)
    .attr('r', 7)
    .attr('stroke-width', 1.2);

  showTooltip(e,d);
})
.on('mousemove', moveTooltip)
.on('mouseout', function(){
  d3.select(this)
    .attr('r', 4.5)
    .attr('stroke-width', 0.5);

  hideTooltip();
});

  // rolling median trend
  const trend = localMedian(data, 'stim_duration_hrs', 'fold_change', 10);

  if (trend.length > 2) {
    svg.append('path')
      .datum(trend)
      .attr('fill', 'none')
      .attr('stroke', cssVar('--accent'))
      .attr('stroke-width', 2)
      .attr('d', d3.line()
        .x(d => x(d.x))
        .y(d => y(d.y))
        .curve(d3.curveCatmullRom.alpha(0.5))
      );
  }

  renderLegend(data);
}

// === ROOT RENDER ===
function render() {
  updateStats();

  if (currentTab === 'scatter') drawScatter();
  if (currentTab === 'box') drawBox();
  if (currentTab === 'freq') drawFreq();
  if (currentTab === 'duration') drawDuration();
  if (currentTab === 'dose') drawDose();
}

function drawBox() {
  const el = document.getElementById('box-chart');
  clear(el);

  const data = getFiltered().filter(d => d.fold_change != null);
  if (!data.length) {
    el.textContent = 'No data';
    return;
  }

  const groups = d3.group(data, d => `${d.stim_modality} · ${d.outcome_type}`);
  const keys = [...groups.keys()];

  const W = el.clientWidth || 800;
  const H = 420;

  const svg = d3.select(el).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`);

  const x = d3.scaleBand().domain(keys).range([60, W - 20]).padding(0.3);
  const y = d3.scaleLinear()
    .domain(d3.extent(data, d => d.fold_change))
    .range([H - 40, 20]);
  addAxes(svg, x, y, W, H);
  svg.selectAll('.domain, .tick line')
  .attr('stroke', cssVar('--border2'));

svg.selectAll('.tick text')
  .attr('fill', cssVar('--text-dim'));
  keys.forEach(k => {
    const vals = groups.get(k).map(d => d.fold_change).sort(d3.ascending);
    if (vals.length < 2) return;

    const q1 = d3.quantile(vals, 0.25);
    const q3 = d3.quantile(vals, 0.75);
    const med = d3.quantile(vals, 0.5);

    const cx = x(k) + x.bandwidth() / 2;

    svg.append('rect')
      .attr('x', cx - 10)
      .attr('y', y(q3))
      .attr('width', 20)
      .attr('height', y(q1) - y(q3))
      .attr('fill', cssVar('--text-dim'))
      .attr('opacity', 0.3);

    svg.append('line')
      .attr('x1', cx - 10)
      .attr('x2', cx + 10)
      .attr('y1', y(med))
      .attr('y2', y(med))
      .attr('stroke', '#fff');
  });
}
function drawFreq() {
  const el = document.getElementById('freq-chart');
  clear(el);

  const data = getFiltered().filter(d =>
    d.frequency_hz && d.fold_change
  );

  if (!data.length) {
    el.textContent = 'No frequency data';
    return;
  }

  const W = el.clientWidth || 800;
  const H = 420;

  const svg = d3.select(el).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`);

  const x = d3.scaleLog()
    .domain(d3.extent(data, d => d.frequency_hz))
    .range([60, W - 20]);

  const y = d3.scaleLinear()
    .domain(d3.extent(data, d => d.fold_change))
    .range([H - 40, 20]);
addAxes(svg, x, y, W, H);
  svg.selectAll('.domain, .tick line')
  .attr('stroke', cssVar('--border2'));

svg.selectAll('.tick text')
  .attr('fill', cssVar('--text-dim'));
 svg.selectAll('circle')
  .data(data)
  .enter()
  .append('circle')
  .attr('cx', d => x(d.frequency_hz))
  .attr('cy', d => y(d.fold_change))
  .attr('r', 4.5)
  .attr('fill', d => getColor(d))
  .attr('opacity', 0.7)
  .attr('stroke', d => getColor(d))
  .attr('stroke-width', 0.5)
  .style('cursor', 'pointer')

  // ✅ HOVER SCALE HERE
  .on('mouseover', function (e, d) {
    d3.select(this)
      .attr('r', 7)
      .attr('stroke-width', 1.2);

    showTooltip(e, d);
  })
  .on('mousemove', moveTooltip)
  .on('mouseout', function () {
    d3.select(this)
      .attr('r', 4.5)
      .attr('stroke-width', 0.5);

    hideTooltip();
  });

  renderLegend(data);
}
function drawDuration() {
  const el = document.getElementById('dur-chart');
  clear(el);

  const data = getFiltered().filter(d =>
    d.stim_duration_hrs && d.fold_change
  );

  if (!data.length) {
    el.textContent = 'No duration data';
    return;
  }

  const W = el.clientWidth || 800;
  const H = 420;

  const svg = d3.select(el).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`);

  const x = d3.scaleLog()
    .domain(d3.extent(data, d => d.stim_duration_hrs))
    .range([60, W - 20]);

  const y = d3.scaleLinear()
    .domain(d3.extent(data, d => d.fold_change))
    .range([H - 40, 20]);

  const grouped = d3.group(data, d => d.outcome_type);
addAxes(svg, x, y, W, H);
  svg.selectAll('.domain, .tick line')
  .attr('stroke', cssVar('--border2'));

svg.selectAll('.tick text')
  .attr('fill', cssVar('--text-dim'));
  grouped.forEach((pts, key) => {
    svg.selectAll(null)
      .data(pts)
      .enter()
      .append('circle')
      .attr('cx', d => x(d.stim_duration_hrs))
      .attr('cy', d => y(d.fold_change))
      .attr('r', 4.5)
      .attr('fill', OUTCOME_COLOR[key] || '#888');
  });

  renderLegend(data);
}
function drawDose() {
  
  const el = document.getElementById('dose-chart');
  clear(el);

  const data = getFiltered().filter(d =>
    d.dose_value && d.fold_change
  );

  if (!data.length) {
    el.textContent = 'No dose data';
    return;
  }

  const W = el.clientWidth || 800;
  const H = 440;

  const svg = d3.select(el).append('svg')
    .attr('viewBox', `0 0 ${W} ${H}`);

  const x = d3.scaleLog()
    .domain(d3.extent(data, d => d.dose_value))
    .range([60, W - 120]);

  const y = d3.scaleLinear()
    .domain(d3.extent(data, d => d.fold_change))
    .range([H - 40, 20]);

  // === KDE ===
  const logVals = data.map(d => Math.log10(d.dose_value));
  const range = d3.extent(logVals);

  const kde = kernelDensityEstimator(
    kernelEpanechnikov(0.4),
    d3.range(range[0], range[1], (range[1]-range[0])/100)
  );

  const density = kde(logVals);

  const densScale = d3.scaleLinear()
    .domain([0, d3.max(density, d => d[1])])
    .range([0, H * 0.25]);
addAxes(svg, x, y, W, H);
  svg.selectAll('.domain, .tick line')
  .attr('stroke', cssVar('--border2'));

svg.selectAll('.tick text')
  .attr('fill', cssVar('--text-dim'));
  svg.append('path')
    .datum(density)
    .attr('fill', cssVar('--elec'))
    .attr('opacity', 0.08)
    .attr('d', d3.area()
      .x(d => x(Math.pow(10, d[0])))
      .y0(H - 40)
      .y1(d => (H - 40) - densScale(d[1]))
      .curve(d3.curveBasis)
    );

  // === points ===
  svg.selectAll('circle')
  .data(data)
  .enter()
  .append('circle')
  .attr('cx', d => x(d.dose_value))
  .attr('cy', d => y(d.fold_change))
  .attr('r', 4.5)
  .attr('fill', d => getColor(d))
  .attr('opacity', 0.7)
  .attr('stroke', d => getColor(d))
  .attr('stroke-width', 0.5)
  .style('cursor', 'pointer')

  // ✅ HOVER SCALE HERE
  .on('mouseover', function (e, d) {
    d3.select(this)
      .attr('r', 7)
      .attr('stroke-width', 1.2);

    showTooltip(e, d);
  })
  .on('mousemove', moveTooltip)
  .on('mouseout', function () {
    d3.select(this)
      .attr('r', 4.5)
      .attr('stroke-width', 0.5);

    hideTooltip();
  });

  // === trend ===
  if (data.length > 10) {
    const trend = localMedian(data, 'dose_value', 'fold_change', 12);

    svg.append('path')
      .datum(trend)
      .attr('fill', 'none')
      .attr('stroke', cssVar('--text'))
      .attr('stroke-width', 2)
      .attr('d', d3.line()
        .x(d => x(d.x))
        .y(d => y(d.y))
        .curve(d3.curveCatmullRom.alpha(0.5))
      );
  }

  // === warning ===
  if (data.length < 15) {
    const warn = document.createElement('div');
    warn.className = 'warn-box visible';
    warn.textContent = `Small sample size (n=${data.length}) — interpret cautiously.`;
    el.appendChild(warn);
  }
}
