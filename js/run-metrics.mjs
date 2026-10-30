export function formatPace(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  const seconds = Math.round(minutes * 60);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export function runPoints(activities, start, end) {
  const cadence = [], pace = [], seen = new Set();
  let runs = 0, invalidDates = 0;
  for (const run of activities) {
    if (run.activityId == null || seen.has(String(run.activityId))) continue;
    seen.add(String(run.activityId));
    const date = run.startTimeLocal?.slice(0, 10);
    // Wall-clock timestamps plotted in UTC preserve Garmin's local activity dates.
    const time = typeof run.startTimeLocal === 'string'
      ? Date.parse(`${run.startTimeLocal.replace(' ', 'T').replace(/Z$/, '')}Z`) : NaN;
    if (!date || !Number.isFinite(time)) { invalidDates++; continue; }
    if (date < start || date > end) continue;
    runs++;
    const base = { x: time, date, name: run.activityName || 'Run', id: String(run.activityId) };
    const steps = run.averageRunningCadenceInStepsPerMinute;
    if (typeof steps === 'number' && Number.isFinite(steps) && steps > 0) cadence.push({ ...base, y: steps });
    const speed = run.averageSpeed;
    // Garmin averageSpeed is meters/second; no cadence doubling or pace guessing.
    if (typeof speed === 'number' && Number.isFinite(speed) && speed > 0) pace.push({ ...base, y: 1609.344 / speed / 60 });
  }
  cadence.sort((a, b) => a.x - b.x);
  pace.sort((a, b) => a.x - b.x);
  return { cadence, pace, runs, invalidDates };
}
