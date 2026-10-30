import { supabase } from './js/supabaseclient.js';
import { completedWeeks, summarizeMileage } from './js/mileage.mjs';

export function initStatistics() {
  let chart;
  let loading = false;
  let loaded = false;
  const status = document.getElementById('mileage-status');
  const refresh = document.getElementById('refresh-mileage');
  const format = date => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  async function load() {
    if (loading) return;
    loading = true;
    refresh.disabled = true;
    document.getElementById('mileage-chart-container').hidden = true;
    document.getElementById('mileage-details').hidden = true;
    document.getElementById('mileage-summary').textContent = '';
    status.textContent = 'Loading Garmin running history…';
    try {
      const weeks = completedWeeks();
      const activities = [];
      let start = 0;
      const seenPages = new Set();
      while (true) {
        const { data, error } = await supabase.functions.invoke('garmin_sync', {
          body: { mode: 'activities', start, startDate: weeks[0].start, endDate: weeks.at(-1).end },
        });
        if (error) {
          let message = error.message;
          if (error.context instanceof Response) {
            const detail = await error.context.json().catch(() => null);
            message = detail?.error || message;
          }
          throw new Error(message);
        }
        if (data?.version !== 2 || !Array.isArray(data.activities)) {
          throw new Error('Deploy the updated garmin_sync function from supabase/functions/garmin_sync/index.ts, then refresh.');
        }
        if (!data.activities.length) break;
        const signature = JSON.stringify(data.activities.map(a => a.activityId));
        if (seenPages.has(signature)) throw new Error('Garmin repeated a page; history is incomplete. Please retry.');
        seenPages.add(signature);
        activities.push(...data.activities);
        start += data.activities.length;
        status.textContent = `Loading history… ${start} running activities received.`;
        // Continue until an empty page, even if Garmin caps the requested page size.
        if (seenPages.size >= 200) throw new Error('History exceeded the page limit.');
      }
      const result = summarizeMileage(activities, weeks);
      if (result.invalid) throw new Error(`${result.invalid} activities have missing dates or distances; cannot calculate a reliable average.`);
      chart?.destroy();
      document.getElementById('mileage-chart-container').hidden = false;
      chart = new Chart(document.getElementById('myChart'), {
        type: 'bar',
        data: {
          labels: weeks.map(w => format(w.start)),
          datasets: [
            { label: 'Running miles', data: result.miles, backgroundColor: '#f59e0b', borderRadius: 3 },
            { type: 'line', label: '52-week average', data: weeks.map(() => result.average),
              borderColor: '#38bdf8', borderDash: [6, 4], borderWidth: 2, pointRadius: 0 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: { labels: { color: '#cbd5e1' } },
            tooltip: { callbacks: {
              title: items => { const w = weeks[items[0].dataIndex]; return `${format(w.start)} – ${format(w.end)}`; },
              label: context => `${context.dataset.label}: ${context.parsed.y.toFixed(2)} mi`,
            } },
          },
          scales: {
            x: { ticks: { color: '#94a3b8', maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
            y: { beginAtZero: true, title: { display: true, text: 'Miles / week', color: '#94a3b8' },
              ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
          },
        },
      });
      document.getElementById('mileage-summary').textContent = `${result.average.toFixed(1)} mi / week average`;
      status.textContent = `${format(weeks[0].start)} – ${format(weeks.at(-1).end)} · ${result.count} runs · ${result.total.toFixed(1)} miles. Includes zero-mile weeks; excludes this partial week.${result.count ? '' : ' No running activities returned by Garmin.'}`;
      const rows = document.getElementById('mileage-rows');
      rows.replaceChildren(...weeks.map((week, i) => {
        const row = document.createElement('tr');
        for (const value of [`${format(week.start)} – ${format(week.end)}`, result.miles[i].toFixed(2)]) {
          const cell = document.createElement('td');
          cell.className = 'py-2 border-b border-slate-700';
          cell.textContent = value;
          row.append(cell);
        }
        return row;
      }));
      document.getElementById('mileage-details').hidden = false;
      loaded = true;
    } catch (error) {
      loaded = false;
      document.getElementById('mileage-chart-container').hidden = true;
      status.textContent = `Could not load mileage: ${error.message}`;
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }
  document.getElementById('tab-statistics').addEventListener('click', () => { if (!loaded) load(); });
  refresh.addEventListener('click', load);
}
