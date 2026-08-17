import { describe, expect, it } from "vitest";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import type { WorkoutExercise } from "@/data/liftosMock";
import type { ActiveSession } from "@/pages/ActiveWorkout";
import {
  assessReadiness,
  muscleFreshnessFromLogs,
  trimSessionForRecovery,
  type MuscleFreshness,
  type RecoveryMetrics,
} from "./recovery";

/* ── Readiness fixtures ──
   All timestamps are built with the LOCAL Date constructor so the engine's
   local-time night attribution behaves identically in any test-runner TZ. */

const D = (day: number, hour: number, minute = 0) =>
  new Date(2026, 7, day, hour, minute); // August 2026
const NOW = D(16, 8); // Aug 16, 08:00 — a morning readiness check

const HOUR_MS = 3_600_000;

const emptyMetrics = (): RecoveryMetrics => ({
  hrv: [],
  restingHr: [],
  sleep: [],
  respiratory: [],
});

type NightOverrides = {
  hrv?: number | null;
  rhr?: number | null;
  sleepH?: number | null;
  resp?: number | null;
};

/** Night `i` mornings before NOW: asleep 23:00 → 23:00+sleepH, HRV + resp
    sampled at 03:00 (inside the window), RHR stamped 06:30 that morning. */
const addNight = (m: RecoveryMetrics, i: number, o: NightOverrides = {}) => {
  const sleepStart = D(15 - i, 23);
  const sleepH = o.sleepH === undefined ? 7.5 : o.sleepH;
  if (sleepH !== null) {
    m.sleep.push({
      start: sleepStart.toISOString(),
      end: new Date(sleepStart.getTime() + sleepH * HOUR_MS).toISOString(),
      stage: "asleep",
    });
  }
  const overnight = D(16 - i, 3).toISOString();
  if (o.hrv !== undefined && o.hrv !== null) m.hrv.push({ t: overnight, ms: o.hrv });
  if (o.rhr !== undefined && o.rhr !== null) {
    m.restingHr.push({ t: D(16 - i, 6, 30).toISOString(), bpm: o.rhr });
  }
  if (o.resp !== undefined && o.resp !== null) {
    m.respiratory.push({ t: overnight, brpm: o.resp });
  }
};

// 20 baseline nights (i = 1..20). RHR values are hand-picked so their
// 90th percentile (with a last-night 54 appended) is 53 and the 95th is 54 —
// the tier-1 vs tier-2 band-width tests hinge on that gap.
const HRV_BASE = [50, 52, 54, 56, 58, 60];
const RHR_BASE = [44, 46, 46, 47, 47, 48, 48, 48, 49, 49, 49, 50, 50, 50, 51, 51, 52, 52, 53, 55];
const RESP_BASE = [14.0, 14.2, 14.4];

const buildBaseline = (m: RecoveryMetrics, opts: { hrv?: boolean } = {}) => {
  for (let i = 1; i <= 20; i++) {
    addNight(m, i, {
      hrv: opts.hrv === false ? null : HRV_BASE[(i - 1) % HRV_BASE.length],
      rhr: RHR_BASE[i - 1],
      resp: RESP_BASE[(i - 1) % RESP_BASE.length],
      sleepH: 7.5,
    });
  }
};

const quietNight: NightOverrides = { hrv: 55, rhr: 48, resp: 14.2, sleepH: 7.5 };

