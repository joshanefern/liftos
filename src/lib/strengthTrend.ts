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
  now = Date.now(),
): LiftTrend[] => {
  const cutoff = now - windowDays * DAY_MS;
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
): {
  weight: number;
  reps: number;
  duration: number;
  e1rm: number;
  /** The set behind `e1rm` — not always the heaviest (a 100×9 back-off
      out-scores a 105×1 top single), so it is what a breakdown shows. */
  e1rmSet: { weight: number; reps: number } | null;
} | null => {
  let best: { weight: number; reps: number } | null = null;
  let longestHold = 0;
  let bestE = 0;
  let bestESet: { weight: number; reps: number } | null = null;
  let any = false;
  for (const exercise of log.exercises) {
    if (exercise.kind === "cardio") continue;
    if (normalizeExerciseName(exercise.name) !== key) continue;
    for (const s of exercise.sets) {
      if (!s.completed || s.isWarmup) continue;
      const reps = typeof s.reps === "number" ? s.reps : 0;
      const rawWeight = typeof s.weight === "number" ? s.weight : 0;
      const weight = rawWeight > 0 && reps >= 1 ? rawWeight : 0;
      // A distance set's time is pace, not a hold — same exclusion as
      // getLiftTrends and the PR engine.
      const isDistance = typeof s.distance_m === "number" && s.distance_m > 0;
      const duration =
        !isDistance && typeof s.duration_seconds === "number" ? s.duration_seconds : 0;
      if (duration > longestHold) longestHold = duration;
      if (weight <= 0 && duration <= 0 && reps < 1) continue;
      any = true;
      if (weight > 0) {
        const e = epley1RM(weight, reps);
        if (e > bestE || (e === bestE && bestESet !== null && weight > bestESet.weight)) {
          bestE = e;
          bestESet = { weight, reps };
        }
      }
      if (!best || weight > best.weight || (weight === best.weight && reps > best.reps)) {
        best = { weight, reps };
      }
    }
  }
  if (!any) return null;
  return {
    weight: best?.weight ?? 0,
    reps: best?.reps ?? 0,
    duration: longestHold,
    e1rm: bestE,
    e1rmSet: bestESet,
  };
};

/** A log with at least one comparable lift — a non-cardio, non-placeholder
    exercise holding a completed working set. A cardio-only HealthKit
    review is a workout, not a lifting session, so it never becomes the
    "latest" side of a strength comparison. */
const isLiftingLog = (log: WorkoutLog): boolean =>
  log.exercises.some(
    (exercise) =>
      exercise.kind !== "cardio" &&
      !isPlaceholderName(exercise.name) &&
      bestOfLog(log, normalizeExerciseName(exercise.name)) !== null,
  );

/** Newest→oldest split at the most recent lifting session: that log, then
    everything logged before it. Newer cardio-only logs are skipped rather
    than treated as a session with nothing to compare. */
