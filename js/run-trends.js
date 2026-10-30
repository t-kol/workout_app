import { supabase } from './supabaseclient.js';
import { completedWeeks } from './mileage.mjs';
import { runPoints, formatPace } from './run-metrics.mjs';

export function initRunTrends() {
  const range = document.getElementById('run-trends-range');
  const overlay = document.getElementById('run-trends-pace');
  const refresh = document.getElementById('refresh-run-trends');
  const status = document.getElementById('run-trends-status');
  const container = document.getElementById('run-trends-container');
  let chart, loading = false, loaded = false;
  const dateLabel = value => new Date(value).toLocaleDateString(undefined, {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  });
  function updateOverlay() {
    if (!chart) return;
    chart.data.datasets[1].hidden = !overlay.checked;
    chart.options.scales.pace.display = overlay.checked;
    chart.update();
  }
  async function load() {
    if (loading) return;
    loading = true;
    range.disabled = refresh.disabled = true;
    container.hidden = true;
    status.textContent = 'Loading running cadence and pace…';
    try {
      const weeks = completedWeeks(new Date(), Number(range.value));
      const startDate = weeks[0].start, endDate = weeks.at(-1).end;
      const activities = [], pages = new Set();
      let start = 0;
      while (true) {
        const { data, error } = await supabase.functions.invoke('garmin_sync', {
          body: { mode: 'activities', activityType: 'running', startDate, endDate, start },
        });
        if (error) {
          const detail = error.context instanceof Response ? await error.context.json().catch(() => null) : null;
          throw new Error(detail?.error || error.message);
        }
        if (data?.version !== 3 || data.activityType !== 'running' || !Array.isArray(data.activities)) {
          throw new Error('Deploy the latest garmin_sync Edge Function and refresh.');
        }
        if (!data.activities.length) break;
        const signature = JSON.stringify(data.activities.map(run => run.activityId));
        if (pages.has(signature)) throw new Error('Garmin repeated a page; please retry.');
        pages.add(signature);
        activities.push(...data.activities);
        start += data.activities.length;
        status.textContent = `Loading running trends… ${start} runs received.`;
        if (pages.size >= 200) throw new Error('History exceeded the page limit. Choose a shorter range.');
      }
      const points = runPoints(activities, startDate, endDate);
      chart?.destroy();
      container.hidden = false;
      chart = new Chart(document.getElementById('run-trends-chart'), {
        type: 'scatter',
        data: { datasets: [
          { label: 'Average cadence', data: points.cadence, yAxisID: 'cadence', backgroundColor: '#f59e0b', pointRadius: 4, pointHoverRadius: 6, showLine: false },
          { label: 'Average pace', data: points.pace, yAxisID: 'pace', backgroundColor: '#38bdf8', pointStyle: 'rectRot', pointRadius: 4, pointHoverRadius: 6, showLine: false, hidden: !overlay.checked },
        ] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#cbd5e1' }, onClick: () => {} },
            tooltip: { callbacks: {
              title: items => `${dateLabel(items[0].raw.x)} · ${items[0].raw.name}`,
              label: item => item.dataset.yAxisID === 'pace' ? `Average pace: ${formatPace(item.parsed.y)} min/mi` : `Average cadence: ${item.parsed.y.toFixed(1)} steps/min`,
            } },
          },
          scales: {
            x: { type: 'linear', min: Date.parse(`${startDate}T00:00:00Z`), max: Date.parse(`${endDate}T23:59:59Z`),
              ticks: { maxTicksLimit: 5, maxRotation: 0, color: '#94a3b8', callback: dateLabel }, grid: { color: '#334155' } },
            cadence: { type: 'linear', position: 'left', title: { display: true, text: 'Cadence (steps/min)', color: '#f59e0b' }, ticks: { color: '#f59e0b' }, grid: { color: '#334155' } },
            pace: { type: 'linear', position: 'right', display: overlay.checked, reverse: true,
              title: { display: true, text: 'Pace (min/mile) · faster ↑', color: '#38bdf8' },
              ticks: { color: '#38bdf8', callback: formatPace }, grid: { drawOnChartArea: false } },
          },
        },
      });
      status.textContent = `${dateLabel(Date.parse(startDate))} – ${dateLabel(Date.parse(endDate))} · ${points.runs} runs · ${points.cadence.length} cadence readings · ${points.pace.length} pace readings. Missing values are omitted. Uses completed Sunday–Saturday weeks; excludes this partial week.${points.invalidDates ? ` ${points.invalidDates} records omitted for invalid dates.` : ''}${!points.runs ? ' No runs found.' : !points.cadence.length ? ' Garmin returned no cadence for these runs; enable the pace overlay to see available pace.' : ''}`;
      loaded = true;
    } catch (error) {
      loaded = false;
      container.hidden = true;
      status.textContent = `Could not load running trends: ${error.message}`;
    } finally {
      loading = false;
      range.disabled = refresh.disabled = false;
    }
  }
  document.getElementById('tab-statistics').addEventListener('click', () => { if (!loaded) load(); });
  range.addEventListener('change', () => { loaded = false; load(); });
  refresh.addEventListener('click', load);
  overlay.addEventListener('change', updateOverlay);
}
