import { normalizeRuns, filterRuns, analyzeHR, referencePrediction } from './hr-model.mjs';
import { formatPace } from './run-metrics.mjs';

export function initHRAnalysis() {
  const el = id => document.getElementById(`hr-${id}`);
  let normalized, start, end, model, charts = [], excluded = new Set();
  const date = time => new Date(time).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  function clear() { charts.forEach(c => c.destroy()); charts = []; el('results').hidden = true; }
  function draw() {
    clear();
    if (!model || model.error) return;
    const speed = Number(el('reference').value);
    const p = referencePrediction(model, speed), pace = formatPace(1609.344 / speed / 60);
    const direction = model.direction === 'none' ? 'No clear change detected.' : model.direction === 'uncertain' ? 'Trend uncertain; avoid a directional conclusion.' : `Estimated HR ${model.direction === 'decrease' ? 'decreased' : 'increased'} at this fixed pace.`;
    el('summary').textContent = `${date(model.first)} – ${date(model.last)} · ${pace}/mile reference · estimated ${p.baseline.toFixed(1)} → ${p.current.toFixed(1)} BPM · change ${p.change.toFixed(1)} BPM · HR reduction ${p.reduction.toFixed(1)}%. ${direction}`;
    el('quality').textContent = `${model.rows.length} runs across ${model.weeks} weeks. ${model.ci ? `95% weekly-block bootstrap interval for HR change: ${model.ci[0].toFixed(1)} to ${model.ci[1].toFixed(1)} BPM.` : 'Not enough weekly blocks for a reliable uncertainty interval.'} Residual error: ${model.fit.rmse.toFixed(1)} BPM. ${model.influential} influential runs; ${model.sensitive ? 'trend is sensitive to their exclusion.' : 'no material trend sensitivity detected.'} ${model.fit.beta[1] <= 0 ? 'Unexpected nonpositive speed effect; interpret cautiously.' : ''}`;
    el('results').hidden = false;
    const common = () => ({ responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#cbd5e1' } } },
      scales: { x: { type: 'linear', ticks: { color: '#94a3b8', maxTicksLimit: 4, callback: date } }, y: { title: { display: true, text: 'Heart rate (BPM)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: '#334155' } } } });
    const adjusted = model.rows.map(r => ({ x: r.time, y: r.hr - model.fit.beta[1] * (r.speed - speed), name: r.name }));
    const options = common();
    options.plugins.tooltip = { callbacks: { title: items => date(items[0].raw.x), label: item => `${item.dataset.label}: ${item.parsed.y.toFixed(1)} BPM${item.raw.name ? ` · ${item.raw.name}` : ''}` } };
    charts.push(new Chart(el('adjusted-chart'), { type: 'scatter', data: { datasets: [
      { label: 'Adjusted observations (model-based)', data: adjusted, backgroundColor: '#38bdf877', pointRadius: 3 },
      { type: 'line', label: 'Estimated trend', data: Array.from({ length: 25 }, (_, i) => { const x = model.first + (model.last - model.first) * i / 24; return { x, y: model.fit.predict(speed, x) }; }), borderColor: '#f59e0b', pointRadius: 0 },
    ] }, options }));
    const scatterOptions = common();
    scatterOptions.scales.x = { type: 'linear', reverse: true, title: { display: true, text: 'Moving pace (min/mile) · faster →', color: '#94a3b8' }, ticks: { color: '#94a3b8', callback: formatPace } };
    scatterOptions.plugins.tooltip = { callbacks: { title: items => `${date(items[0].raw.time)} · ${items[0].raw.name}`, label: item => { const r = item.raw; return [`${formatPace(r.x)} /mile · ${r.y.toFixed(0)} BPM`, `${(r.distance / 1609.344).toFixed(1)} miles`, ...(r.elevation !== null ? [`Elevation gain: ${r.elevation} m`] : []), ...(r.temperature !== null ? [`Temperature: ${r.temperature} °C`] : [])]; } } };
    charts.push(new Chart(el('pace-chart'), { type: 'scatter', data: { datasets: [{ label: 'Recorded runs', data: model.rows.map(r => ({ ...r, x: 1609.344 / r.speed / 60, y: r.hr })), pointRadius: 4,
      backgroundColor: model.rows.map(r => `hsl(${210 - 175 * (r.time - model.first) / (model.last - model.first)} 85% 60%)`) }] }, options: scatterOptions }));
  }
  function calculate() {
    clear();
    if (!normalized) return;
    const minutes = Number(el('minutes').value), minMiles = Number(el('distance-min').value), maxMiles = el('distance-max').value === '' ? Infinity : Number(el('distance-max').value), minCount = Number(el('count').value);
    if (![minutes, minMiles, minCount].every(Number.isFinite) || Number.isNaN(maxMiles) || minutes < 0 || minMiles < 0 || maxMiles < minMiles || !Number.isInteger(minCount) || minCount < 20) { el('status').textContent = 'Check filters: nonnegative duration/distance, maximum ≥ minimum, and at least 20 runs.'; return; }
    const rows = filterRuns(normalized.rows, { start, end, minutes, minMiles, maxMiles, treadmill: el('environment').value === 'treadmill', excludeTrail: el('trail').checked, excludeRace: el('race').checked, excludeIntervals: el('intervals').checked, excluded });
    model = analyzeHR(rows, { minCount, start, end });
    el('status').textContent = `${rows.length} of ${normalized.rows.length} valid runs included; ${normalized.invalid} records excluded for invalid/missing required data. ${rows.filter(r => r.paused === null).length} included runs have unknown pause duration. ${model.error || ''}`;
    if (model.error) return;
    const select = el('reference'); select.replaceChildren();
    for (let i = 0; i <= 20; i++) {
      const speed = i === 10 ? model.reference : model.low + (model.high - model.low) * i / 20;
      const option = document.createElement('option'); option.value = String(speed); option.textContent = `${formatPace(1609.344 / speed / 60)}/mile${i === 10 ? ' (training median, bounded)' : ''}`; option.selected = i === 10; select.append(option);
    }
    draw();
  }
  el('filters').addEventListener('change', calculate);
  el('reference').addEventListener('change', draw);
  return {
    loading() { clear(); normalized = null; el('exclusions').replaceChildren(); el('status').textContent = 'Loading running records…'; },
    error(message) { clear(); normalized = null; el('status').textContent = `Could not load HR analysis: ${message}`; },
    setRuns(activities, from, to) {
      normalized = normalizeRuns(activities); start = from; end = to; excluded = new Set();
      const list = el('exclusions'); list.replaceChildren();
      for (const row of normalized.rows) {
        const label = document.createElement('label'); label.className = 'flex gap-2 items-center py-1';
        const input = document.createElement('input'); input.type = 'checkbox';
        input.addEventListener('change', () => { if (input.checked) excluded.add(row.id); else excluded.delete(row.id); calculate(); });
        label.append(input, document.createTextNode(`${row.date} · ${row.name} · ${(row.distance / 1609.344).toFixed(1)} mi`)); list.append(label);
      }
      calculate();
    },
  };
}