describe("assessReadiness — flag counting", () => {
  it("0 flags → primed, silent (dot + word only)", () => {
    const m = emptyMetrics();
    buildBaseline(m);
    addNight(m, 0, quietNight);
    const result = assessReadiness(m, NOW);
    expect(result.state).toBe("primed");
    expect(result.tier).toBe(1);
    expect(result.flags).toEqual([]);
    expect(result.illness).toBe(false);
    expect(result.summary).toBeNull();
    expect(result.baselineDaysRemaining).toBeNull();
  });

  it("1 flag (HRV below band) → steady, still silent", () => {
    const m = emptyMetrics();
    buildBaseline(m);
    addNight(m, 0, { ...quietNight, hrv: 40 });
    const result = assessReadiness(m, NOW);
    expect(result.state).toBe("steady");
    expect(result.flags).toHaveLength(1);
    expect(result.flags[0].metric).toBe("hrv");
    expect(result.flags[0].label).toBe("HRV low");
    expect(result.flags[0].detail).toMatch(/^40 ms — below your \d+–\d+ range/);
    expect(result.summary).toBeNull();
  });

  it("2 flags → run_down with named flags and the concrete adjustment", () => {
    const m = emptyMetrics();
    buildBaseline(m);
    addNight(m, 0, { ...quietNight, hrv: 40, rhr: 60 });
    const result = assessReadiness(m, NOW);
    expect(result.state).toBe("run_down");
    expect(result.flags.map((f) => f.metric)).toEqual(["hrv", "rhr"]);
    expect(result.illness).toBe(false);
    expect(result.summary).toBe(
      "HRV and resting heart rate are both off your baseline. " +
        "Today's plan still works — the last set of your top lifts is dropped.",
    );
  });

  it("resp + RHR both fired → illness pattern with the easy-day copy", () => {
    const m = emptyMetrics();
    buildBaseline(m);
    addNight(m, 0, { ...quietNight, rhr: 60, resp: 16.5 });
    const result = assessReadiness(m, NOW);
    expect(result.state).toBe("run_down");
    expect(result.illness).toBe(true);
    expect(result.flags.map((f) => f.metric)).toEqual(["rhr", "resp"]);
    expect(result.summary).toBe(
      "Your overnight vitals look like you might be fighting something — worth an easy day. " +
        "Today's session is trimmed a set per lift.",
    );
  });

  it("an afternoon nap never masquerades as last night (post-noon anchor)", () => {
    const m = emptyMetrics();
    buildBaseline(m);
    // The real night: normal everything.
    addNight(m, 0, quietNight);
    // watchOS nap detection: 13:00–14:30 the same afternoon, with the dip
    // in HRV short naps produce.
    const napStart = D(16, 13);
    m.sleep.push({
      start: napStart.toISOString(),
      end: new Date(napStart.getTime() + 1.5 * HOUR_MS).toISOString(),
      stage: "asleep",
    });
    m.hrv.push({ t: D(16, 13, 30).toISOString(), ms: 38 });
    // Evening check-in AFTER the nap — the nap's night (tomorrow's key)
    // must not be assessable yet.
    const result = assessReadiness(m, D(16, 21));
    expect(result.state).toBe("primed");
    expect(result.flags).toEqual([]);
  });

  it("sleep at exactly 79% of the median flags; 81% does not", () => {
    const short = emptyMetrics();
    buildBaseline(short);
    addNight(short, 0, { ...quietNight, sleepH: 7.5 * 0.79 });
    const flagged = assessReadiness(short, NOW);
    expect(flagged.state).toBe("steady");
    expect(flagged.flags.map((f) => f.metric)).toEqual(["sleep"]);
    expect(flagged.flags[0].label).toBe("Sleep short");

    const okay = emptyMetrics();
    buildBaseline(okay);
    addNight(okay, 0, { ...quietNight, sleepH: 7.5 * 0.81 });
    const unflagged = assessReadiness(okay, NOW);
    expect(unflagged.state).toBe("primed");
    expect(unflagged.flags).toEqual([]);
  });

  it("one bad night inside a good week still flags — the band decides, not the week", () => {
    const m = emptyMetrics();
    buildBaseline(m); // trailing week averages ~55 ms, comfortably in band
    addNight(m, 0, { ...quietNight, hrv: 40 });
    const result = assessReadiness(m, NOW);
    expect(result.flags.map((f) => f.metric)).toEqual(["hrv"]);
    // The good week means no "7-day average" escalation in the detail.
    expect(result.flags[0].detail).not.toMatch(/7-day average/);
  });

  it("a low-ish night still INSIDE the band does not flag", () => {
    const m = emptyMetrics();
    buildBaseline(m);
    addNight(m, 0, { ...quietNight, hrv: 51 }); // above the 10th percentile (50)
    const result = assessReadiness(m, NOW);
    expect(result.state).toBe("primed");
    expect(result.flags).toEqual([]);
  });
});

