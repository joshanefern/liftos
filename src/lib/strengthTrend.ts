import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { isPlaceholderName } from "@/lib/exerciseNames";
import { inferTracking } from "@/lib/exerciseTracking";
import { E1RM_MAX_REPS, epley1RM, normalizeExerciseName } from "@/lib/prs";

/* ── Strength trends — the question lifters actually re-check is "am I
     getting stronger?", per-lift (research: JEFIT/RepReturn/Cora; Strong's
     per-exercise trend is its most-loved screen). One best working-set
     weight per session per lift, across a rolling window. Timed exercises
     (planks, hangs) trend on their best hold duration instead — same
     question, different unit. ── */

const DAY_MS = 86_400_000;

export type TrendMetric = "weight" | "time";

export type LiftTrend = {
  /** Display name — the most recent casing the user actually typed. */
  name: string;
  /** "weight" = best working-set weight (lb/kg); "time" = longest hold (s). */
  metric: TrendMetric;
  /** Best value in the first/last session of the window. */
  first: number;
  last: number;
  delta: number;
  /** One point per session (chronological best value). */
  points: number[];
  sessions: number;
};

/** Per-lift best completed working-set value per session, oldest→newest,
    for lifts with enough history to show a trend. Weighted lifts trend on
    weight; hold-only lifts trend on duration. Ranked: improving lifts first
    (weight before time — this is a strength app), then by how often
    they're trained. */
export const getLiftTrends = (
  logs: WorkoutLog[],
  windowDays = 84,
  minSessions = 3,
): LiftTrend[] => {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const bySession = new Map<
    string,
    { name: string; points: { t: number; weight: number; duration: number }[] }
  >();

  for (const log of logs) {
    const t = Date.parse(log.finished_at);
    if (!Number.isFinite(t) || t < cutoff) continue;
    for (const exercise of log.exercises) {
      // Cardio durations are not holds — a 5k's half hour must never chart
      // as a strength trend. Placeholder imports ("Exercise 1") never chart
      // either; they surface only through the fix-it rename row.
      if (isPlaceholderName(exercise.name)) continue;
      const isCardio = exercise.kind === "cardio";
      let bestWeight = 0;
      let bestDuration = 0;
      for (const set of exercise.sets) {
        if (!set.completed || set.isWarmup) continue;
        // A weight with zero reps is a failed/aborted lift, not a best set.
        const reps = typeof set.reps === "number" ? set.reps : 0;
        if (typeof set.weight === "number" && reps >= 1 && set.weight > bestWeight) {
          bestWeight = set.weight;
        }
        const isDistance = typeof set.distance_m === "number" && set.distance_m > 0;
        if (
          !isCardio &&
          !isDistance &&
          typeof set.duration_seconds === "number" &&
          set.duration_seconds > bestDuration
        ) {
          bestDuration = set.duration_seconds;
        }
      }
      if (bestWeight <= 0 && bestDuration <= 0) continue;
      const key = normalizeExerciseName(exercise.name);
      const entry = bySession.get(key) ?? { name: exercise.name, points: [] };
      entry.name = exercise.name;
      // Review-imported workouts can contain the same lift as two entries —
      // one workout is still one session, so same-log duplicates merge.
      const dup = entry.points.find((p) => p.t === t);
      if (dup) {
        dup.weight = Math.max(dup.weight, bestWeight);
        dup.duration = Math.max(dup.duration, bestDuration);
      } else {
        entry.points.push({ t, weight: bestWeight, duration: bestDuration });
      }
      bySession.set(key, entry);
    }
  }

  const trends: LiftTrend[] = [];
  for (const { name, points } of bySession.values()) {
    points.sort((a, b) => a.t - b.t);
    // Any hold in the window makes this a timed exercise — a weighted plank
    // trends on how long it was held, not on its flat loading weight. Rep
    // sessions from before the exercise pivoted to time drop out of the
    // series rather than charting as zero-second holds.
    const hasHolds = points.some((p) => p.duration > 0);
    const metric: TrendMetric = hasHolds ? "time" : "weight";
    const series = hasHolds ? points.filter((p) => p.duration > 0) : points;
    if (series.length < minSessions) continue;
    const values = series.map((p) => (metric === "weight" ? p.weight : p.duration));
    trends.push({
      name,
      metric,
      first: values[0],
      last: values[values.length - 1],
      delta: values[values.length - 1] - values[0],
      points: values,
      sessions: values.length,
    });
  }

  // Weight trends outrank time trends (their deltas aren't comparable units);
  // within a metric, biggest gain first, then training frequency.
  const rank = (m: TrendMetric) => (m === "weight" ? 0 : 1);
  return trends.sort(
    (a, b) =>
      rank(a.metric) - rank(b.metric) || b.delta - a.delta || b.sessions - a.sessions,
  );
};

