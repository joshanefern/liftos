import type {
  DetectedExerciseGroup,
  ExerciseHistoryEntry,
  HRSample,
  MotionSample,
  SessionAggregates,
} from "@/lib/capture";
import { detectSets, groupSetsIntoExercises } from "@/lib/capture";
import type { ExerciseKind, WorkoutExercise } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";

/**
 * Editable state used by the review screen. Strings (not numbers) for reps /
 * weight so inputs can be empty while editing without TS noise.
 */
export type EditableSet = {
  id: string;
  reps: string;
  weight: string;
  duration_seconds?: string;
  /** Distance in meters (stored canonical; UI converts to km/mi for display). */
  distance_m?: string;
  /** Per-row done flag (UI affordance during entry). Defaults true on save. */
  done?: boolean;
  /** Detection-only metadata, used for display. Not edited. */
  start_s?: number;
  end_s?: number;
  peak_hr?: number;
  confidence?: number;
};

export type EditableGroup = {
  id: string;
  name: string;
  kind: ExerciseKind;
  sets: EditableSet[];
  /** Detection-only confidence for the whole group. */
  group_confidence?: number;
};

const uid = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const newEmptyGroup = (kind: ExerciseKind = "weighted"): EditableGroup => {
  const id = uid("group");
  return {
    id,
    name: "",
    kind,
    sets: [{ id: uid(`${id}-set`), reps: "", weight: "" }],
  };
};

/**
 * Create an empty cardio EditableGroup for the manual-add case (e.g., user
 * clicks "Add cardio" from inside a mixed-mode review). Captured-session
 * cardio summaries use a separate `EditableCardioBlock` (top of page), not
 * an EditableGroup.
 */
export const newCardioGroup = (defaultName?: string): EditableGroup => {
  const id = uid("cardio");
  return {
    id,
    name: defaultName ?? "",
    kind: "cardio",
    sets: [
      {
        id: uid(`${id}-set`),
        reps: "",
        weight: "",
        duration_seconds: "",
        distance_m: "",
      },
    ],
  };
};

/** Top-of-page cardio summary for a captured session. Separate from groups. */
export type EditableCardioBlock = {
  name: string;
  /** Total seconds (canonical). UI renders as mm:ss. */
  duration_s: string;
  /** Meters (canonical). UI renders as km/mi based on units pref. */
  distance_m: string;
  /** BPM. */
  avg_hr: string;
  /** kcal. */
  calories: string;
};

export const initCardioBlockFromAggregates = (
  aggregates: SessionAggregates,
  activityType: string | null,
): EditableCardioBlock => ({
  name: activityType ?? "",
  duration_s:
    aggregates.duration_s !== undefined
      ? String(Math.round(aggregates.duration_s))
      : "",
  distance_m:
    aggregates.distance_m !== undefined
      ? String(Math.round(aggregates.distance_m))
      : "",
  avg_hr:
    aggregates.avg_hr !== undefined ? String(Math.round(aggregates.avg_hr)) : "",
  calories:
    aggregates.calories !== undefined
      ? String(Math.round(aggregates.calories))
      : "",
});

export const newEmptyCardioBlock = (): EditableCardioBlock => ({
  name: "",
  duration_s: "",
  distance_m: "",
  avg_hr: "",
  calories: "",
});

export const cardioBlockToExercise = (
  block: EditableCardioBlock,
  fallbackName: string,
): WorkoutExercise => {
  const name = block.name.trim() || fallbackName || "Cardio";
  const id = uid("ex-cardio");
  return {
    id,
    name,
    kind: "cardio",
    category: name,
    target: "From smart review",
    sets: [
      {
        id: uid(`${id}-set`),
        reps: undefined,
        weight: undefined,
        duration_seconds: parseIntOrUndefined(block.duration_s),
        distance_m: parseFloatOrUndefined(block.distance_m),
        completed: true,
      },
    ],
  };
};

export const cardioBlockHasContent = (block: EditableCardioBlock): boolean =>
  block.duration_s.trim() !== "" ||
  block.distance_m.trim() !== "" ||
  block.calories.trim() !== "";

