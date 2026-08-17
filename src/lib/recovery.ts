import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { TRACKED_MUSCLES } from "@/lib/muscleCoverage";
import { lookupMuscles, type Muscle } from "@/lib/muscleMap";
import type { ActiveSession } from "@/pages/ActiveWorkout";

/* ── Readiness — flag counting over personal baselines.
     Never a weighted score, never a percent: each overnight metric either
     sits inside the band the user's own last 60 days define, or it doesn't.
     Flags are counted; the count is the whole verdict. ── */

export type ReadinessState = "primed" | "steady" | "run_down";
export type ReadinessFlagMetric = "hrv" | "rhr" | "sleep" | "resp";
export type ReadinessFlag = {
  metric: ReadinessFlagMetric;
  label: string; // "HRV low"
  detail: string; // "42 ms — below your 48–64 range"
};
export type ReadinessAssessment = {
  state: ReadinessState | null; // null = tiers 3/4 (no wearable verdict)
  tier: 1 | 2 | 3 | 4;
  flags: ReadinessFlag[];
  illness: boolean;
  baselineDaysRemaining: number | null; // non-null only in tier 4
  summary: string | null;
};
export type RecoveryMetrics = {
  hrv: { t: string; ms: number }[]; // ISO timestamps
  restingHr: { t: string; bpm: number }[];
  sleep: { start: string; end: string; stage: "asleep" | "inBed" }[];
  respiratory: { t: string; brpm: number }[];
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

const BASELINE_WINDOW_DAYS = 60;
/** Tier qualification looks at the recent past only — 60-day-old consistency
    doesn't prove the wearable is still on the wrist. */
const QUALIFY_WINDOW_DAYS = 21;
const MIN_BASELINE_NIGHTS = 14;
/** Sleep/resp flags need at least this many baseline nights of their own
    metric before their median means anything. */
const MIN_METRIC_NIGHTS = 5;
/** Newest night with data must be at most this many nights old, or the
    engine stays silent — a verdict about "last night" can't come from
    Tuesday's data. */
const MAX_NIGHT_AGE_DAYS = 1;

const SLEEP_FLAG_FRACTION = 0.8; // sleep < 80% of own median
const RESP_FLAG_MARGIN = 1.0; // breaths/min above median

/* ── Night bookkeeping ── */

/** Local calendar date key, "2026-08-16". */
const dateKey = (d: Date): string => {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

/** Noon-to-noon night attribution (the sleep-tracker convention): everything
    from noon yesterday through noon today is "last night" of today. A 23:40
    HRV reading and the 06:10 one that follows land on the same night. */
const nightKey = (t: number): string => dateKey(new Date(t + 12 * HOUR_MS));

const parseKey = (key: string): Date => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const keyDiffDays = (later: string, earlier: string): number =>
  Math.round((parseKey(later).getTime() - parseKey(earlier).getTime()) / DAY_MS);

const shiftKey = (key: string, days: number): string => {
  const d = parseKey(key);
  d.setDate(d.getDate() + days);
  return dateKey(d);
};

/* ── Small stats ── */

/** Percentile with linear interpolation between closest ranks. */
const percentile = (sorted: number[], p: number): number => {
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
};

const median = (values: number[]): number =>
  percentile([...values].sort((a, b) => a - b), 50);

const mean = (values: number[]): number =>
  values.reduce((a, b) => a + b, 0) / values.length;

/* ── Nightly series construction ── */

type Sample = { t: number; v: number };
type SleepInterval = { start: number; end: number; night: string };

const parseSamples = <R extends { t: string }>(
  rows: R[],
  value: (row: R) => number,
  cutoff: number,
  nowMs: number,
): Sample[] =>
  rows
    .map((row) => ({ t: new Date(row.t).getTime(), v: value(row) }))
    .filter(
      (s) =>
        Number.isFinite(s.t) && Number.isFinite(s.v) && s.t >= cutoff && s.t <= nowMs,
    );

const asleepIntervals = (
  sleep: RecoveryMetrics["sleep"],
  cutoff: number,
  nowMs: number,
): SleepInterval[] =>
  sleep
    .filter((s) => s.stage === "asleep")
    .map((s) => ({ start: new Date(s.start).getTime(), end: new Date(s.end).getTime() }))
    .filter(
      (s) =>
        Number.isFinite(s.start) &&
        Number.isFinite(s.end) &&
        s.end > s.start &&
        s.end >= cutoff &&
        s.start <= nowMs,
    )
    .map((s) => ({ ...s, night: nightKey(s.start) }));

/** Merged (overlap-free) total hours — iPhone + Watch both writing sleep
    must not double-count the same night. */
const mergedHours = (intervals: { start: number; end: number }[]): number => {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = NaN;
  let curEnd = NaN;
  for (const iv of sorted) {
    if (!(iv.start <= curEnd)) {
      if (Number.isFinite(curEnd)) total += curEnd - curStart;
      curStart = iv.start;
      curEnd = iv.end;
    } else if (iv.end > curEnd) {
      curEnd = iv.end;
    }
  }
  if (Number.isFinite(curEnd)) total += curEnd - curStart;
  return total / HOUR_MS;
};

const sleepHoursByNight = (windows: SleepInterval[]): Map<string, number> => {
  const byNight = new Map<string, { start: number; end: number }[]>();
  for (const w of windows) {
    const list = byNight.get(w.night) ?? [];
    list.push(w);
    byNight.set(w.night, list);
  }
  return new Map([...byNight].map(([night, ivs]) => [night, mergedHours(ivs)]));
};

/** Nightly means of samples taken while asleep. A sample belongs to the
    sleep window that contains it; for nights with no sleep data at all the
    fallback window is 00:00–10:00 local (per spec). Awake-hours samples on
    nights that DO have sleep windows are noise and are dropped. */
const overnightMeans = (
  samples: Sample[],
  windows: SleepInterval[],
): Map<string, number> => {
  const nightsWithSleep = new Set(windows.map((w) => w.night));
  const buckets = new Map<string, number[]>();
  for (const s of samples) {
    const window = windows.find((w) => s.t >= w.start && s.t <= w.end);
    let night: string | null = null;
    if (window) {
      night = window.night;
    } else if (new Date(s.t).getHours() < 10) {
      const key = nightKey(s.t);
      if (!nightsWithSleep.has(key)) night = key;
    }
    if (!night) continue;
    const list = buckets.get(night) ?? [];
    list.push(s.v);
    buckets.set(night, list);
  }
  return new Map([...buckets].map(([night, vs]) => [night, mean(vs)]));
};

/** Resting HR is a daily metric (Apple writes ~one value per day) — keyed by
    plain local date, no noon shift. */
const dailyMeans = (samples: Sample[]): Map<string, number> => {
  const buckets = new Map<string, number[]>();
  for (const s of samples) {
    const key = dateKey(new Date(s.t));
    const list = buckets.get(key) ?? [];
    list.push(s.v);
    buckets.set(key, list);
  }
  return new Map([...buckets].map(([key, vs]) => [key, mean(vs)]));
};

/* ── Copy ── */

const FLAG_PHRASES: Record<ReadinessFlagMetric, string> = {
  hrv: "HRV",
  rhr: "resting heart rate",
  sleep: "sleep",
  resp: "breathing rate",
};

const ILLNESS_SUMMARY =
  "Your overnight vitals look like you might be fighting something — worth an easy day.";

const runDownSummary = (flags: ReadinessFlag[]): string => {
  const names = flags.map((f) => FLAG_PHRASES[f.metric]);
  const listed =
    names.length === 2
      ? `${names[0]} and ${names[1]} are both`
      : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]} are all`;
  const sentence = `${listed} off your baseline.`;
  return (
    sentence.charAt(0).toUpperCase() +
    sentence.slice(1) +
    " Today's plan still works — the last set of your top lifts is dropped."
  );
};

/** The week-average check (spec: stronger confirmation, never required)
    surfaces in the detail string only. */
const WEEK_SUFFIX = "; your 7-day average is off too";

/* ── The assessment ── */

const silentResult = (tier: 3 | 4): ReadinessAssessment => ({
  state: null,
  tier,
  flags: [],
  illness: false,
  baselineDaysRemaining: null,
  summary: null,
});

export const assessReadiness = (
  metrics: RecoveryMetrics | null,
  now: Date = new Date(),
): ReadinessAssessment => {
  // Tier 3 — nothing on the wrist. Sleep alone can come from a bare iPhone,
  // so it does not count as wearable presence: without HRV/RHR/resp there is
  // no baseline to learn and "learning your baseline" would be a lie.
  if (
    !metrics ||
    (metrics.hrv.length === 0 &&
      metrics.restingHr.length === 0 &&
      metrics.respiratory.length === 0)
  ) {
    return silentResult(3);
  }

  const nowMs = now.getTime();
  const cutoff = nowMs - BASELINE_WINDOW_DAYS * DAY_MS;

  const windows = asleepIntervals(metrics.sleep, cutoff, nowMs);
  const hrvNightly = overnightMeans(
    parseSamples(metrics.hrv, (r) => r.ms, cutoff, nowMs),
    windows,
  );
  const respNightly = overnightMeans(
    parseSamples(metrics.respiratory, (r) => r.brpm, cutoff, nowMs),
    windows,
  );
  const rhrDaily = dailyMeans(
    parseSamples(metrics.restingHr, (r) => r.bpm, cutoff, nowMs),
  );
  const sleepNightly = sleepHoursByNight(windows);

  // A wearable that never writes resting HR can never qualify for a verdict —
  // treat it as no-wearable rather than a forever "learning your baseline".
  if (rhrDaily.size === 0) return silentResult(3);

  // Anchor on the latest COMPLETE night: nightKey(now) after 12:00 local
  // refers to TONIGHT (not yet slept), and an afternoon nap or the past-noon
  // tail of a lie-in would key to it and masquerade as "last night". Shifting
  // the anchor back 12h means a night only becomes assessable once its
  // noon-to-noon span has closed.
  const latestNight = nightKey(nowMs - 12 * HOUR_MS);
  const allKeys = [
    ...hrvNightly.keys(),
    ...rhrDaily.keys(),
    ...sleepNightly.keys(),
    ...respNightly.keys(),
  ].filter((k) => keyDiffDays(latestNight, k) >= 0);
  if (allKeys.length === 0) return silentResult(4);
  const lastNight = allKeys.reduce((a, b) => (a >= b ? a : b));

  // Tier qualification over the last 21 complete nights.
  let hrvRhrNights = 0;
  let rhrSleepNights = 0;
  for (let k = 0; k < QUALIFY_WINDOW_DAYS; k++) {
    const key = shiftKey(latestNight, -k);
    if (hrvNightly.has(key) && rhrDaily.has(key)) hrvRhrNights++;
    if (rhrDaily.has(key) && sleepNightly.has(key)) rhrSleepNights++;
  }

  const tier: 1 | 2 | 4 =
    hrvRhrNights >= MIN_BASELINE_NIGHTS
      ? 1
      : rhrSleepNights >= MIN_BASELINE_NIGHTS
        ? 2
        : 4;

  if (tier === 4) {
    const nights = Math.max(hrvRhrNights, rhrSleepNights);
    const remaining = Math.min(
      MIN_BASELINE_NIGHTS,
      Math.max(1, MIN_BASELINE_NIGHTS - nights),
    );
    return {
      state: null,
      tier: 4,
      flags: [],
      illness: false,
      baselineDaysRemaining: remaining,
      summary: `Learning your baseline — ${remaining} day${remaining === 1 ? "" : "s"} to go.`,
    };
  }

  // Live data must actually be about last night (or, at worst, the night
  // before). A full baseline with a watch left on the charger says nothing.
  if (keyDiffDays(latestNight, lastNight) > MAX_NIGHT_AGE_DAYS) return silentResult(4);

  // Last-night values. RHR falls back one day: Apple often finalizes a day's
  // resting HR hours after wake, so at 7am the freshest complete value is
  // yesterday's.
  const liveHrv = tier === 1 ? hrvNightly.get(lastNight) : undefined;
  const liveRhr = rhrDaily.get(lastNight) ?? rhrDaily.get(shiftKey(lastNight, -1));
  const liveSleep = sleepNightly.get(lastNight);
  const liveResp = respNightly.get(lastNight);

  const liveSignals = [
    ...(tier === 1 ? [liveHrv] : []),
    liveRhr,
    liveSleep,
    liveResp,
  ].filter((v) => v !== undefined).length;
  if (liveSignals < 2) return silentResult(4);

  // Bands: 60-day rolling median with a 10th–90th percentile normal band —
  // widened to 5th–95th in tier 2, where sparser data makes extremes noisier.
  const [loP, hiP] = tier === 2 ? [5, 95] : [10, 90];
  const band = (nightly: Map<string, number>): [number, number] => {
    const sorted = [...nightly.values()].sort((a, b) => a - b);
    return [percentile(sorted, loP), percentile(sorted, hiP)];
  };
  const weekAvg = (nightly: Map<string, number>): number | null => {
    const values: number[] = [];
    for (let k = 0; k < 7; k++) {
      const v = nightly.get(shiftKey(lastNight, -k));
      if (v !== undefined) values.push(v);
    }
    return values.length > 0 ? mean(values) : null;
  };

  const flags: ReadinessFlag[] = [];

  // HRV below band (tier 1 only — tier 2 means HRV is too sparse to trust).
  if (tier === 1 && liveHrv !== undefined) {
    const [lo, hi] = band(hrvNightly);
    if (liveHrv < lo) {
      const week = weekAvg(hrvNightly);
      flags.push({
        metric: "hrv",
        label: "HRV low",
        detail:
          `${Math.round(liveHrv)} ms — below your ${Math.round(lo)}–${Math.round(hi)} range` +
          (week !== null && week < lo ? WEEK_SUFFIX : ""),
      });
    }
  }

  // Resting HR above band.
  if (liveRhr !== undefined) {
    const [lo, hi] = band(rhrDaily);
    if (liveRhr > hi) {
      const week = weekAvg(rhrDaily);
      flags.push({
        metric: "rhr",
        label: "Resting HR high",
        detail:
          `${Math.round(liveRhr)} bpm — above your ${Math.round(lo)}–${Math.round(hi)} range` +
          (week !== null && week > hi ? WEEK_SUFFIX : ""),
      });
    }
  }

  // Sleep under 80% of own median.
  if (liveSleep !== undefined && sleepNightly.size >= MIN_METRIC_NIGHTS) {
    const med = median([...sleepNightly.values()]);
    if (liveSleep < SLEEP_FLAG_FRACTION * med) {
      const week = weekAvg(sleepNightly);
      flags.push({
        metric: "sleep",
        label: "Sleep short",
        detail:
          `${liveSleep.toFixed(1)} h — under 80% of your usual ${med.toFixed(1)} h` +
          (week !== null && week < SLEEP_FLAG_FRACTION * med ? WEEK_SUFFIX : ""),
      });
    }
  }

  // Respiratory rate more than 1 breath/min above median.
  if (liveResp !== undefined && respNightly.size >= MIN_METRIC_NIGHTS) {
    const med = median([...respNightly.values()]);
    if (liveResp > med + RESP_FLAG_MARGIN) {
      const week = weekAvg(respNightly);
      flags.push({
        metric: "resp",
        label: "Breathing rate high",
        detail:
          `${liveResp.toFixed(1)} brpm — above your usual ${med.toFixed(1)} brpm` +
          (week !== null && week > med + RESP_FLAG_MARGIN ? WEEK_SUFFIX : ""),
      });
    }
  }

  const state: ReadinessState =
    flags.length === 0 ? "primed" : flags.length === 1 ? "steady" : "run_down";
  const illness =
    flags.some((f) => f.metric === "resp") && flags.some((f) => f.metric === "rhr");

  // Illness still trims the seeded session (state is run_down) — say so.
  const summary =
    state !== "run_down"
      ? null
      : illness
        ? `${ILLNESS_SUMMARY} Today's session is trimmed a set per lift.`
        : runDownSummary(flags);

  return {
    state,
    tier,
    flags,
    illness,
    baselineDaysRemaining: null,
    summary,
  };
};

