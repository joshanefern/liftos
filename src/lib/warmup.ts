import type { WorkoutSet } from "@/data/liftosMock";

export type WeightUnit = "lb" | "kg";

/** One rung of a warmup ramp. `pct` is a fraction of working weight; 0 = empty bar. */
export type WarmupTier = { pct: number; reps: number };

export const BAR_WEIGHT: Record<WeightUnit, number> = { lb: 45, kg: 20 };

const INCREMENT: Record<WeightUnit, number> = { lb: 5, kg: 2.5 };

export const DEFAULT_RAMP: WarmupTier[] = [
  { pct: 0, reps: 10 },
  { pct: 0.4, reps: 8 },
  { pct: 0.6, reps: 5 },
  { pct: 0.8, reps: 3 },
];

/** Working weights under ~1.5x bar don't need the full ladder. */
export const SHORT_RAMP: WarmupTier[] = [
  { pct: 0, reps: 10 },
  { pct: 0.8, reps: 3 },
];

export const roundToIncrement = (weight: number, unit: WeightUnit): number =>
  Math.round(weight / INCREMENT[unit]) * INCREMENT[unit];

export type WarmupOptions = {
  unit: WeightUnit;
  /** Override the ramp; when omitted, light working weights get SHORT_RAMP. */
  scheme?: WarmupTier[];
};

/**
 * Barbell warmup ramp for a working weight. Tiers that round below the empty
 * bar, at/above the working weight, or onto an already-emitted weight are
 * dropped — so a working weight at or below the bar yields no warmups.
 */
export const generateWarmupSets = (
  workingWeight: number,
  opts: WarmupOptions,
): WorkoutSet[] => {
  const bar = BAR_WEIGHT[opts.unit];
  if (!Number.isFinite(workingWeight) || workingWeight <= 0) return [];

  const scheme =
    opts.scheme ?? (workingWeight < bar * 1.5 ? SHORT_RAMP : DEFAULT_RAMP);

  // Same `set-${Date.now()}` id pattern as ActiveWorkoutLogger, with a suffix
  // because a whole ramp is generated inside one millisecond.
  const stamp = Date.now();
  const seen = new Set<number>();
  const sets: WorkoutSet[] = [];

  for (const tier of scheme) {
    const weight =
      tier.pct === 0 ? bar : roundToIncrement(workingWeight * tier.pct, opts.unit);
    if (weight < bar || weight >= workingWeight || seen.has(weight)) continue;
    seen.add(weight);
    sets.push({
      id: `set-${stamp}-w${sets.length}`,
      reps: tier.reps,
      weight,
      completed: false,
      isWarmup: true,
    });
  }
  return sets;
};