export const newEmptySet = (groupId: string): EditableSet => ({
  id: uid(`${groupId}-set`),
  reps: "",
  weight: "",
});

export const detectedGroupsToEditable = (
  groups: DetectedExerciseGroup[],
): EditableGroup[] =>
  groups.map((g) => ({
    id: g.id,
    name: g.suggested_name ?? "",
    kind: g.suggested_kind ?? "weighted",
    group_confidence: g.group_confidence,
    sets: g.sets.map((s) => ({
      id: s.id,
      // Detection gives us set count and rough timing only — rep/weight values
      // are user-provided. HR-inferred reps are guesses, not measurements.
      reps: "",
      weight: "",
      start_s: s.start_s,
      end_s: s.end_s,
      peak_hr: s.peak_hr,
      confidence: s.confidence,
    })),
  }));

export const workoutLogToEditable = (log: WorkoutLog): EditableGroup[] =>
  log.exercises.map((ex) => ({
    id: ex.id,
    name: ex.name,
    kind: ex.kind ?? "weighted",
    sets: ex.sets.map((set) => ({
      id: set.id,
      reps: set.reps !== undefined ? String(set.reps) : "",
      weight: set.weight !== undefined ? String(set.weight) : "",
      duration_seconds:
        set.duration_seconds !== undefined ? String(set.duration_seconds) : undefined,
      distance_m:
        set.distance_m !== undefined ? String(set.distance_m) : undefined,
    })),
  }));

export const buildEditableFromCaptured = (
  hr_samples: HRSample[] | null,
  motion_samples: MotionSample[] | null,
  history: ExerciseHistoryEntry[],
): EditableGroup[] => {
  if (!hr_samples || hr_samples.length === 0) return [];
  const sets = detectSets(hr_samples, motion_samples);
  const groups = groupSetsIntoExercises(sets, history);
  return detectedGroupsToEditable(groups);
};

export const buildExerciseNameHistory = (logs: WorkoutLog[]): string[] => {
  const names = new Set<string>();
  for (const log of logs) {
    for (const ex of log.exercises) {
      const trimmed = ex.name?.trim();
      if (trimmed) names.add(trimmed);
    }
  }
  return Array.from(names).sort();
};

export const buildLabelHistory = (logs: WorkoutLog[]): string[] => {
  const names = new Set<string>();
  for (const log of logs) {
    const trimmed = log.name?.trim();
    if (trimmed) names.add(trimmed);
  }
  return Array.from(names).sort();
};

export const lastWeightForExercise = (
  logs: WorkoutLog[],
  exerciseName: string,
): number | null => {
  const normalized = exerciseName.trim().toLowerCase();
  if (!normalized) return null;
  for (const log of logs) {
    for (const ex of log.exercises) {
      if (ex.name.trim().toLowerCase() !== normalized) continue;
      for (const set of ex.sets) {
        if (set.weight !== undefined && set.weight > 0) return set.weight;
      }
    }
  }
  return null;
};

export const lastRepsForExercise = (
  logs: WorkoutLog[],
  exerciseName: string,
): number | null => {
  const normalized = exerciseName.trim().toLowerCase();
  if (!normalized) return null;
  for (const log of logs) {
    for (const ex of log.exercises) {
      if (ex.name.trim().toLowerCase() !== normalized) continue;
      for (const set of ex.sets) {
        if (set.reps !== undefined && set.reps > 0) return set.reps;
      }
    }
  }
  return null;
};

const parseIntOrUndefined = (s: string): number | undefined => {
  if (!s.trim()) return undefined;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : undefined;
};

const parseFloatOrUndefined = (s: string): number | undefined => {
  if (!s.trim()) return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
};

