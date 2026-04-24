// ── EMBEDDED DATA ─────────────────────────────────────────────────────────────
// ── DATA LOADING ─────────────────────────────────────────────────────────────
// Data is loaded from data.json and dose_data.json at runtime.
// To add new studies, edit data.json (and optionally dose_data.json) and submit a PR.
let MAIN_DATA = [];
let DOSE_DATA = [];

async function loadData() {
  try {
    const [mainResp, doseResp] = await Promise.all([
      fetch('./data.json'),
      fetch('./dose_data.json')
    ]);
    if (!mainResp.ok) throw new Error('Failed to load data.json');
    if (!doseResp.ok) throw new Error('Failed to load dose_data.json');
    MAIN_DATA = await mainResp.json();
    DOSE_DATA = await doseResp.json();
  } catch (err) {
    // Fallback: try loading from same directory (works for file:// and GitHub Pages)
    console.error('Data load error:', err);
    document.body.innerHTML = `<div style="color:#e05d7a;padding:40px;font-family:monospace;background:#0d0f14;min-height:100vh">
      <h2 style="margin-bottom:16px">⚠ Could not load data files</h2>
      <p>Make sure <code>data.json</code> and <code>dose_data.json</code> are in the same directory as <code>index.html</code>.</p>
      <p style="margin-top:12px;opacity:0.6">Error: ${err.message}</p>
    </div>`;
  }
}

// ── STATE ─────────────────────────────────────────────────────────────────────
let allData = [];
let doseType = 'Charge';
let doseOutcome = 'all';
let currentTab = 'scatter';
let includeMixed = false;
let sourceFilter = 'all';
let filters = { modality: new Set(), cell: new Set(), outcome: new Set(), model: new Set(), fcMin: 0, fcMax: 8 };

// ── THEME ─────────────────────────────────────────────────────────────────────
function initTheme() {
  // Respect system preference on first load; user toggle overrides
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = theme === 'dark' ? '☀︎ Light' : '☾ Dark';
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
  redraw(); // D3 reads CSS vars at draw time so needs a redraw
}

// Helper to read current CSS variable value (for D3 which needs explicit colours)
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
const MODALITY_COLOR  = { 'Mechanical': '#4fc3a1', 'Electrical': '#f5845a' };
const OUTCOME_COLOR   = { 'Proliferation': '#7eb8e8', 'Migration': '#c87dd4', 'Morphology': '#e8c97e', 'Viability': '#7ee8a2', 'Unknown': '#555' };
const MODEL_COLOR     = { 'Human in vitro': '#60a5fa', 'Mouse in vitro': '#f97316', 'In vivo': '#a78bfa', 'Unknown': '#444' };
const DOSE_COLORS     = { 'Charge': '#f5845a', 'Energy': '#c9a96e', 'Power': '#4fc3a1' };
const DOSE_UNITS      = { 'Charge': 'µC', 'Energy': 'µJ', 'Power': 'W' };

// ── FILTER ────────────────────────────────────────────────────────────────────
function getFiltered() {
  return allData.filter(d => {
    if (!includeMixed && d.cell_type === 'Mixed') return false;
    if (sourceFilter !== 'all' && d.source !== sourceFilter) return false;
    if (filters.modality.size && !filters.modality.has(d.stim_modality)) return false;
    if (filters.cell.size    && !filters.cell.has(d.cell_type))          return false;
    if (filters.outcome.size && !filters.outcome.has(d.outcome_type))    return false;
    if (filters.model.size   && !filters.model.has(d.model))             return false;
    if (d.fold_change < filters.fcMin || d.fold_change > filters.fcMax)  return false;
    return true;
  });
}

function toggleMixed(cb) {
  includeMixed = cb.checked;
  redraw();
}

function setSource(src, btn) {
  sourceFilter = src;
  document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  redraw();
}

// ── SECURITY HELPERS ─────────────────────────────────────────────────────────
// Safe text setter — never use innerHTML with untrusted data
function setText(el, text) {
  el.textContent = String(text ?? '');
}

// Create an element with safe text content
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = String(text);
  return e;
}

// Validate DOI before opening — must start with known safe prefixes only
function safeOpenDOI(doi) {
  if (!doi || doi === 'nan' || doi === 'None') return;
  const s = String(doi).trim();
  if (/^https?:\/\/(doi\.org|dx\.doi\.org)\//.test(s)) {
    window.open(s, '_blank', 'noopener,noreferrer');
  }
}