describe("assessReadiness — fallback ladder", () => {
  it("tier 1: borderline RHR outside the 10–90 band fires the flag", () => {
    const m = emptyMetrics();
    buildBaseline(m);
    addNight(m, 0, { ...quietNight, rhr: 54 }); // p90 = 53, p95 = 54
    const result = assessReadiness(m, NOW);
    expect(result.tier).toBe(1);
    expect(result.flags.map((f) => f.metric)).toEqual(["rhr"]);
    expect(result.state).toBe("steady");
  });

  it("tier 2: HRV sparse → HRV flag dropped, bands widen to 5th–95th", () => {
    const m = emptyMetrics();
    buildBaseline(m, { hrv: false });
    // A lone wild HRV reading must not fire a flag, and the same borderline
    // RHR that flags under the tier-1 band sits inside the widened one.
    addNight(m, 0, { ...quietNight, hrv: 30, rhr: 54 });
    const result = assessReadiness(m, NOW);
    expect(result.tier).toBe(2);
    expect(result.state).toBe("primed");
    expect(result.flags).toEqual([]);
  });

  it("tier 2 still verdicts on RHR/sleep/resp — clearly elevated RHR flags", () => {
    const m = emptyMetrics();
    buildBaseline(m, { hrv: false });
    addNight(m, 0, { ...quietNight, hrv: null, rhr: 60 });
    const result = assessReadiness(m, NOW);
    expect(result.tier).toBe(2);
    expect(result.state).toBe("steady");
    expect(result.flags.map((f) => f.metric)).toEqual(["rhr"]);
  });

  it("tier 3: null metrics and empty metrics both stay silent", () => {
    for (const metrics of [null, emptyMetrics()]) {
      const result = assessReadiness(metrics, NOW);
      expect(result).toEqual({
        state: null,
        tier: 3,
        flags: [],
        illness: false,
        baselineDaysRemaining: null,
        summary: null,
      });
    }
  });

  it("tier 3: sleep-only data (bare iPhone, no wearable) is not a baseline to learn", () => {
    const m = emptyMetrics();
    for (let i = 0; i <= 20; i++) addNight(m, i, { sleepH: 7.5 });
    const result = assessReadiness(m, NOW);
    expect(result.tier).toBe(3);
    expect(result.state).toBeNull();
    expect(result.summary).toBeNull();
  });

  it("tier 4: wearable present but only 5 baseline nights → counting down from 14", () => {
    const m = emptyMetrics();
    for (let i = 0; i <= 4; i++) {
      addNight(m, i, { hrv: 55, rhr: 50, resp: 14.2, sleepH: 7.5 });
    }
    const result = assessReadiness(m, NOW);
    expect(result.tier).toBe(4);
    expect(result.state).toBeNull();
    expect(result.flags).toEqual([]);
    expect(result.baselineDaysRemaining).toBe(9);
    expect(result.summary).toBe("Learning your baseline — 9 days to go.");
  });

  it("full baseline but stale live data (watch off for days) → silent null, never a verdict", () => {
    const m = emptyMetrics();
    for (let i = 2; i <= 21; i++) {
      addNight(m, i, { hrv: 55, rhr: 50, resp: 14.2, sleepH: 7.5 });
    }
    const result = assessReadiness(m, NOW);
    expect(result.state).toBeNull();
    expect(result.tier).toBe(4);
    expect(result.summary).toBeNull();
    expect(result.baselineDaysRemaining).toBeNull();
  });
});

/* ── Muscle freshness ── */

let idCounter = 0;
const nextId = () => `id-${++idCounter}`;

const exercise = (
  name: string,
  workingSets: number,
  opts: { warmups?: number; incomplete?: number } = {},
): WorkoutExercise => ({
  id: nextId(),
  name,
  category: "Strength",
  target: "",
  sets: [
    ...Array.from({ length: opts.warmups ?? 0 }, () => ({
      id: nextId(),
      reps: 10,
      weight: 60,
      completed: true,
      isWarmup: true,
    })),
    ...Array.from({ length: workingSets }, () => ({
      id: nextId(),
      reps: 8,
      weight: 100,
      completed: true,
    })),
    ...Array.from({ length: opts.incomplete ?? 0 }, () => ({
      id: nextId(),
      reps: 8,
      weight: 100,
      completed: false,
    })),
  ],
});

const log = (finishedAt: Date, exercises: WorkoutExercise[]): WorkoutLog => ({
  id: nextId(),
  template_id: null,
  name: "Session",
  exercises,
  notes: null,
  started_at: null,
  finished_at: finishedAt.toISOString(),
  duration_minutes: 60,
  total_sets: exercises.reduce((n, e) => n + e.sets.length, 0),
  completed_sets: exercises.reduce(
    (n, e) => n + e.sets.filter((s) => s.completed).length,
    0,
  ),
  total_volume: 0,
  source: "manual",
  captured_session_id: null,
  created_at: finishedAt.toISOString(),
});

const freshnessOf = (list: MuscleFreshness[], muscle: string): number => {
  const entry = list.find((f) => f.muscle === muscle);
  expect(entry).toBeDefined();
  return entry!.freshness;
};

