import { supabase } from './supabaseclient.js';
import { completedWeeks } from './mileage.mjs';
import { runPoints, formatPace } from './run-metrics.mjs';
import { initHRAnalysis } from './hr-analysis.js';

export function initRunTrends() {
  const hrAnalysis = initHRAnalysis();
  const range = document.getElementById('run-trends-range');
  const refresh = document.getElementById('refresh-run-trends');
  const status = document.getElementById('run-trends-status');
  const container = document.getElementById('run-trends-container');
  let charts = [], loading = false, loaded = false;
  const dateLabel = value => new Date(value).toLocaleDateString(undefined, {
    timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric',
  });
  async function load() {
    if (loading) return;
    loading = true;
    range.disabled = refresh.disabled = true;
    container.hidden = true;
    status.textContent = 'Loading running cadence and pace…';
    hrAnalysis.loading();
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
      hrAnalysis.setRuns(activities, startDate, endDate);
      charts.forEach(chart => chart.destroy());
      charts = [];
      container.hidden = false;
      document.getElementById('run-cadence-empty').hidden = points.cadence.length > 0;
      document.getElementById('run-pace-empty').hidden = points.pace.length > 0;
      for (const metric of ['cadence', 'pace']) {
        const isPace = metric === 'pace';
        const color = isPace ? '#38bdf8' : '#f59e0b';
        charts.push(new Chart(document.getElementById(isPace ? 'run-pace-chart' : 'run-trends-chart'), {
        type: 'scatter',
        data: { datasets: [
          { label: isPace ? 'Average pace' : 'Average cadence', data: points[metric], backgroundColor: color, pointRadius: 4, pointHoverRadius: 6, showLine: false },
        ] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#cbd5e1' }, onClick: () => {} },
            tooltip: { callbacks: {
              title: items => `${dateLabel(items[0].raw.x)} · ${items[0].raw.name}`,
              label: item => isPace ? `Average pace: ${formatPace(item.parsed.y)} min/mi` : `Average cadence: ${item.parsed.y.toFixed(1)} steps/min`,
            } },
          },
          scales: {
            x: { type: 'linear', min: Date.parse(`${startDate}T00:00:00Z`), max: Date.parse(`${endDate}T23:59:59Z`),
              ticks: { maxTicksLimit: 5, maxRotation: 0, color: '#94a3b8', callback: dateLabel }, grid: { color: '#334155' } },
            y: { type: 'linear', position: 'left', reverse: isPace,
              title: { display: true, text: isPace ? 'Pace (min/mile) · faster ↑' : 'Cadence (steps/min)', color },
              ticks: { color, ...(isPace ? { callback: formatPace } : {}) }, grid: { color: '#334155' } },
          },
        },
        }));
      }
      status.textContent = `${dateLabel(Date.parse(startDate))} – ${dateLabel(Date.parse(endDate))} · ${points.runs} runs · ${points.cadence.length} cadence readings · ${points.pace.length} pace readings. Missing values are omitted. Uses completed Sunday–Saturday weeks; excludes this partial week.${points.invalidDates ? ` ${points.invalidDates} records omitted for invalid dates.` : ''}${!points.runs ? ' No runs found.' : ''}`;
      loaded = true;
    } catch (error) {
      loaded = false;
      container.hidden = true;
      status.textContent = `Could not load running trends: ${error.message}`;
      hrAnalysis.error(error.message);
    } finally {
      loading = false;
      range.disabled = refresh.disabled = false;
    }
  }
  document.getElementById('tab-statistics').addEventListener('click', () => { if (!loaded) load(); });
  range.addEventListener('change', () => { loaded = false; load(); });
  refresh.addEventListener('click', load);
}