// ── TOOLTIP ───────────────────────────────────────────────────────────────────
const tooltip = document.getElementById('tooltip');
function showTip(event, d) {
  const rows = [
    ['Modality',    d.stim_modality || d.dose_type],
    ['Cell type',   d.cell_type],
    ['Outcome',     d.outcome_type],
    ['Fold change', d.fold_change?.toFixed(3)],
    ['Model',       d.model],
    d.stim_type              ? ['Stim type', String(d.stim_type).slice(0,40)]     : null,
    d.frequency_hz    != null ? ['Frequency', d.frequency_hz + ' Hz']             : null,
    d.stim_duration_hrs != null ? ['Duration', d.stim_duration_hrs + ' hrs']      : null,
    d.strain_amplitude_pct != null ? ['Strain', d.strain_amplitude_pct + ' %']    : null,
    d.field_strength_mv_mm != null ? ['Field', d.field_strength_mv_mm + ' mV/mm'] : null,
    d.dose_value != null ? [d.dose_type, d.dose_value.toExponential(3) + ' ' + (DOSE_UNITS[d.dose_type] || '')] : null,
  ].filter(Boolean);

  // Build DOM safely — no innerHTML
  tooltip.textContent = '';

  const title = el('div', 'tt-title', (d.paper || '').slice(0, 80) + (d.paper?.length > 80 ? '…' : ''));
  tooltip.appendChild(title);

  const doiEl = el('div', 'tt-doi', (d.doi || '').slice(0, 60));
  tooltip.appendChild(doiEl);

  rows.forEach(([k, v]) => {
    const row = el('div', 'tt-row');
    row.appendChild(el('span', null, k));
    row.appendChild(el('span', null, v ?? '—'));
    tooltip.appendChild(row);
  });

  tooltip.style.display = 'block';
  moveTip(event);
}
function moveTip(e) {
  tooltip.style.left = Math.min(e.clientX + 14, window.innerWidth - 340) + 'px';
  tooltip.style.top  = Math.min(e.clientY - 10, window.innerHeight - 200) + 'px';
}
function hideTip() { tooltip.style.display = 'none'; }

// ── CHIPS ─────────────────────────────────────────────────────────────────────
function initFilters() {
  const uniq = (key) => [...new Set(allData.map(d => d[key]))].filter(x => x && x !== 'Unknown' && x !== 'Nan' && x !== 'nan');
  buildChips('filter-modality', uniq('stim_modality'), 'modality');
  buildChips('filter-cell',     uniq('cell_type'),     'cell');
  buildChips('filter-outcome',  uniq('outcome_type'),  'outcome');
  buildChips('filter-model',    uniq('model'),         'model');

  const fcVals = allData.map(d => d.fold_change).filter(Boolean);
  const fcMax  = Math.min(Math.ceil(Math.max(...fcVals) * 10) / 10, 8);
  document.getElementById('fc-max').max   = fcMax;
  document.getElementById('fc-max').value = fcMax;
  filters.fcMax = fcMax;
  updateRangeDisplay();

  document.getElementById('fc-min').addEventListener('input', e => { filters.fcMin = +e.target.value; updateRangeDisplay(); redraw(); });
  document.getElementById('fc-max').addEventListener('input', e => { filters.fcMax = +e.target.value; updateRangeDisplay(); redraw(); });
}

function updateRangeDisplay() {
  document.getElementById('fc-min-val').textContent = filters.fcMin.toFixed(1) + '×';
  document.getElementById('fc-max-val').textContent = filters.fcMax.toFixed(1) + '×';
}

function buildChips(id, values, key) {
  const el = document.getElementById(id);
  el.innerHTML = '';
  values.forEach(v => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.textContent = v;
    btn.onclick = () => toggleFilter(key, v, btn);
    el.appendChild(btn);
  });
}

function toggleFilter(key, val, btn) {
  const s = filters[key];
  if (s.has(val)) { s.delete(val); btn.className = 'chip'; }
  else {
    s.add(val);
    if      (key === 'modality' && val === 'Mechanical') btn.className = 'chip active-mech';
    else if (key === 'modality' && val === 'Electrical') btn.className = 'chip active-elec';
    else btn.className = 'chip active';
  }
  redraw();
}

function resetFilters() {
  ['modality','cell','outcome','model'].forEach(k => filters[k].clear());
  filters.fcMin = 0;
  const fcMax = +document.getElementById('fc-max').max;
  filters.fcMax = fcMax;
  document.getElementById('fc-min').value = 0;
  document.getElementById('fc-max').value = fcMax;
  updateRangeDisplay();
  document.querySelectorAll('.chip').forEach(c => c.className = 'chip');
  includeMixed = false;
  document.getElementById('mixed-toggle').checked = false;
  sourceFilter = 'all';
  document.querySelectorAll('.source-btn').forEach(b => b.classList.toggle('active', b.dataset.source === 'all'));
  redraw();
}