describe("muscleFreshnessFromLogs", () => {
  const sessionEnd = D(10, 18);

  it("is low right after a heavy session, with primary hit harder than secondary", () => {
    const logs = [log(sessionEnd, [exercise("Bench Press", 8)])];
    const fresh = muscleFreshnessFromLogs(logs, sessionEnd);
    // 8 working sets × 1.0, no decay → fatigue 8/10 → freshness 0.2.
    expect(freshnessOf(fresh, "chest")).toBeCloseTo(0.2, 5);
    // Secondary (triceps) weighted 0.5 → fatigue 4/10 → freshness 0.6.
    expect(freshnessOf(fresh, "triceps")).toBeCloseTo(0.6, 5);
    expect(freshnessOf(fresh, "triceps")).toBeGreaterThan(
      freshnessOf(fresh, "chest"),
    );
  });

  it("decays with a 60-hour half-life", () => {
    const logs = [log(sessionEnd, [exercise("Bench Press", 8)])];
    const later = new Date(sessionEnd.getTime() + 60 * HOUR_MS);
    const fresh = muscleFreshnessFromLogs(logs, later);
    // Fatigue halves: 4/10 → freshness 0.6.
    expect(freshnessOf(fresh, "chest")).toBeCloseTo(0.6, 5);
  });

  it("is fully fresh once a session is more than 7 days old", () => {
    const logs = [log(sessionEnd, [exercise("Back Squat", 10)])];
    const later = new Date(sessionEnd.getTime() + (7 * 24 + 1) * HOUR_MS);
    const fresh = muscleFreshnessFromLogs(logs, later);
    expect(freshnessOf(fresh, "quadriceps")).toBe(1);
    expect(fresh.every((f) => f.freshness === 1)).toBe(true);
  });

  it("counts only completed working sets — warmups and skipped sets are free", () => {
    const logs = [
      log(sessionEnd, [exercise("Bench Press", 3, { warmups: 2, incomplete: 1 })]),
    ];
    const fresh = muscleFreshnessFromLogs(logs, sessionEnd);
    // 3 counted sets → fatigue 3/10 → freshness 0.7.
    expect(freshnessOf(fresh, "chest")).toBeCloseTo(0.7, 5);
  });

  it("returns every tracked muscle, fresh when untouched, and ignores unknown exercises", () => {
    // Name chosen to dodge every fuzzy rule ("machine" would match "chin").
    const logs = [log(sessionEnd, [exercise("Zercher Yoke Contraption", 5)])];
    const fresh = muscleFreshnessFromLogs(logs, sessionEnd);
    expect(fresh.length).toBeGreaterThan(10);
    expect(fresh.every((f) => f.freshness === 1)).toBe(true);
  });
});

/* ── Session trim ── */

const session = (exercises: WorkoutExercise[]): ActiveSession => ({
  name: "Push Day",
  exercises,
  startedAt: D(16, 7).toISOString(),
});

describe("trimSessionForRecovery", () => {
  it("drops the LAST working set of an exercise with ≥3 working sets, keeping warmups", () => {
    const bench = exercise("Bench Press", 4, { warmups: 2 });
    const trimmed = trimSessionForRecovery(session([bench]));
    const sets = trimmed.exercises[0].sets;
    expect(sets).toHaveLength(5);
    expect(sets.filter((s) => s.isWarmup)).toHaveLength(2);
    // Exactly the final working set is gone; order and identity survive.
    expect(sets.map((s) => s.id)).toEqual(bench.sets.slice(0, -1).map((s) => s.id));
  });

  it("trims exactly-3 working sets down to 2", () => {
    const trimmed = trimSessionForRecovery(session([exercise("Squat", 3)]));
    expect(trimmed.exercises[0].sets).toHaveLength(2);
  });

  it("leaves exercises with 2 working sets untouched", () => {
    const curls = exercise("Bicep Curl", 2, { warmups: 1 });
    const trimmed = trimSessionForRecovery(session([curls]));
    expect(trimmed.exercises[0].sets.map((s) => s.id)).toEqual(
      curls.sets.map((s) => s.id),
    );
  });

  it("is pure — the original session is not mutated", () => {
    const bench = exercise("Bench Press", 4);
    const original = session([bench]);
    const trimmed = trimSessionForRecovery(original);
    expect(trimmed).not.toBe(original);
    expect(original.exercises[0].sets).toHaveLength(4);
    expect(trimmed.exercises[0].sets).toHaveLength(3);
  });
});