/** The screen's headline lift: the biggest gainer, falling back to the most
    trained when nothing is improving yet. */
export const featuredLift = (trends: LiftTrend[]): LiftTrend | null => {
  if (trends.length === 0) return null;
  const improving = trends.find((t) => t.delta > 0);
  if (improving) return improving;
  return [...trends].sort((a, b) => b.sessions - a.sessions)[0];
};

/** Lifts one session short of a trend inside the window — the Strength card
    names them with an unlock countdown instead of silently vanishing (a
    missing card is indistinguishable from a broken app). */
export type LockedTrend = { name: string; sessions: number; needed: number };

export const lockedTrendCandidates = (
  logs: WorkoutLog[],
  windowDays = 84,
  minSessions = 2,
): LockedTrend[] => {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const counts = new Map<string, { name: string; sessions: number; holdSessions: number }>();
  for (const log of logs) {
    const t = Date.parse(log.finished_at);
    if (!Number.isFinite(t) || t < cutoff) continue;
    // One workout = one session, even when review imports duplicated a lift.
    const seenInLog = new Set<string>();
    for (const exercise of log.exercises) {
      if (exercise.kind === "cardio" || isPlaceholderName(exercise.name)) continue;
      let worked = false;
      let workedHold = false;
      for (const s of exercise.sets) {
        if (!s.completed || s.isWarmup) continue;
        if (typeof s.weight === "number" && s.weight > 0) worked = true;
        const isDistance = typeof s.distance_m === "number" && s.distance_m > 0;
        if (!isDistance && typeof s.duration_seconds === "number" && s.duration_seconds > 0) {
          worked = true;
          workedHold = true;
        }
      }
      if (!worked) continue;
      const key = normalizeExerciseName(exercise.name);
      if (seenInLog.has(key)) continue;
      seenInLog.add(key);
      const entry = counts.get(key) ?? { name: exercise.name, sessions: 0, holdSessions: 0 };
      entry.name = exercise.name;
      entry.sessions++;
      if (workedHold) entry.holdSessions++;
      counts.set(key, entry);
    }
  }
  return [...counts.values()]
    .map((c) => ({
      name: c.name,
      // A lift that has pivoted to holds gates on hold-bearing sessions —
      // the same series getLiftTrends actually charts.
      sessions: c.holdSessions > 0 ? c.holdSessions : c.sessions,
    }))
    .filter((c) => c.sessions > 0 && c.sessions < minSessions)
    .map((c) => ({ ...c, needed: minSessions - c.sessions }))
    .sort((a, b) => b.sessions - a.sessions || (a.name < b.name ? -1 : 1));
};

/** Last workout vs the previous one containing the same lift — the
    beat-last-time readout beginners parse instantly ("80 × 5 → 82.5 × 5").
    Weight lifts compare best-set weight (reps break ties); holds compare
    longest duration. Only lifts present in the most recent log qualify, and
    only when an earlier session exists to compare against. */
export type LastDelta = {
  name: string;
  metric: TrendMetric;
  /** weight metric: [weight, reps]; time metric: [seconds, 0] */
  prev: [number, number];
  last: [number, number];
  direction: "up" | "same" | "down";
};

/* Set eligibility, shared by bestOfLog and liftSessionSeries:
   - weight counts only alongside reps ≥ 1 (a 0-rep heavy set is a failed
     lift — same rule as the PR engine);
   - reps alone count (bodyweight push-ups are real work);
   - the session's longest hold is tracked independently of its heaviest
     set, so a bodyweight 90s plank isn't hidden by a 25 lb × 30s one. */
const bestOfLog = (
  log: WorkoutLog,
  key: string,
): { weight: number; reps: number; duration: number } | null => {
  let best: { weight: number; reps: number } | null = null;
  let longestHold = 0;
  let any = false;
  for (const exercise of log.exercises) {
    if (exercise.kind === "cardio") continue;
    if (normalizeExerciseName(exercise.name) !== key) continue;
    for (const s of exercise.sets) {
      if (!s.completed || s.isWarmup) continue;
      const reps = typeof s.reps === "number" ? s.reps : 0;
      const rawWeight = typeof s.weight === "number" ? s.weight : 0;
      const weight = rawWeight > 0 && reps >= 1 ? rawWeight : 0;
      const duration = typeof s.duration_seconds === "number" ? s.duration_seconds : 0;
      if (duration > longestHold) longestHold = duration;
      if (weight <= 0 && duration <= 0 && reps < 1) continue;
      any = true;
      if (!best || weight > best.weight || (weight === best.weight && reps > best.reps)) {
        best = { weight, reps };
      }
    }
  }
  if (!any) return null;
  return { weight: best?.weight ?? 0, reps: best?.reps ?? 0, duration: longestHold };
};