// ── STATS ─────────────────────────────────────────────────────────────────────
function makePill(val, label, color) {
  const div = document.createElement('div');
  div.className = 'stat-pill';
  const v = document.createElement('span');
  v.className = 'val';
  v.textContent = String(val);
  if (color) v.style.color = color;
  const l = document.createElement('span');
  l.className = 'lbl';
  l.textContent = label;
  div.appendChild(v);
  div.appendChild(l);
  return div;
}

function updateStats() {
  const f      = getFiltered();
  const mech   = f.filter(d => d.stim_modality === 'Mechanical').length;
  const elecN  = f.filter(d => d.stim_modality === 'Electrical').length;
  const papers = new Set(f.map(d => d.paper)).size;
  const mixedN = allData.filter(d => d.cell_type === 'Mixed').length;
  const commN  = allData.filter(d => d.source && d.source !== 'Burgess2026').length;

  const container = document.getElementById('header-stats');
  container.textContent = '';
  const total = makePill(f.length, 'Conditions'); total.classList.add('total');
  const mechP = makePill(mech, 'Mechanical');      mechP.classList.add('mech');
  const elecP = makePill(elecN, 'Electrical');     elecP.classList.add('elec');
  const pap   = makePill(papers, 'Papers', 'var(--neutral)');
  container.append(total, mechP, elecP, pap);
  if (commN > 0) {
    const c = makePill(commN, 'Community', 'var(--up)');
    c.title = commN + ' community-contributed records';
    container.appendChild(c);
  }
  if (!includeMixed) {
    const m = makePill(mixedN, 'Mixed excl.', 'var(--text-dimmer)');
    m.title = mixedN + ' mixed co-culture records excluded';
    m.querySelector('.val').style.fontSize = '16px';
    container.appendChild(m);
  }
}

// ── TABS ──────────────────────────────────────────────────────────────────────
function showTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.panel').forEach(p => p.classList.add('panel-hidden'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.remove('panel-hidden');
  document.querySelector(`.tab[data-tab="${tab}"]`).classList.add('active');
  redraw();
}

