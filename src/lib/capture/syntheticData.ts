import type { CapturedSession, HRSample, MotionSample } from "./types";
import { mean, mulberry32 } from "./utils";

type Options = { seed?: number };

const HR_HZ = 1;
const MOTION_HZ = 4;

const isoFromNow = (offsetS: number): string =>
  new Date(Date.now() + offsetS * 1000).toISOString();

const buildSession = (
  id: string,
  external_id: string,
  hr: HRSample[],
  motion: MotionSample[] | null,
  extras: {
    activity_type?: string;
    distance_m?: number;
    calories?: number;
  } = {},
): CapturedSession => {
  const duration_s = hr.length > 0 ? hr[hr.length - 1].t : 0;
  const bpms = hr.map((s) => s.bpm);
  return {
    id,
    provider: "strava",
    external_id,
    started_at: isoFromNow(-duration_s),
    ended_at: isoFromNow(0),
    hr_samples: hr,
    motion_samples: motion,
    aggregates: {
      avg_hr: Math.round(mean(bpms)),
      max_hr: hr.length === 0 ? 0 : Math.max(...bpms),
      duration_s,
      ...(extras.activity_type !== undefined && { activity_type: extras.activity_type }),
      ...(extras.distance_m !== undefined && { distance_m: extras.distance_m }),
      ...(extras.calories !== undefined && { calories: extras.calories }),
    },
    raw_payload: {
      synthetic: true,
      id,
      ...(extras.activity_type !== undefined && { type: extras.activity_type }),
    },
  };
};

const appendSegment = (
  hr: HRSample[],
  motion: MotionSample[],
  startT: number,
  durationS: number,
  hrFn: (tInSegment: number) => number,
  motionFn: (tInSegment: number) => number,
): number => {
  const hrSteps = Math.floor(durationS * HR_HZ);
  for (let i = 0; i < hrSteps; i++) {
    const t = startT + i / HR_HZ;
    hr.push({ t, bpm: hrFn(i / HR_HZ) });
  }
  const motionSteps = Math.floor(durationS * MOTION_HZ);
  for (let i = 0; i < motionSteps; i++) {
    const t = startT + i / MOTION_HZ;
    motion.push({ t, intensity: motionFn(i / MOTION_HZ) });
  }
  return startT + durationS;
};

/**
 * 5 sets of bench-press-like work: 60s work / 90s rest, smooth HR rise to ~150
 * then drop to ~80, motion peaks at 3s cadence during work.
 */
export const cleanLiftingSession = (options: Options = {}): CapturedSession => {
  const rand = mulberry32(options.seed ?? 42);
  const hr: HRSample[] = [];
  const motion: MotionSample[] = [];
  let t = 0;

  // 5-min warmup
  t = appendSegment(
    hr,
    motion,
    t,
    300,
    () => 75 + (rand() - 0.5) * 1.5,
    () => 0.05 + (rand() - 0.5) * 0.02,
  );

  // 5 sets
  for (let s = 0; s < 5; s++) {
    // Work: HR ramps 90 → 150 over 60s; motion oscillates at 3s cadence
    t = appendSegment(
      hr,
      motion,
      t,
      60,
      (ti) => 90 + (150 - 90) * (ti / 60) + (rand() - 0.5) * 2,
      (ti) => 0.55 + 0.35 * Math.sin((ti / 3) * 2 * Math.PI),
    );
    // Rest: HR drops 150 → 80 over 90s; motion near zero
    t = appendSegment(
      hr,
      motion,
      t,
      90,
      (ti) => 150 - (150 - 80) * (ti / 90) + (rand() - 0.5) * 1.5,
      () => 0.05 + (rand() - 0.5) * 0.02,
    );
  }

  return buildSession("synth-clean", "strava-clean-1", hr, motion, {
    activity_type: "WeightTraining",
  });
};

/**
 * Same shape as cleanLiftingSession but with ±10 BPM HR jitter and motion noise.
 */
export const noisyHRSession = (options: Options = {}): CapturedSession => {
  const rand = mulberry32(options.seed ?? 7);
  const hr: HRSample[] = [];
  const motion: MotionSample[] = [];
  let t = 0;

  t = appendSegment(
    hr,
    motion,
    t,
    300,
    () => 78 + (rand() - 0.5) * 12,
    () => 0.08 + (rand() - 0.5) * 0.1,
  );

  for (let s = 0; s < 5; s++) {
    t = appendSegment(
      hr,
      motion,
      t,
      60,
      (ti) => 92 + (148 - 92) * (ti / 60) + (rand() - 0.5) * 18,
      (ti) => 0.55 + 0.3 * Math.sin((ti / 3) * 2 * Math.PI) + (rand() - 0.5) * 0.15,
    );
    t = appendSegment(
      hr,
      motion,
      t,
      90,
      (ti) => 148 - (148 - 82) * (ti / 90) + (rand() - 0.5) * 14,
      () => 0.08 + (rand() - 0.5) * 0.1,
    );
  }

  return buildSession("synth-noisy", "strava-noisy-1", hr, motion, {
    activity_type: "WeightTraining",
  });
};

/**
 * 30-min run: 5-min warmup ramp, 20-min sustained at ~160 BPM, 5-min cooldown.
 * Motion is continuously high (no rep peaks). Should yield zero detected sets.
 */