/* ── Per-muscle freshness from workout history — no wearable needed. ── */

/** Fatigue decays with a 60-hour half-life… */
const FATIGUE_HALF_LIFE_H = 60;
/** …and is fully forgiven after 7 days regardless. */
const FULL_RECOVERY_H = 7 * 24;
/** Weighted working sets that count as "fully cooked" for one muscle. */
const FULL_FATIGUE = 10;
const PRIMARY_WEIGHT = 1.0;
const SECONDARY_WEIGHT = 0.5;

export type MuscleFreshness = { muscle: Muscle; freshness: number }; // 0..1, 1 = fresh

export const muscleFreshnessFromLogs = (
  logs: WorkoutLog[],
  now: Date = new Date(),
): MuscleFreshness[] => {
  const nowMs = now.getTime();
  const fatigue = new Map<Muscle, number>();
  const add = (muscle: Muscle, amount: number) =>
    fatigue.set(muscle, (fatigue.get(muscle) ?? 0) + amount);

  for (const log of logs) {
    const finished = new Date(log.finished_at).getTime();
    if (!Number.isFinite(finished)) continue;
    const hours = Math.max(0, (nowMs - finished) / HOUR_MS);
    if (hours >= FULL_RECOVERY_H) continue;
    const decay = Math.pow(0.5, hours / FATIGUE_HALF_LIFE_H);

    for (const exercise of log.exercises) {
      const workingSets = exercise.sets.filter(
        (s) => s.completed && !s.isWarmup,
      ).length;
      if (workingSets === 0) continue;
      const mapping = lookupMuscles(exercise.name);
      if (!mapping) continue;
      for (const m of mapping.primary) add(m, workingSets * PRIMARY_WEIGHT * decay);
      for (const m of mapping.secondary) add(m, workingSets * SECONDARY_WEIGHT * decay);
    }
  }

  return TRACKED_MUSCLES.map((muscle) => ({
    muscle,
    freshness: 1 - Math.min(1, (fatigue.get(muscle) ?? 0) / FULL_FATIGUE),
  }));
};

/* ── Recovery-aware session trim ── */

/** When run_down: drop the LAST working set of each exercise that has ≥3
    working sets. Warmups untouched. Pure — returns a new session. */
export const trimSessionForRecovery = (session: ActiveSession): ActiveSession => ({
  ...session,
  exercises: session.exercises.map((exercise) => {
    const workingIndexes = exercise.sets
      .map((set, index) => (set.isWarmup ? -1 : index))
      .filter((index) => index >= 0);
    if (workingIndexes.length < 3) {
      return { ...exercise, sets: [...exercise.sets] };
    }
    const dropIndex = workingIndexes[workingIndexes.length - 1];
    return {
      ...exercise,
      sets: exercise.sets.filter((_, index) => index !== dropIndex),
    };
  }),
});