function redraw() {
  updateStats();
  if (currentTab === 'scatter')   drawScatter();
  if (currentTab === 'box')       drawBox();
  if (currentTab === 'freq')      drawFreq();
  if (currentTab === 'duration')  drawDuration();
  if (currentTab === 'dose')      drawDose();
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function svgSetup(el, W, H, M) {
  el.innerHTML = '';
  const w = W - M.l - M.r, h = H - M.t - M.b;
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`);
  const g   = svg.append('g').attr('transform', `translate(${M.l},${M.t})`);
  return { svg, g, w, h };
}

function addGridAndAxes(g, xScale, yScale, w, h, xLabel, yLabel, xTicks, yTicks) {
  const gridColor   = cssVar('--border');
  const axisColor   = cssVar('--border2');
  const textColor   = cssVar('--text-dim');
  const refColor    = cssVar('--border2');

  g.append('g').attr('class','grid').call(d3.axisLeft(yScale).tickSize(-w).tickFormat('').ticks(yTicks||6))
    .selectAll('line').attr('stroke', gridColor).attr('stroke-dasharray','2,4');
  g.select('.grid path').attr('stroke','none');
  g.append('g').attr('class','axis').attr('transform',`translate(0,${h})`).call(d3.axisBottom(xScale).ticks(xTicks||6))
    .selectAll('text').attr('fill', textColor).attr('font-family','var(--mono)').attr('font-size',10);
  g.select('.axis:last-of-type path').attr('stroke', axisColor);
  g.selectAll('.axis:last-of-type line').attr('stroke', axisColor);
  g.append('g').attr('class','axis').call(d3.axisLeft(yScale).ticks(yTicks||6))
    .selectAll('text').attr('fill', textColor).attr('font-family','var(--mono)').attr('font-size',10);
  // Re-style all axis paths/lines
  g.selectAll('.axis path, .axis line').attr('stroke', axisColor);
  g.selectAll('.axis text').attr('fill', textColor).attr('font-family','var(--mono)').attr('font-size','10px');
  // FC=1 reference line
  if (yScale(1) !== undefined) {
    g.append('line').attr('class','ref-line')
      .attr('x1',0).attr('x2',w).attr('y1',yScale(1)).attr('y2',yScale(1))
      .attr('stroke', refColor).attr('stroke-width',1).attr('stroke-dasharray','4,4');
  }
  if (xLabel) g.append('text').attr('x',w/2).attr('y',h+38).attr('text-anchor','middle').attr('fill',textColor).attr('font-size',11).attr('font-family','var(--mono)').text(xLabel);
  if (yLabel) g.append('text').attr('transform','rotate(-90)').attr('x',-h/2).attr('y',-48).attr('text-anchor','middle').attr('fill',textColor).attr('font-size',11).attr('font-family','var(--mono)').text(yLabel);
}

function dotLayer(g, data, cx, cy, color, tip) {
  g.selectAll(null).data(data).enter().append('circle')
    .attr('cx', cx).attr('cy', cy).attr('r', 5)
    .attr('fill', color).attr('fill-opacity', 0.6)
    .attr('stroke', color).attr('stroke-opacity', 0.9).attr('stroke-width', 0.5)
    .style('cursor','pointer')
    .on('mouseover', (e,d) => showTip(e, d))
    .on('mousemove', moveTip).on('mouseout', hideTip)
    .on('click', (e, d) => safeOpenDOI(d.doi));
}

// ── KDE ───────────────────────────────────────────────────────────────────────
function kernelDensityEstimator(kernel, X) {
  return function(V) { return X.map(x => [x, d3.mean(V, v => kernel(x - v))]); };
}
function kernelEpanechnikov(k) {
  return function(v) { return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0; };
}

// LOWESS-style local median for scatter trend
function localMedian(data, xKey, yKey, nBins) {
  if (data.length < 4) return [];
  const sorted = [...data].sort((a,b) => a[xKey] - b[xKey]);
  const binSize = Math.max(3, Math.floor(sorted.length / nBins));
  const result = [];
  for (let i = 0; i < sorted.length - binSize + 1; i += Math.max(1, Math.floor(binSize/2))) {
    const bin = sorted.slice(i, i + binSize);
    const xs  = bin.map(d => d[xKey]);
    const ys  = bin.map(d => d[yKey]).sort(d3.ascending);
    result.push({ x: d3.mean(xs), y: d3.quantile(ys, 0.5) });
  }
  return result;
}

// ── SCATTER ───────────────────────────────────────────────────────────────────
function drawScatter() {
  const data = getFiltered().filter(d => d.stim_duration_hrs != null && d.fold_change != null);
  document.getElementById('scatter-count').textContent = `${data.length} points`;
  const el = document.getElementById('scatter-chart');
  if (!data.length) { emptyState(el, 'No data for current filters'); return; }

  const W = el.offsetWidth||800, H = 420, M = {t:20,r:30,b:50,l:60};
  const {g, w, h} = svgSetup(el, W, H, M);
  const xExt = d3.extent(data, d => d.stim_duration_hrs);
  const yExt = d3.extent(data, d => d.fold_change);
  const xS = d3.scaleLog().domain([Math.max(0.001,xExt[0]*0.8), xExt[1]*1.2]).range([0,w]).clamp(true);
  const yS = d3.scaleLinear().domain([Math.min(0,yExt[0]-0.1), yExt[1]+0.2]).range([h,0]).nice();
  addGridAndAxes(g, xS, yS, w, h, 'Stimulation Duration (hrs, log)', 'Fold Change');

  // Color by MODEL, shape hint by modality
  dotLayer(g, data, d => xS(Math.max(0.001,d.stim_duration_hrs)), d => yS(d.fold_change), d => MODEL_COLOR[d.model]||'#888');

  // Build legend safely
  const legendEl = document.getElementById('scatter-legend');
  legendEl.textContent = '';
  Object.entries(MODEL_COLOR).filter(([k]) => k !== 'Unknown').forEach(([k, c]) => {
    const item = document.createElement('div'); item.className = 'legend-item';
    const dot  = document.createElement('div'); dot.className = 'legend-dot'; dot.style.background = c;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(k));
    legendEl.appendChild(item);
  });
  const hint = document.createElement('div');
  hint.className = 'legend-item';
  hint.style.cssText = 'margin-left:auto;color:var(--text-dimmer);font-size:10px';
  hint.textContent = 'click to open paper';
  legendEl.appendChild(hint);
}

// ── BOX ───────────────────────────────────────────────────────────────────────
function drawBox() {
  const data = getFiltered().filter(d => d.fold_change != null);
  document.getElementById('box-count').textContent = `${data.length} conditions`;
  const el = document.getElementById('box-chart');
  if (!data.length) { emptyState(el, 'No data'); return; }

  const groups = d3.group(data, d => `${d.stim_modality} · ${d.outcome_type}`);
  const keys   = [...groups.keys()].sort();
  const W = el.offsetWidth||800, H = 440, M = {t:20,r:30,b:95,l:60};
  const {g, w, h} = svgSetup(el, W, H, M);
  const xS = d3.scaleBand().domain(keys).range([0,w]).padding(0.3);
  const allFc = data.map(d => d.fold_change).sort(d3.ascending);
  const yS = d3.scaleLinear().domain([d3.quantile(allFc,0.01)-0.1, d3.quantile(allFc,0.99)+0.2]).range([h,0]).nice();
  addGridAndAxes(g, xS, yS, w, h, null, 'Fold Change');
  g.select('.axis:nth-of-type(1)').selectAll('text').attr('transform','rotate(-30)').attr('text-anchor','end').attr('dy','0.35em');

  keys.forEach(k => {
    const vals = groups.get(k).map(d => d.fold_change).sort(d3.ascending);
    if (vals.length < 2) return;
    const color = MODALITY_COLOR[k.split(' · ')[0]] || '#888';
    const bx = xS(k) + xS.bandwidth()/2, bw = xS.bandwidth()*0.5;
    const q1 = d3.quantile(vals,0.25), q3 = d3.quantile(vals,0.75), med = d3.quantile(vals,0.5);
    const iqr = q3-q1, lo = Math.max(vals[0], q1-1.5*iqr), hi = Math.min(vals[vals.length-1], q3+1.5*iqr);

    g.append('line').attr('x1',bx).attr('x2',bx).attr('y1',yS(lo)).attr('y2',yS(hi)).attr('stroke',color).attr('stroke-opacity',0.5).attr('stroke-width',1.5);
    g.append('rect').attr('x',bx-bw/2).attr('y',yS(q3)).attr('width',bw).attr('height',yS(q1)-yS(q3)).attr('fill',color).attr('fill-opacity',0.18).attr('stroke',color).attr('stroke-opacity',0.7).attr('stroke-width',1.2).attr('rx',2);
    g.append('line').attr('x1',bx-bw/2).attr('x2',bx+bw/2).attr('y1',yS(med)).attr('y2',yS(med)).attr('stroke',color).attr('stroke-width',2.5);
    g.selectAll(null).data(vals).enter().append('circle')
      .attr('cx', () => bx+(Math.random()-0.5)*xS.bandwidth()*0.35).attr('cy', v => yS(v)).attr('r',2.5).attr('fill',color).attr('fill-opacity',0.4);
    g.append('text').attr('x',bx).attr('y',yS(hi)-6).attr('text-anchor','middle').attr('fill',cssVar('--text-dimmer')).attr('font-size',9).attr('font-family','var(--mono)').text(`n=${vals.length}`);
  });
}

// ── FREQ ──────────────────────────────────────────────────────────────────────
function drawFreq() {
  const data = getFiltered().filter(d => d.frequency_hz!=null && d.frequency_hz>0 && d.fold_change!=null);
  document.getElementById('freq-count').textContent = `${data.length} points`;
  const el = document.getElementById('freq-chart');
  if (!data.length) { emptyState(el, 'No frequency data'); return; }

  const W = el.offsetWidth||800, H = 420, M = {t:20,r:30,b:50,l:60};
  const {g, w, h} = svgSetup(el, W, H, M);
  const xExt = d3.extent(data, d => d.frequency_hz);
  const yExt = d3.extent(data, d => d.fold_change);
  const xS = d3.scaleLog().domain([xExt[0]*0.7, xExt[1]*1.5]).range([0,w]).clamp(true);
  const yS = d3.scaleLinear().domain([Math.min(0,yExt[0]-0.1), yExt[1]+0.2]).range([h,0]).nice();
  addGridAndAxes(g, xS, yS, w, h, 'Frequency (Hz, log scale)', 'Fold Change');

  dotLayer(g, data, d => xS(d.frequency_hz), d => yS(d.fold_change), d => OUTCOME_COLOR[d.outcome_type]||'#888');

  const freqLeg = document.getElementById('freq-legend');
  freqLeg.textContent = '';
  Object.entries(OUTCOME_COLOR).filter(([k]) => k !== 'Unknown').forEach(([k, c]) => {
    const item = document.createElement('div'); item.className = 'legend-item';
    const dot  = document.createElement('div'); dot.className = 'legend-dot'; dot.style.background = c;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(k));
    freqLeg.appendChild(item);
  });
}

// ── DURATION ──────────────────────────────────────────────────────────────────
function drawDuration() {
  const data = getFiltered().filter(d => d.stim_duration_hrs!=null && d.stim_duration_hrs>0 && d.fold_change!=null);
  document.getElementById('dur-count').textContent = `${data.length} points`;
  const el = document.getElementById('dur-chart');
  if (!data.length) { emptyState(el, 'No data'); return; }

  const W = el.offsetWidth||800, H = 420, M = {t:20,r:30,b:50,l:60};
  const {g, w, h} = svgSetup(el, W, H, M);
  const xExt = d3.extent(data, d => d.stim_duration_hrs);
  const yExt = d3.extent(data, d => d.fold_change);
  const xS = d3.scaleLog().domain([Math.max(0.001,xExt[0]*0.7), xExt[1]*1.3]).range([0,w]).clamp(true);
  const yS = d3.scaleLinear().domain([Math.min(0,yExt[0]-0.1), yExt[1]+0.2]).range([h,0]).nice();
  addGridAndAxes(g, xS, yS, w, h, 'Stimulation Duration (hrs, log scale)', 'Fold Change');

  const byOutcome = d3.group(data, d => d.outcome_type);
  byOutcome.forEach((pts, ot) => {
    const color = OUTCOME_COLOR[ot]||'#888';
    dotLayer(g, pts, d => xS(d.stim_duration_hrs), d => yS(d.fold_change), () => color);
  });

  const durLeg = document.getElementById('dur-legend');
  durLeg.textContent = '';
  Object.entries(OUTCOME_COLOR).filter(([k]) => k !== 'Unknown').forEach(([k, c]) => {
    const item = document.createElement('div'); item.className = 'legend-item';
    const dot  = document.createElement('div'); dot.className = 'legend-dot'; dot.style.background = c;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(k));
    durLeg.appendChild(item);
  });
}

// ── DOSE RESPONSE ─────────────────────────────────────────────────────────────
function setDoseType(type, btn) {
  doseType = type;
  document.querySelectorAll('[data-dose]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  drawDose();
}
function setDoseOutcome(o, btn) {
  doseOutcome = o;
  document.querySelectorAll('[data-outcome-dose]').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  drawDose();
}

// Low-n threshold below which trend line is suppressed
const LOW_N_TREND = 10;
const LOW_N_WARN  = 15;

// Safe empty state builder
function emptyState(el, msg) {
  el.textContent = '';
  const d = document.createElement('div'); d.className = 'empty-state';
  const s = document.createElement('span'); s.className = 'big'; s.textContent = '∅';
  const t = document.createElement('span'); t.textContent = msg;
  d.appendChild(s); d.appendChild(t);
  el.appendChild(d);
}

function drawDose() {
  let data = DOSE_DATA.filter(d => d.dose_type === doseType);
  if (doseOutcome !== 'all') data = data.filter(d => d.outcome_type === doseOutcome);
  if (sourceFilter !== 'all') data = data.filter(d => d.source === sourceFilter);
  document.getElementById('dose-count').textContent = `${data.length} points`;

  // ── Low-n warning (safe DOM) ──
  const warnEl = document.getElementById('dose-warn');
  const byGroup = d3.group(data, d => d.outcome_type);
  const smallGroups = [...byGroup.entries()].filter(([, pts]) => pts.length < LOW_N_WARN);
  if (data.length < LOW_N_WARN || smallGroups.length > 0) {
    warnEl.textContent = '';
    const msgs = smallGroups.map(([ot, pts]) => ot + ' (n=' + pts.length + ')');
    const overall = data.length < LOW_N_WARN ? 'Overall n=' + data.length + '. ' : '';
    warnEl.appendChild(document.createTextNode('⚠ '));
    const strong = document.createElement('strong'); strong.textContent = 'Small sample:'; warnEl.appendChild(strong);
    warnEl.appendChild(document.createTextNode(' ' + overall + (msgs.length ? msgs.join(', ') + ' — ' : '') +
      'trend lines suppressed below n=' + LOW_N_TREND + ' per group. The paper (Burgess et al. 2026) reports Adj. R²=0.02–0.35 for these metrics; no single dose descriptor reliably predicts cell response. Interpret smoothing with caution.'));
    warnEl.classList.add('visible');
  } else {
    warnEl.classList.remove('visible');
  }

  // ── Update note (safe DOM) ──
  const units = DOSE_UNITS[doseType];
  const r2Map = {
    Charge: 'Adj. R²=0.02 (fibroblast prolif), 0.06 (fib migration), 0.35 (ker migration)',
    Energy: 'Adj. R²=0.06 (fibroblast prolif), 0.09 (fib migration)',
    Power:  'Adj. R²=0.09 (fibroblast prolif), 0.26 (fib migration)'
  };
  const noteTextMap = {
    Charge: ['Charge (' + units + '):', ' Total charge = current × pulse duration × frequency × time. Spans ~10⁻³–10⁴ µC across the literature. Despite the wide range, ' + r2Map.Charge + ' — suggesting charge alone does not capture the full electrochemical context.'],
    Energy: ['Energy (' + units + '):', ' Electrical energy per session = power × time. Spans ~0.02–700 µJ. ' + r2Map.Energy + '. Very low energies can still elicit responses in TENG/photovoltaic paradigms where the delivery waveform differs fundamentally from conventional DC.'],
    Power:  ['Power (W):', ' Instantaneous power = voltage × current. Dynamic range spans nW to mW — TENG and photovoltaic devices cluster at nW, conventional ES at µW–mW. ' + r2Map.Power + '. The 6-order-of-magnitude range makes the log x-axis essential; comparable fold-changes appear at vastly different power levels.'],
  };
  const noteEl = document.getElementById('dose-note');
  noteEl.textContent = '';
  const [noteLabel, noteBody] = noteTextMap[doseType];
  const noteStrong = document.createElement('strong'); noteStrong.textContent = noteLabel;
  noteEl.appendChild(noteStrong);
  noteEl.appendChild(document.createTextNode(noteBody));

  const el = document.getElementById('dose-chart');
  if (!data.length) { emptyState(el, 'No data for this selection'); return; }

  const color = DOSE_COLORS[doseType];
  const W = el.offsetWidth||800, H = 440, M = {t:30,r:120,b:55,l:65};
  const {g, w, h} = svgSetup(el, W, H, M);

  const xExt = d3.extent(data, d => d.dose_value);
  const yExt = d3.extent(data, d => d.fold_change);
  const xS = d3.scaleLog().domain([xExt[0]*0.5, xExt[1]*2]).range([0,w]).clamp(true);
  const yS = d3.scaleLinear().domain([Math.min(0.5, yExt[0]-0.05), yExt[1]+0.15]).range([h,0]).nice();

  addGridAndAxes(g, xS, yS, w, h, `${doseType} (${units}, log scale)`, 'Fold Change');

  // ── KDE on log-transformed x ──
  const logVals   = data.map(d => Math.log10(d.dose_value));
  const logRange  = d3.extent(logVals);
  const bandwidth = Math.max(0.3, (logRange[1]-logRange[0]) / 5);
  const kde       = kernelDensityEstimator(kernelEpanechnikov(bandwidth), d3.range(logRange[0], logRange[1], (logRange[1]-logRange[0])/120));
  const density   = kde(logVals);
  const densMax   = d3.max(density, d => d[1]);
  const densScale = d3.scaleLinear().domain([0, densMax]).range([0, h * 0.28]);

  // Rug plot
  g.selectAll('.rug').data(data).enter().append('line')
    .attr('class','rug')
    .attr('x1', d => xS(d.dose_value)).attr('x2', d => xS(d.dose_value))
    .attr('y1', h+12).attr('y2', h+20)
    .attr('stroke', color).attr('stroke-opacity', 0.5).attr('stroke-width', 1.2);

  // KDE density curve
  const kdeArea = d3.area().x(d => xS(Math.pow(10,d[0]))).y0(h).y1(d => h - densScale(d[1])).curve(d3.curveBasis);
  const kdeLine = d3.line().x(d => xS(Math.pow(10,d[0]))).y(d => h - densScale(d[1])).curve(d3.curveBasis);
  g.append('path').datum(density).attr('d', kdeArea).attr('fill', color).attr('fill-opacity', 0.07);
  g.append('path').datum(density).attr('d', kdeLine).attr('fill','none').attr('stroke', color).attr('stroke-opacity', 0.4).attr('stroke-width', 1.5).attr('stroke-dasharray','4,3');

  // ── Per-outcome scatter + conditional trend ──
  const outcomeKeys  = [...byGroup.keys()];
  const trendColors  = outcomeKeys.length > 1 ? { Proliferation: '#7eb8e8', Migration: '#c87dd4' } : { [outcomeKeys[0]]: color };

  outcomeKeys.forEach(ot => {
    const pts    = byGroup.get(ot).map(d => ({ x: d.dose_value, y: d.fold_change, ...d }));
    const tColor = trendColors[ot] || color;

    g.selectAll(null).data(pts).enter().append('circle')
      .attr('cx', d => xS(d.x)).attr('cy', d => yS(d.y))
      .attr('r', 5.5)
      .attr('fill', tColor).attr('fill-opacity', 0.65)
      .attr('stroke', tColor).attr('stroke-opacity', 0.9).attr('stroke-width', 0.5)
      .style('cursor','pointer')
      .on('mouseover', (e,d) => showTip(e, d))
      .on('mousemove', moveTip).on('mouseout', hideTip)
      .on('click', (e, d) => safeOpenDOI(d.doi));

    // Only draw rolling median if enough data — below threshold it overfits badly
    if (pts.length >= LOW_N_TREND) {
      const nBins = Math.min(12, Math.floor(pts.length / 2));
      const trend = localMedian(pts, 'x', 'y', nBins);
      if (trend.length >= 2) {
        const line = d3.line().x(d => xS(d.x)).y(d => yS(d.y)).curve(d3.curveCatmullRom.alpha(0.5));
        g.append('path').datum(trend).attr('d', line).attr('fill','none').attr('stroke', tColor).attr('stroke-width', 2.2).attr('stroke-opacity', 0.85);
      }
    }
  });

  // ── Legend ──
  const legX = w + 18, legY = 10;
  const legendItems = [
    [color, 'Dose density (KDE)', '4,3'],
    ...outcomeKeys.map(ot => {
      const c = trendColors[ot] || color;
      const n = byGroup.get(ot).length;
      const hasTrend = n >= LOW_N_TREND;
      return [c, `${ot} (n=${n})${hasTrend ? ' + median' : ''}`, 'none'];
    })
  ];
  legendItems.forEach(([c, label, dash], i) => {
    g.append('line').attr('x1',legX).attr('x2',legX+18).attr('y1',legY+i*18+5).attr('y2',legY+i*18+5)
      .attr('stroke',c).attr('stroke-width',i===0?1.5:2.2).attr('stroke-dasharray',dash);
    g.append('text').attr('x',legX+24).attr('y',legY+i*18+9)
      .attr('fill', cssVar('--text-dim')).attr('font-size',10).attr('font-family','var(--mono)').text(label);
  });
}

// ── EVENT DELEGATION ─────────────────────────────────────────────────────────
// All interactive elements use data-action attributes; no inline handlers.
document.addEventListener('click', function(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;

  if (action === 'tab') {
    showTab(t.dataset.tab);
  } else if (action === 'dose-type') {
    doseType = t.dataset.dose;
    document.querySelectorAll('[data-dose]').forEach(b => b.classList.remove('active'));
    t.classList.add('active');
    drawDose();
  } else if (action === 'dose-outcome') {
    doseOutcome = t.dataset.outcomeDose;
    document.querySelectorAll('[data-outcome-dose]').forEach(b => b.classList.remove('active'));
    t.classList.add('active');
    drawDose();
  } else if (action === 'source') {
    sourceFilter = t.dataset.source;
    document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
    t.classList.add('active');
    redraw();
  } else if (action === 'reset') {
    resetFilters();
  } else if (action === 'theme') {
    toggleTheme();
  } else if (action === 'upload-trigger') {
    document.getElementById('file-input').click();
  }
});

document.addEventListener('change', function(e) {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  if (t.dataset.action === 'mixed-toggle') {
    toggleMixed(t);
  }
});

// ── FILE UPLOAD ───────────────────────────────────────────────────────────────
document.getElementById('file-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const raw = JSON.parse(ev.target.result);
      if (!Array.isArray(raw)) throw new Error('Expected a JSON array');
      // Validate each record has minimum required fields; reject anything suspicious
      const ALLOWED_KEYS = new Set(['stim_modality','paper','doi','source','cell_type','model','species',
        'stim_type','waveform','electrode_material','outcome_raw','outcome_type','fold_change',
        'frequency_hz','pulse_duration_ms','stim_duration_hrs','strain_amplitude_pct',
        'displacement_um','substrate_stiffness_kpa','field_strength_mv_mm','voltage_v']);
      const incoming = raw.filter(d => {
        if (typeof d !== 'object' || d === null) return false;
        if (typeof d.fold_change !== 'number') return false;
        if (typeof d.doi !== 'string') return false;
        // Strip any keys not in the allowed set (defence-in-depth)
        Object.keys(d).forEach(k => { if (!ALLOWED_KEYS.has(k)) delete d[k]; });
        return true;
      });
      // Tag untagged records as community
      incoming.forEach(d => { if (!d.source) d.source = 'community'; });
      const existing = new Set(allData.map(d => d.doi + '||' + d.outcome_raw));
      const newRecs  = incoming.filter(d => !existing.has(d.doi + '||' + d.outcome_raw));
      allData = [...allData, ...newRecs];
      const skipped = incoming.length - newRecs.length;
      alert('Loaded ' + incoming.length + ' valid records. ' + newRecs.length + ' new, ' + skipped + ' duplicates skipped.');
      initFilters(); redraw();
    } catch(err) { alert('Error parsing JSON. Make sure the file is a valid data.json from this project.'); }
  };
  reader.readAsText(file);
  this.value = '';
});

// ── BOOT ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  document.getElementById('header-stats').innerHTML = '<div style="color:var(--text-dim);font-size:12px">Loading data…</div>';
  await loadData();
  allData = [...MAIN_DATA];
  initFilters();
  redraw();
});
window.addEventListener('resize', redraw);