const latestLiftingSplit = (
  logs: WorkoutLog[],
): { latest: WorkoutLog; earlier: WorkoutLog[] } | null => {
  const ordered = [...logs].sort(
    (a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at),
  );
  const index = ordered.findIndex(isLiftingLog);
  if (index < 0) return null;
  return { latest: ordered[index], earlier: ordered.slice(index + 1) };
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

/** One number for the Improvement card: the latest LIFTING session vs the
    previous time each of its lifts was trained, averaged into a single
    signed %. Weight lifts compare on Epley e1RM so both load and rep gains
    count (80×5 → 80×8 is real improvement); holds compare duration;
    bodyweight rep work compares reps. A lift whose two sessions aren't
    shaped alike (weights then bodyweight, reps then holds) is skipped — no
    honest %. A newer cardio-only log (a run pulled from HealthKit) is not
    the latest session — it would blank the card for a lifter with months
    of history. */
export type SessionImprovement = {
  /** Rounded mean % change; negative when the session was genuinely down. */
  pct: number;
  /** How many lifts had a previous session to compare against. */
  lifts: number;
};

/** How a lift was scored: estimated single (weight × reps), longest hold,
    or reps (bodyweight). */
export type ImprovementMeasure = "e1rm" | "hold" | "reps";

/** The set that was scored on one side. `e1rm` reads weight × reps, `hold`
    reads seconds, `reps` reads reps; the other fields are 0. */
export type ImprovementSet = { weight: number; reps: number; seconds: number };

export type ImprovementLift = {
  /** The name as typed in the latest workout. */
  name: string;
  measure: ImprovementMeasure;
  /** The scored best set the previous time, and this time. */
  prev: ImprovementSet;
  last: ImprovementSet;
  /** Unrounded % change — the tile's number is the rounded mean of these. */
  change: number;
  /** `change` rounded to a whole number (never -0). The sheet shows the
      rows through `shownLiftPcts` (lib/improvementCopy), which keeps them
      averaging to the tile. */
  pct: number;
  /** When the lift was last done before (that workout's finished_at). */
  prevAt: string;
};

/** A lift in the latest workout that did not count: done for the first
    time, or logged in a different shape than last time (weighted then
    bodyweight, reps then a hold) — no honest % between the two. */
export type ImprovementSkip = {
  name: string;
  reason: "first-time" | "measured-differently";
};

export type ImprovementBreakdown = {
  latest: { id: string; name: string; finishedAt: string };
  /** The one earlier workout every compared lift was last done in; null
      when they came from different workouts, or nothing compared. */
  previous: { id: string; name: string; finishedAt: string } | null;
  /** Compared lifts, in the order the latest workout lists them. */
  lifts: ImprovementLift[];
  skipped: ImprovementSkip[];
  /** The Improvement number: rounded mean of `lifts[].change`; null when
      no lift could be compared. */
  pct: number | null;
  /** No lifting workout was logged before the latest one — nothing could
      have been compared yet, so a missing number is a first run, not a
      workout of new or differently logged lifts. */
  firstLiftingWorkout: boolean;
};

/* `Math.round(-0.4)` is -0 — never let a wash print as "-0%". */
const roundPct = (value: number): number => Math.round(value) || 0;

/** The Improvement number and everything behind it, lift by lift — the
    tile and its explainer read this one computation. Null only when no
    lifting workout exists. */
export const improvementBreakdown = (logs: WorkoutLog[]): ImprovementBreakdown | null => {
  const split = latestLiftingSplit(logs);
  if (!split) return null;
  const { latest, earlier } = split;
  const lifts: ImprovementLift[] = [];
  const skipped: ImprovementSkip[] = [];
  const prevLogs = new Set<WorkoutLog>();
  const seen = new Set<string>();

  for (const exercise of latest.exercises) {
    // Cardio isn't a lift and placeholder imports surface only through the
    // rename row — neither is listed as "not counted".
    if (exercise.kind === "cardio" || isPlaceholderName(exercise.name)) continue;
    const key = normalizeExerciseName(exercise.name);
    if (seen.has(key)) continue;
    seen.add(key);
    const last = bestOfLog(latest, key);
    // On the plan but not a single working set done — not part of the workout.
    if (!last) continue;
    let prev: ReturnType<typeof bestOfLog> = null;
    let prevLog: WorkoutLog | null = null;
    for (const log of earlier) {
      prev = bestOfLog(log, key);
      if (prev) {
        prevLog = log;
        break;
      }
    }
    if (!prev || !prevLog) {
      skipped.push({ name: exercise.name, reason: "first-time" });
      continue;
    }

    let measure: ImprovementMeasure;
    let lastScore = 0;
    let prevScore = 0;
    let lastSet: ImprovementSet;
    let prevSet: ImprovementSet;
    if (last.duration > 0 || prev.duration > 0) {
      if (last.duration <= 0 || prev.duration <= 0) {
        skipped.push({ name: exercise.name, reason: "measured-differently" });
        continue;
      }
      measure = "hold";
      lastScore = last.duration;
      prevScore = prev.duration;
      lastSet = { weight: 0, reps: 0, seconds: last.duration };
      prevSet = { weight: 0, reps: 0, seconds: prev.duration };
    } else if (last.e1rm > 0 && prev.e1rm > 0 && last.e1rmSet && prev.e1rmSet) {
      // Each session's best Epley across ALL its weighted sets — the top
      // single must not hide a better back-off set. Uncapped rep counts are
      // fine here: this is a relative comparison between the lifter's own
      // sessions, not a displayed "est. single", so the ≤10-rep display
      // rule doesn't apply. The set shown is the one that scored, so a
      // row never reads "105 × 1 → 100 × 9" beside a gain it can't explain.
      measure = "e1rm";
      lastScore = last.e1rm;
      prevScore = prev.e1rm;
      lastSet = { ...last.e1rmSet, seconds: 0 };
      prevSet = { ...prev.e1rmSet, seconds: 0 };
    } else if (last.weight <= 0 && prev.weight <= 0 && last.reps > 0 && prev.reps > 0) {
      measure = "reps";
      lastScore = last.reps;
      prevScore = prev.reps;
      lastSet = { weight: 0, reps: last.reps, seconds: 0 };
      prevSet = { weight: 0, reps: prev.reps, seconds: 0 };
    } else {
      skipped.push({ name: exercise.name, reason: "measured-differently" });
      continue;
    }
    if (prevScore <= 0) {
      skipped.push({ name: exercise.name, reason: "measured-differently" });
      continue;
    }
    const change = ((lastScore - prevScore) / prevScore) * 100;
    prevLogs.add(prevLog);
    lifts.push({
      name: exercise.name,
      measure,
      prev: prevSet,
      last: lastSet,
      change,
      pct: roundPct(change),
      prevAt: prevLog.finished_at,
    });
  }

  const previousLog = prevLogs.size === 1 ? [...prevLogs][0] : null;
  return {
    latest: { id: latest.id, name: latest.name, finishedAt: latest.finished_at },
    previous: previousLog
      ? { id: previousLog.id, name: previousLog.name, finishedAt: previousLog.finished_at }
      : null,
    lifts,
    skipped,
    pct:
      lifts.length === 0
        ? null
        : roundPct(lifts.reduce((sum, l) => sum + l.change, 0) / lifts.length),
    // Any compared lift proves an earlier lifting workout; only a workout
    // with nothing compared needs the look back.
    firstLiftingWorkout: lifts.length === 0 && !earlier.some(isLiftingLog),
  };
};

export const sessionImprovement = (logs: WorkoutLog[]): SessionImprovement | null => {
  if (logs.length < 2) return null;
  const breakdown = improvementBreakdown(logs);
  if (!breakdown || breakdown.pct === null) return null;
  return { pct: breakdown.pct, lifts: breakdown.lifts.length };
};

export const lastSessionDeltas = (logs: WorkoutLog[], limit = 3): LastDelta[] => {
  if (logs.length < 2) return [];
  const split = latestLiftingSplit(logs);
  if (!split) return [];
  const { latest, earlier } = split;
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