export const editableToExercises = (
  groups: EditableGroup[],
): WorkoutExercise[] =>
  groups.map((g, idx) => ({
    id: g.id || `ex-${idx}`,
    name: g.name.trim() || `Exercise ${idx + 1}`,
    kind: g.kind,
    category: g.name.trim() || "From review",
    target: "From smart review",
    sets: g.sets.map((s, sIdx) => ({
      id: s.id || `${g.id}-set-${sIdx + 1}`,
      reps: parseIntOrUndefined(s.reps),
      weight: parseFloatOrUndefined(s.weight),
      duration_seconds: parseIntOrUndefined(s.duration_seconds ?? ""),
      distance_m: parseFloatOrUndefined(s.distance_m ?? ""),
      completed: s.done ?? true,
    })),
  }));

export const editableVolume = (groups: EditableGroup[]): number => {
  let total = 0;
  for (const g of groups) {
    for (const s of g.sets) {
      const reps = parseIntOrUndefined(s.reps) ?? 0;
      const weight = parseFloatOrUndefined(s.weight) ?? 0;
      total += reps * weight;
    }
  }
  return total;
};

export const editableTotalSets = (groups: EditableGroup[]): number =>
  groups.reduce((sum, g) => sum + g.sets.length, 0);

export const mergeGroupUp = (
  groups: EditableGroup[],
  groupId: string,
): EditableGroup[] => {
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx <= 0) return groups;
  const above = groups[idx - 1];
  const curr = groups[idx];
  const merged: EditableGroup = {
    ...above,
    sets: [...above.sets, ...curr.sets],
  };
  return [...groups.slice(0, idx - 1), merged, ...groups.slice(idx + 1)];
};

/**
 * Mixed-mode false-positive filter for detected groups.
 *
 * Cardio bookends (warmup / cooldown) routinely show up in the detector when a
 * Strava "Workout" or "Crossfit" session has cardio padding around the lifting
 * portion. They look like: long sustained working window, lower peak HR than
 * the actual strength sets.
 *
 * Rule: drop a group from the *boundary* (first or last in chronological
 * order) if its total span > 120s AND its peak HR is below the median peak HR
 * of all detected groups. Middle false positives stay (rare; user deletes
 * manually). Genuine long sets at the boundaries also stay if their peak HR
 * matches the median.
 */
export const filterMixedFalsePositives = (
  groups: EditableGroup[],
): EditableGroup[] => {
  if (groups.length < 2) return groups;

  const groupPeakHR = (g: EditableGroup): number => {
    const peaks = g.sets
      .map((s) => s.peak_hr ?? 0)
      .filter((p) => p > 0);
    return peaks.length > 0 ? Math.max(...peaks) : 0;
  };
  const groupSpan = (g: EditableGroup): number => {
    const starts = g.sets.map((s) => s.start_s).filter((v): v is number => v !== undefined);
    const ends = g.sets.map((s) => s.end_s).filter((v): v is number => v !== undefined);
    if (starts.length === 0 || ends.length === 0) return 0;
    return Math.max(...ends) - Math.min(...starts);
  };

  const peaks = groups.map(groupPeakHR).filter((p) => p > 0).sort((a, b) => a - b);
  if (peaks.length === 0) return groups;
  const median = peaks[Math.floor(peaks.length / 2)];

  const isBoundary = (idx: number): boolean =>
    idx === 0 || idx === groups.length - 1;

  return groups.filter((g, idx) => {
    if (!isBoundary(idx)) return true;
    const span = groupSpan(g);
    const peak = groupPeakHR(g);
    const isLongAndQuiet = span > 120 && peak < median;
    return !isLongAndQuiet;
  });
};

export const splitGroup = (
  groups: EditableGroup[],
  groupId: string,
): EditableGroup[] => {
  const idx = groups.findIndex((g) => g.id === groupId);
  if (idx < 0) return groups;
  const g = groups[idx];
  if (g.sets.length < 2) return groups;
  const mid = Math.floor(g.sets.length / 2);
  const a: EditableGroup = { ...g, sets: g.sets.slice(0, mid) };
  const b: EditableGroup = {
    ...g,
    id: uid("group"),
    sets: g.sets.slice(mid),
  };
  return [...groups.slice(0, idx), a, b, ...groups.slice(idx + 1)];
};
