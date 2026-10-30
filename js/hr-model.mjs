const DAY = 86400000, YEAR = 365.25 * DAY;
const positive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const quantile = (xs, p) => {
  const a = [...xs].sort((a, b) => a - b), i = (a.length - 1) * p;
  return a[Math.floor(i)] + (a[Math.ceil(i)] - a[Math.floor(i)]) * (i % 1);
};

export function normalizeRuns(activities) {
  const seen = new Set(), rows = [];
  let invalid = 0;
  for (const a of activities) {
    if (a.activityId == null || seen.has(String(a.activityId))) continue;
    seen.add(String(a.activityId));
    const type = a.activityType?.typeKey || '';
    const date = a.startTimeLocal?.slice(0, 10), time = Date.parse(`${date}T00:00:00Z`);
    if (!type.includes('running') || !Number.isFinite(time) || !positive(a.distance) || !positive(a.movingDuration) || !positive(a.averageHR)) { invalid++; continue; }
    const name = a.activityName || 'Run';
    rows.push({ id: String(a.activityId), date, time, name, type, distance: a.distance,
      duration: a.movingDuration, hr: a.averageHR, speed: a.distance / a.movingDuration,
      paused: positive(a.elapsedDuration) ? a.elapsedDuration / a.movingDuration > 1.1 : null,
      treadmill: /treadmill/.test(type), trail: /trail/.test(type),
      race: /\brace\b|\bmarathon\b|\b5k\b|\b10k\b/i.test(name),
      intervals: /interval|tempo|fartlek|track workout/i.test(name),
      elevation: Number.isFinite(a.elevationGain) ? a.elevationGain : null,
      temperature: Number.isFinite(a.averageTemperature) ? a.averageTemperature : null });
  }
  return { rows: rows.sort((a, b) => a.time - b.time), invalid };
}

export function filterRuns(rows, options = {}) {
  const { start, end, minutes = 20, minMiles = 0, maxMiles = Infinity, treadmill = false,
    excludeTrail = true, excludeRace = true, excludeIntervals = true, excluded = new Set() } = options;
  return rows.filter(r => (!start || r.date >= start) && (!end || r.date <= end) &&
    r.duration >= minutes * 60 && r.distance / 1609.344 >= minMiles && r.distance / 1609.344 <= maxMiles &&
    r.treadmill === treadmill && r.paused !== true && (!excludeTrail || !r.trail) &&
    (!excludeRace || !r.race) && (!excludeIntervals || !r.intervals) && !excluded.has(r.id));
}

// Modified Gram–Schmidt QR with reorthogonalization, on centered/scaled columns.
// Solve R*b = Q'y by back substitution; never invert X'X.
export function fitOLS(rows, origin = rows[0]?.time) {
  if (rows.length < 4) throw new Error('Not enough observations.');
  const speeds = rows.map(r => r.speed), times = rows.map(r => (r.time - origin) / YEAR);
  const center = [0, mean(speeds), mean(times)];
  const scale = [1, Math.sqrt(mean(speeds.map(x => (x - center[1]) ** 2))), Math.sqrt(mean(times.map(x => (x - center[2]) ** 2)))];
  if (scale[1] < 1e-8 || scale[2] < 1e-8) throw new Error('Insufficient speed or date variation.');
  const columns = [rows.map(() => 1), speeds.map(x => (x - center[1]) / scale[1]), times.map(x => (x - center[2]) / scale[2])];
  const q = [], R = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let j = 0; j < 3; j++) {
    const v = [...columns[j]];
    for (let pass = 0; pass < 2; pass++) for (let k = 0; k < j; k++) {
      const dot = mean(v.map((x, i) => x * q[k][i])) * rows.length;
      R[k][j] += dot;
      for (let i = 0; i < v.length; i++) v[i] -= dot * q[k][i];
    }
    R[j][j] = Math.hypot(...v);
    if (R[j][j] < 1e-6 * Math.sqrt(rows.length)) throw new Error('Speed and time are too closely correlated.');
    q.push(v.map(x => x / R[j][j]));
  }
  const b = q.map(col => col.reduce((sum, x, i) => sum + x * rows[i].hr, 0));
  for (let j = 2; j >= 0; j--) {
    for (let k = j + 1; k < 3; k++) b[j] -= R[j][k] * b[k];
    b[j] /= R[j][j];
  }
  const beta = [b[0] - b[1] * center[1] / scale[1] - b[2] * center[2] / scale[2], b[1] / scale[1], b[2] / scale[2]];
  const predict = (speed, time) => beta[0] + beta[1] * speed + beta[2] * (time - origin) / YEAR;
  const residuals = rows.map(r => r.hr - predict(r.speed, r.time));
  const mse = residuals.reduce((s, x) => s + x * x, 0) / (rows.length - 3);
  const influence = residuals.map((e, i) => {
    const h = q.reduce((s, col) => s + col[i] ** 2, 0);
    return mse > 1e-16 ? e * e * h / (3 * mse * (1 - h) ** 2) : 0;
  });
  return { beta, predict, residuals, influence, rmse: Math.sqrt(mse) };
}