/** Per-session detail series for one lift — the per-lift page's data. Each
    point is that session's best completed working set, with the est-best-
    single computed only from ≤10-rep sets (the same rule Records uses). */
export type LiftSessionPoint = {
  t: number;
  /** "Jun 12" style local label for the chart axis / history list. */
  label: string;
  weight: number;
  reps: number;
  e1rm: number | null;
  duration: number;
};

export const liftSessionSeries = (
  logs: WorkoutLog[],
  name: string,
  windowDays = 84,
): LiftSessionPoint[] => {
  const key = normalizeExerciseName(name);
  const cutoff = Date.now() - windowDays * DAY_MS;
  const points: LiftSessionPoint[] = [];
  for (const log of logs) {
    const t = Date.parse(log.finished_at);
    if (!Number.isFinite(t) || t < cutoff) continue;
    let best: { weight: number; reps: number } | null = null;
    let longestHold = 0;
    let any = false;
    let bestE: number | null = null;
    for (const exercise of log.exercises) {
      if (exercise.kind === "cardio") continue;
      if (normalizeExerciseName(exercise.name) !== key) continue;
      for (const s of exercise.sets) {
        if (!s.completed || s.isWarmup) continue;
        const reps = typeof s.reps === "number" ? s.reps : 0;
        const rawWeight = typeof s.weight === "number" ? s.weight : 0;
        const weight = rawWeight > 0 && reps >= 1 ? rawWeight : 0;
        const duration = typeof s.duration_seconds === "number" ? s.duration_seconds : 0;
        if (duration > longestHold) longestHold = duration;
        if (weight <= 0 && duration <= 0 && reps < 1) continue;
        any = true;
        if (!best || weight > best.weight || (weight === best.weight && reps > best.reps)) {
          best = { weight, reps };
        }
        if (weight > 0 && reps >= 1 && reps <= E1RM_MAX_REPS) {
          const e = epley1RM(weight, reps);
          if (bestE === null || e > bestE) bestE = e;
        }
      }
    }
    if (!any) continue;
    points.push({
      t,
      label: new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weight: best?.weight ?? 0,
      reps: best?.reps ?? 0,
      e1rm: bestE,
      duration: longestHold,
    });
  }
  return points.sort((a, b) => a.t - b.t);
};

export const lastSessionDeltas = (logs: WorkoutLog[], limit = 3): LastDelta[] => {
  if (logs.length < 2) return [];
  const ordered = [...logs].sort(
    (a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at),
  );
  const [latest, ...earlier] = ordered;
  const deltas: LastDelta[] = [];
  const seen = new Set<string>();

  for (const exercise of latest.exercises) {
    if (deltas.length >= limit) break;
    if (exercise.kind === "cardio" || isPlaceholderName(exercise.name)) continue;
    const key = normalizeExerciseName(exercise.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const last = bestOfLog(latest, key);
    if (!last) continue;
    let prev: ReturnType<typeof bestOfLog> = null;
    for (const log of earlier) {
      prev = bestOfLog(log, key);
      if (prev) break;
    }
    if (!prev) continue;
    // A time-tracked exercise (planks) whose old logs are rep-shaped has no
    // honest comparison — "100 × 55" would read as weight × reps. Skip until
    // real holds exist on both sides.
    if (
      inferTracking(exercise.name) === "time" &&
      (last.duration <= 0 || prev.duration <= 0)
    ) {
      continue;
    }
    const metric: TrendMetric = last.duration > 0 || prev.duration > 0 ? "time" : "weight";
    const lastVal: [number, number] =
      metric === "time" ? [last.duration, 0] : [last.weight, last.reps];
    const prevVal: [number, number] =
      metric === "time" ? [prev.duration, 0] : [prev.weight, prev.reps];
    const cmp =
      lastVal[0] !== prevVal[0] ? lastVal[0] - prevVal[0] : lastVal[1] - prevVal[1];
    deltas.push({
      name: exercise.name,
      metric,
      prev: prevVal,
      last: lastVal,
      direction: cmp > 0 ? "up" : cmp < 0 ? "down" : "same",
    });
  }
  return deltas;
};
