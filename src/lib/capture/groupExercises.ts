import type {
  DetectedExerciseGroup,
  DetectedSet,
  ExerciseHistoryEntry,
} from "./types";
import { clamp, mean } from "./utils";

/**
 * Tunable grouping thresholds.
 */
export const GROUPING_THRESHOLDS = {
  /** Peak HR delta (BPM) within which consecutive sets are grouped. */
  HR_BAND: 8,
  /** Fractional duration delta within which consecutive sets are grouped (±30%). */
  DURATION_BAND: 0.3,
} as const;

/**
 * Group consecutive detected sets into "same exercise" buckets, attaching a
 * suggested name from the user's exercise history when one matches.
 *
 * History matching is best-effort: when no entry is within the configured
 * bands, `suggested_name` / `suggested_kind` stay null.
 */
export const groupSetsIntoExercises = (
  sets: DetectedSet[],
  userHistory: ExerciseHistoryEntry[] = [],
): DetectedExerciseGroup[] => {
  if (sets.length === 0) return [];

  const groups: DetectedSet[][] = [[sets[0]]];

  for (let i = 1; i < sets.length; i++) {
    const prev = groups[groups.length - 1].at(-1)!;
    const curr = sets[i];
    if (matchesPattern(prev, curr)) {
      groups[groups.length - 1].push(curr);
    } else {
      groups.push([curr]);
    }
  }

  return groups.map((groupSets, idx) => buildGroup(groupSets, idx, userHistory));
};

const matchesPattern = (a: DetectedSet, b: DetectedSet): boolean => {
  const hrClose = Math.abs(a.peak_hr - b.peak_hr) <= GROUPING_THRESHOLDS.HR_BAND;
  // Guard against zero-duration sets; if a.duration is 0, fall back to absolute compare
  const denom = a.duration_s > 0 ? a.duration_s : 1;
  const durClose =
    Math.abs(a.duration_s - b.duration_s) / denom <= GROUPING_THRESHOLDS.DURATION_BAND;
  return hrClose && durClose;
};

const buildGroup = (
  groupSets: DetectedSet[],
  index: number,
  history: ExerciseHistoryEntry[],
): DetectedExerciseGroup => {
  const avgPeakHR = mean(groupSets.map((s) => s.peak_hr));
  const avgDuration = mean(groupSets.map((s) => s.duration_s));
  const match = matchHistory(avgPeakHR, avgDuration, history);
  const setConfidence = mean(groupSets.map((s) => s.confidence));
  const sameness = groupSets.length > 1 ? estimateSameness(groupSets) : 0.7;
  const group_confidence = clamp(0.5 * setConfidence + 0.5 * sameness, 0, 1);

  return {
    id: `group-${index + 1}`,
    suggested_name: match?.name ?? null,
    suggested_kind: match?.kind ?? null,
    sets: groupSets,
    group_confidence,
  };
};

const matchHistory = (
  peakHR: number,
  duration: number,
  history: ExerciseHistoryEntry[],
): ExerciseHistoryEntry | null => {
  const candidates = history.filter(
    (h) =>
      h.typical_peak_hr !== undefined &&
      h.typical_duration_s !== undefined &&
      Math.abs(h.typical_peak_hr - peakHR) <= GROUPING_THRESHOLDS.HR_BAND &&
      Math.abs(h.typical_duration_s - duration) /
        (h.typical_duration_s || 1) <=
        GROUPING_THRESHOLDS.DURATION_BAND,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => {
    const dist =
      Math.abs(c.typical_peak_hr! - peakHR) +
      Math.abs(c.typical_duration_s! - duration);
    const bestDist =
      Math.abs(best.typical_peak_hr! - peakHR) +
      Math.abs(best.typical_duration_s! - duration);
    return dist < bestDist ? c : best;
  });
};

/** How tightly the sets in a group cluster around their averages. */
const estimateSameness = (groupSets: DetectedSet[]): number => {
  const peakAvg = mean(groupSets.map((s) => s.peak_hr));
  const durAvg = mean(groupSets.map((s) => s.duration_s));
  const peakSpread = mean(groupSets.map((s) => Math.abs(s.peak_hr - peakAvg)));
  const durSpread = mean(groupSets.map((s) => Math.abs(s.duration_s - durAvg)));
  // Map spreads to 0..1: small spread → near 1, large spread → near 0
  const peakScore = clamp(1 - peakSpread / GROUPING_THRESHOLDS.HR_BAND, 0, 1);
  const durScore = clamp(1 - durSpread / (durAvg * GROUPING_THRESHOLDS.DURATION_BAND || 1), 0, 1);
  return (peakScore + durScore) / 2;
};