export function analyzeHR(rows, { minCount = 20, start, end } = {}) {
  if (rows.length < minCount) return { error: `Insufficient comparable runs: ${rows.length} included; at least ${minCount} required.` };
  rows = [...rows].sort((a, b) => a.time - b.time);
  const first = rows[0].time, last = rows.at(-1).time, span = last - first;
  if (span < 28 * DAY || (start && end && span < (Date.parse(end) - Date.parse(start)) * 0.5)) return { error: 'Insufficient date coverage: need at least 28 days and coverage of half the selected period.' };
  const early = rows.filter(r => r.time <= first + span / 3), late = rows.filter(r => r.time >= last - span / 3);
  if (early.length < 5 || late.length < 5) return { error: 'Insufficient comparable runs in the first or last third of the period.' };
  const low = Math.max(quantile(early.map(r => r.speed), 0.1), quantile(late.map(r => r.speed), 0.1));
  const high = Math.min(quantile(early.map(r => r.speed), 0.9), quantile(late.map(r => r.speed), 0.9));
  if (high - low < 0.05 || early.filter(r => r.speed >= low && r.speed <= high).length < 5 || late.filter(r => r.speed >= low && r.speed <= high).length < 5) return { error: 'Insufficient comparable runs: early and late running speeds do not overlap enough.' };
  try {
    const fit = fitOLS(rows, first);
    const speedMean = mean(rows.map(r => r.speed)), timeMean = mean(rows.map(r => r.time));
    const covariance = rows.reduce((s, r) => s + (r.speed - speedMean) * (r.time - timeMean), 0);
    const correlation = covariance / Math.sqrt(rows.reduce((s, r) => s + (r.speed - speedMean) ** 2, 0) * rows.reduce((s, r) => s + (r.time - timeMean) ** 2, 0));
    if (Math.abs(correlation) > 0.95) return { error: 'Insufficient comparable runs: speed and date are too closely correlated to separate their effects.' };
    const reference = Math.max(low, Math.min(high, quantile(rows.map(r => r.speed), 0.5)));
    // Resample whole Sunday–Saturday blocks, preserving within-week dependence.
    const blocks = new Map();
    for (const r of rows) {
      const d = new Date(r.time); d.setUTCDate(d.getUTCDate() - d.getUTCDay());
      const key = d.toISOString().slice(0, 10);
      if (!blocks.has(key)) blocks.set(key, []);
      blocks.get(key).push(r);
    }
    const groups = [...blocks.values()], changes = [];
    let seed = 1234567;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 300; i++) {
      const sample = groups.flatMap(() => groups[Math.floor(random() * groups.length)]);
      try { changes.push(fitOLS(sample, first).beta[2] * span / YEAR); } catch { /* singular bootstrap sample */ }
    }
    const ci = changes.length >= 240 && groups.length >= 8 ? [quantile(changes, 0.025), quantile(changes, 0.975)] : null;
    const influential = rows.filter((r, i) => fit.influence[i] > 4 / rows.length);
    let sensitive = false;
    if (influential.length) {
      try {
        const clean = fitOLS(rows.filter(r => !influential.includes(r)), first);
        sensitive = Math.sign(clean.beta[2]) !== Math.sign(fit.beta[2]) || Math.abs(clean.beta[2] - fit.beta[2]) > Math.max(2, Math.abs(fit.beta[2]) * 0.5);
      } catch { sensitive = true; }
    }
    return { rows, fit, first, last, low, high, reference, ci, influential: influential.length, sensitive,
      change: fit.beta[2] * span / YEAR, weeks: groups.length,
      unusual: fit.residuals.filter(e => Math.abs(e) > 3 * fit.rmse && Math.abs(e) > 1e-7).length,
      direction: !ci || sensitive || fit.beta[1] <= 0 ? 'uncertain' : Math.abs(fit.beta[2] * span / YEAR) < 1e-7 ? 'none' : ci[1] < 0 ? 'decrease' : ci[0] > 0 ? 'increase' : 'none' };
  } catch (e) { return { error: `Insufficient comparable runs: ${e.message}` }; }
}

export function referencePrediction(model, speed) {
  if (!Number.isFinite(speed) || speed < model.low || speed > model.high) throw new RangeError('Reference pace is outside the supported speed range.');
  const baseline = model.fit.predict(speed, model.first), current = model.fit.predict(speed, model.last);
  return { baseline, current, change: current - baseline, reduction: (baseline - current) / baseline * 100 };
}
