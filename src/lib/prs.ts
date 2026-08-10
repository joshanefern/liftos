import type { WorkoutSet } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";

// PR engine — pure functions over WorkoutLog history (newest-first, though every
// entry point re-sorts chronologically so record dates never depend on input order).
//
// Eligibility rules:
// - Only completed, non-warm-up sets count ((set as any).isWarmup === true is excluded).
// - Weight and e1RM records require weight > 0 AND reps >= 1 — a completed set with
//   zero/missing reps is a failed or untracked lift and holds no record.
// - Rep records are tracked per weight tier; bodyweight sets (weight missing or 0)
//   share tier 0. Units (lb/kg) are opaque: tiers compare raw numbers.

export type PRKind = "weight" | "e1rm" | "reps";

type SetRef = { setId: string; logId: string | null; date: string | null };

export type WeightRecord = SetRef & { weight: number; reps: number };
export type E1RMRecord = SetRef & { e1rm: number; weight: number; reps: number };
export type RepsAtWeightRecord = SetRef & { weight: number; reps: number };

export type ExercisePRs = {
  exerciseName: string;
  maxWeight: WeightRecord | null;
  maxE1RM: E1RMRecord | null;
  maxRepsAtWeight: RepsAtWeightRecord[]; // one per weight tier, heaviest tier first
  dates: { weight: string | null; e1rm: string | null };
};

export type PREvent = {
  exerciseName: string;
  kind: PRKind;
  value: number; // e1rm values are raw floats — round at display time
  previousValue: number | null; // null when there was no prior record of this kind
  setId: string;
  weight?: number; // for "reps" events: the weight tier (0 = bodyweight)
  isFirst?: boolean; // first-ever recordable performance of this exercise
};

export type AllTimePR = {
  exerciseName: string;
  maxWeight: number | null;
  maxE1RM: number | null;
  maxReps: number | null;
  lastImproved: string;
};

// A just-finished session: either a saved WorkoutLog or an unsaved shape.
export type SessionLike = {
  id?: string | null;
  name: string;
  exercises: { name: string; sets: WorkoutSet[] }[];
};

export const epley1RM = (weight: number, reps: number): number => weight * (1 + reps / 30);

export const normalizeExerciseName = (name: string): string => name.trim().toLowerCase();

const isEligible = (set: WorkoutSet): boolean =>
  set.completed === true && (set as WorkoutSet & { isWarmup?: boolean }).isWarmup !== true;

const repsOf = (set: WorkoutSet): number | null =>
  typeof set.reps === "number" && set.reps >= 1 ? set.reps : null;

const weightOf = (set: WorkoutSet): number | null =>
  typeof set.weight === "number" && set.weight > 0 ? set.weight : null;

const chronological = (history: WorkoutLog[]): WorkoutLog[] =>
  [...history].sort((a, b) => Date.parse(a.finished_at) - Date.parse(b.finished_at));

export const exercisePRs = (history: WorkoutLog[], exerciseName: string): ExercisePRs => {
  const key = normalizeExerciseName(exerciseName);
  let displayName = exerciseName;
  let maxWeight: WeightRecord | null = null;
  let maxE1RM: E1RMRecord | null = null;
  const tiers = new Map<number, RepsAtWeightRecord>();

  for (const log of chronological(history)) {
    for (const exercise of log.exercises) {
      if (normalizeExerciseName(exercise.name) !== key) continue;
      displayName = exercise.name;
      for (const set of exercise.sets) {
        if (!isEligible(set)) continue;
        const reps = repsOf(set);
        const weight = weightOf(set);
        if (reps === null) continue;
        const ref: SetRef = { setId: set.id, logId: log.id, date: log.finished_at };
        if (weight !== null) {
          // Strict improvement only, so the record date is the first achievement;
          // an equal-weight set with more reps takes over the display record.
          if (!maxWeight || weight > maxWeight.weight || (weight === maxWeight.weight && reps > maxWeight.reps)) {
            maxWeight = { ...ref, weight, reps };
          }
          const e1rm = epley1RM(weight, reps);
          if (!maxE1RM || e1rm > maxE1RM.e1rm) {
            maxE1RM = { ...ref, e1rm, weight, reps };
          }
        }
        const tier = weight ?? 0;
        const current = tiers.get(tier);
        if (!current || reps > current.reps) {
          tiers.set(tier, { ...ref, weight: tier, reps });
        }
      }
    }
  }

  return {
    exerciseName: displayName,
    maxWeight,
    maxE1RM,
    maxRepsAtWeight: [...tiers.values()].sort((a, b) => b.weight - a.weight),
    dates: { weight: maxWeight?.date ?? null, e1rm: maxE1RM?.date ?? null },
  };
};

export const bestWeight = (history: WorkoutLog[], exerciseName: string): WeightRecord | null =>
  exercisePRs(history, exerciseName).maxWeight;

