const DAY = 86400000;
const iso = date => date.toISOString().slice(0, 10);

// Use local today, then UTC calendar arithmetic to avoid daylight-saving shifts.
export function completedWeeks(now = new Date()) {
  const sunday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
  return Array.from({ length: 52 }, (_, i) => {
    const start = new Date(sunday.getTime() - (52 - i) * 7 * DAY);
    return { start: iso(start), end: iso(new Date(start.getTime() + 6 * DAY)) };
  });
}

export function summarizeMileage(activities, weeks) {
  const miles = weeks.map(() => 0);
  const seen = new Set();
  let count = 0;
  let invalid = 0;
  for (const activity of activities) {
    if (activity.activityId == null) { invalid++; continue; }
    if (seen.has(String(activity.activityId))) continue;
    seen.add(String(activity.activityId));
    // The server filters Garmin search to running and its subtypes.
    const day = activity.startTimeLocal?.slice(0, 10);
    const distance = activity.distance;
    if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) {
      invalid++;
      continue;
    }
    const index = weeks.findIndex(w => day >= w.start && day <= w.end);
    if (index < 0) continue;
    miles[index] += distance / 1609.344;
    count++;
  }
  const total = miles.reduce((sum, n) => sum + n, 0);
  return { miles, total, average: total / weeks.length, count, invalid };
}