export const cardioRunSession = (options: Options = {}): CapturedSession => {
  const rand = mulberry32(options.seed ?? 11);
  const hr: HRSample[] = [];
  const motion: MotionSample[] = [];
  let t = 0;

  // Warmup ramp 75 → 160 over 5 min
  t = appendSegment(
    hr,
    motion,
    t,
    300,
    (ti) => 75 + (160 - 75) * (ti / 300) + (rand() - 0.5) * 2,
    () => 0.6 + (rand() - 0.5) * 0.05,
  );
  // Sustained 160 BPM for 20 min
  t = appendSegment(
    hr,
    motion,
    t,
    1200,
    () => 160 + (rand() - 0.5) * 3,
    () => 0.65 + (rand() - 0.5) * 0.05,
  );
  // Cooldown ramp 160 → 90 over 5 min
  t = appendSegment(
    hr,
    motion,
    t,
    300,
    (ti) => 160 - (160 - 90) * (ti / 300) + (rand() - 0.5) * 2,
    (ti) => 0.4 - 0.3 * (ti / 300) + (rand() - 0.5) * 0.05,
  );

  return buildSession("synth-cardio", "strava-cardio-1", hr, motion, {
    activity_type: "Run",
    distance_m: 5000,
    calories: 360,
  });
};

/**
 * Cardio warmup → 4 strength sets → cardio cooldown. Detection should recover
 * the 4 strength sets (or close to it); cardio bookends collapse into long
 * windows that get filtered as non-set.
 */
export const mixedSession = (options: Options = {}): CapturedSession => {
  const rand = mulberry32(options.seed ?? 99);
  const hr: HRSample[] = [];
  const motion: MotionSample[] = [];
  let t = 0;

  // 5-min cardio warmup, HR rises 75 → 130 then drops back to 80 before lifting starts
  t = appendSegment(
    hr,
    motion,
    t,
    180,
    (ti) => 75 + (130 - 75) * (ti / 180) + (rand() - 0.5) * 2,
    () => 0.5 + (rand() - 0.5) * 0.05,
  );
  t = appendSegment(
    hr,
    motion,
    t,
    120,
    (ti) => 130 - (130 - 80) * (ti / 120) + (rand() - 0.5) * 2,
    (ti) => 0.4 - 0.35 * (ti / 120) + (rand() - 0.5) * 0.04,
  );

  // 4 strength sets
  for (let s = 0; s < 4; s++) {
    t = appendSegment(
      hr,
      motion,
      t,
      55,
      (ti) => 92 + (150 - 92) * (ti / 55) + (rand() - 0.5) * 2,
      (ti) => 0.55 + 0.3 * Math.sin((ti / 3) * 2 * Math.PI),
    );
    t = appendSegment(
      hr,
      motion,
      t,
      90,
      (ti) => 150 - (150 - 80) * (ti / 90) + (rand() - 0.5) * 1.5,
      () => 0.05 + (rand() - 0.5) * 0.02,
    );
  }

  // 5-min cardio cooldown — HR climbs to 135 then drops
  t = appendSegment(
    hr,
    motion,
    t,
    150,
    (ti) => 80 + (135 - 80) * (ti / 150) + (rand() - 0.5) * 2,
    () => 0.5 + (rand() - 0.5) * 0.05,
  );
  t = appendSegment(
    hr,
    motion,
    t,
    150,
    (ti) => 135 - (135 - 85) * (ti / 150) + (rand() - 0.5) * 2,
    (ti) => 0.45 - 0.4 * (ti / 150) + (rand() - 0.5) * 0.04,
  );

  return buildSession("synth-mixed", "strava-mixed-1", hr, motion, {
    activity_type: "Workout",
    distance_m: 1200,
    calories: 280,
  });
};

/**
 * Helper for tests: derive a CapturedSession with the motion stream stripped.
 */
export const withoutMotion = (session: CapturedSession): CapturedSession => ({
  ...session,
  motion_samples: null,
});

/**
 * 30-second blip: too short to contain a complete set.
 */
export const tooShortSession = (): CapturedSession => {
  const hr: HRSample[] = [];
  const motion: MotionSample[] = [];
  for (let i = 0; i < 30; i++) hr.push({ t: i, bpm: 70 + i });
  for (let i = 0; i < 30 * MOTION_HZ; i++) {
    motion.push({ t: i / MOTION_HZ, intensity: 0.5 });
  }
  return buildSession("synth-short", "strava-short-1", hr, motion, {
    activity_type: "WeightTraining",
  });
};

/**
 * One bench-set-like working window with no rest after.
 */
export const singleSetSession = (): CapturedSession => {
  const hr: HRSample[] = [];
  const motion: MotionSample[] = [];
  let t = 0;

  // Resting baseline for 2 min so the trailing-baseline lookup is happy
  t = appendSegment(hr, motion, t, 120, () => 75, () => 0.05);
  // One set, 60s work
  t = appendSegment(
    hr,
    motion,
    t,
    60,
    (ti) => 90 + (150 - 90) * (ti / 60),
    (ti) => 0.55 + 0.3 * Math.sin((ti / 3) * 2 * Math.PI),
  );
  // 90s rest
  t = appendSegment(
    hr,
    motion,
    t,
    90,
    (ti) => 150 - (150 - 80) * (ti / 90),
    () => 0.05,
  );

  return buildSession("synth-single", "strava-single-1", hr, motion, {
    activity_type: "WeightTraining",
  });
};