export const detectSessionPRs = (history: WorkoutLog[], session: SessionLike): PREvent[] => {
  const sessionId = session.id ?? null;
  const prior = sessionId ? history.filter((l) => l.id !== sessionId) : history;
  const events: PREvent[] = [];
  const seen = new Set<string>();

  for (const exercise of session.exercises) {
    const key = normalizeExerciseName(exercise.name);
    if (seen.has(key)) continue;
    seen.add(key);
    // Merge duplicate entries of the same exercise within the session.
    const sets = session.exercises
      .filter((e) => normalizeExerciseName(e.name) === key)
      .flatMap((e) => e.sets)
      .filter(isEligible);
    if (sets.length === 0) continue;

    const prs = exercisePRs(prior, exercise.name);
    const hadPrior = !!(prs.maxWeight || prs.maxE1RM || prs.maxRepsAtWeight.length > 0);

    // Best performances within this session, per kind.
    let bestW: { weight: number; reps: number; setId: string } | null = null;
    let bestE: { e1rm: number; setId: string } | null = null;
    const tierBest = new Map<number, { weight: number; reps: number; setId: string }>();
    for (const set of sets) {
      const reps = repsOf(set);
      const weight = weightOf(set);
      if (reps === null) continue;
      if (weight !== null) {
        if (!bestW || weight > bestW.weight || (weight === bestW.weight && reps > bestW.reps)) {
          bestW = { weight, reps, setId: set.id };
        }
        const e1rm = epley1RM(weight, reps);
        if (!bestE || e1rm > bestE.e1rm) bestE = { e1rm, setId: set.id };
      }
      const tier = weight ?? 0;
      const current = tierBest.get(tier);
      if (!current || reps > current.reps) tierBest.set(tier, { weight: tier, reps, setId: set.id });
    }

    if (!hadPrior) {
      // First-ever recordable performance: one event, no celebration numbers to beat.
      if (bestW) {
        events.push({ exerciseName: exercise.name, kind: "weight", value: bestW.weight, previousValue: null, setId: bestW.setId, isFirst: true });
      } else {
        let best: { reps: number; setId: string } | null = null;
        for (const t of tierBest.values()) if (!best || t.reps > best.reps) best = t;
        if (best) {
          events.push({ exerciseName: exercise.name, kind: "reps", value: best.reps, previousValue: null, setId: best.setId, isFirst: true });
        }
      }
      continue;
    }

    if (bestW && (!prs.maxWeight || bestW.weight > prs.maxWeight.weight)) {
      events.push({
        exerciseName: exercise.name,
        kind: "weight",
        value: bestW.weight,
        previousValue: prs.maxWeight ? prs.maxWeight.weight : null,
        setId: bestW.setId,
      });
    }
    if (bestE && (!prs.maxE1RM || bestE.e1rm > prs.maxE1RM.e1rm)) {
      events.push({
        exerciseName: exercise.name,
        kind: "e1rm",
        value: bestE.e1rm,
        previousValue: prs.maxE1RM ? prs.maxE1RM.e1rm : null,
        setId: bestE.setId,
      });
    }

    // Rep PR: only at tiers with a prior record (a never-logged weight would be a
    // trivial "record"); best candidate = largest rep improvement, heavier tier on ties.
    const priorTiers = new Map(prs.maxRepsAtWeight.map((r) => [r.weight, r.reps]));
    let repsEvent: PREvent | null = null;
    let bestDelta = 0;
    for (const t of tierBest.values()) {
      const prev = priorTiers.get(t.weight);
      if (prev === undefined || t.reps <= prev) continue;
      const delta = t.reps - prev;
      const beats = delta > bestDelta || (delta === bestDelta && repsEvent !== null && (repsEvent.weight ?? 0) < t.weight);
      if (beats) {
        bestDelta = delta;
        repsEvent = { exerciseName: exercise.name, kind: "reps", value: t.reps, previousValue: prev, setId: t.setId, weight: t.weight };
      }
    }
    if (repsEvent) events.push(repsEvent);
  }

  return events;
};

export const allTimePRs = (history: WorkoutLog[]): AllTimePR[] => {
  type State = {
    display: string;
    maxWeight: number | null;
    maxE1RM: number | null;
    tiers: Map<number, number>;
    lastImproved: string;
    hasAny: boolean;
  };
  const states = new Map<string, State>();

  for (const log of chronological(history)) {
    for (const exercise of log.exercises) {
      const key = normalizeExerciseName(exercise.name);
      for (const set of exercise.sets) {
        if (!isEligible(set)) continue;
        const reps = repsOf(set);
        const weight = weightOf(set);
        if (reps === null) continue;

        let state = states.get(key);
        if (!state) {
          state = { display: exercise.name, maxWeight: null, maxE1RM: null, tiers: new Map(), lastImproved: log.finished_at, hasAny: false };
          states.set(key, state);
        }
        state.display = exercise.name;

        let improved = false;
        if (!state.hasAny) {
          state.hasAny = true;
          improved = true; // first-ever performance counts as an improvement
        }
        if (weight !== null) {
          if (state.maxWeight === null || weight > state.maxWeight) {
            state.maxWeight = weight;
            improved = true;
          }
          const e1rm = epley1RM(weight, reps);
          if (state.maxE1RM === null || e1rm > state.maxE1RM) {
            state.maxE1RM = e1rm;
            improved = true;
          }
        }
        const tier = weight ?? 0;
        const prev = state.tiers.get(tier);
        if (prev === undefined) {
          state.tiers.set(tier, reps); // new tier alone is not an improvement
        } else if (reps > prev) {
          state.tiers.set(tier, reps);
          improved = true;
        }
        if (improved) state.lastImproved = log.finished_at;
      }
    }
  }

  return [...states.values()]
    .map((s) => ({
      exerciseName: s.display,
      maxWeight: s.maxWeight,
      maxE1RM: s.maxE1RM,
      maxReps: s.tiers.size ? Math.max(...s.tiers.values()) : null,
      lastImproved: s.lastImproved,
    }))
    .sort((a, b) => Date.parse(b.lastImproved) - Date.parse(a.lastImproved));
};
