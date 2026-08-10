import type { DetectedSet, HRSample, MotionSample } from "./types";
import { clamp, mean, stdDev } from "./utils";

/**
 * Tunable thresholds for v1 rule-based set detection.
 * Exported so consumers (UI, tests) can introspect or override later.
 */
export const DETECTION_THRESHOLDS = {
  /** BPM above trailing baseline to enter a working window. */
  HR_RISE: 15,
  /** BPM below the current run's peak to leave the working window. */
  HR_DROP: 10,
  /** 0..1 — motion intensity required to corroborate "working" when motion data is present. */
  MOTION_INTENSITY: 0.3,
  /** Minimum sustained working duration to count as a set (seconds). */
  MIN_WORK_DURATION_S: 10,
  /** Working windows separated by less than this gap (seconds) are merged. */
  MERGE_GAP_S: 8,
  /** Windows longer than this are treated as cardio and dropped. */
  MAX_SET_DURATION_S: 240,
  /** Trailing window for resting-baseline lookup (seconds). */
  BASELINE_WINDOW_S: 300,
  /** Default baseline when no trailing samples exist yet (BPM). */
  DEFAULT_REST_HR: 70,
  /** Minimum spacing between rep peaks (seconds) — caps cadence at ~1.5s/rep. */
  REP_PEAK_MIN_SEPARATION_S: 1.5,
  /** Motion intensity required to consider a sample a rep peak. */
  REP_PEAK_INTENSITY: 0.4,
  /**
   * Confidence below this value is flagged for user attention in the review
   * screen. Lives on the threshold object so the UI and tests share one source.
   */
  CONFIDENCE_FLAG: 0.6,
} as const;

type WindowIdx = { startIdx: number; endIdx: number };

/**
 * Detect discrete strength-style sets from heart-rate (and optional motion) samples.
 *
 * Returns an empty array for pure-cardio sessions (sustained HR with no rest gaps)
 * and for sessions too short / too quiet to register any working window.
 *
 * Samples must be sorted ascending by `t`.
 */
export const detectSets = (
  hrSamples: HRSample[],
  motionSamples: MotionSample[] | null = null,
): DetectedSet[] => {
  if (hrSamples.length === 0) return [];

  const motionLookup = motionSamples && motionSamples.length > 0
    ? new MotionLookup(motionSamples)
    : null;

  const windows: WindowIdx[] = [];
  let state: "rest" | "working" = "rest";
  let runStartIdx = -1;
  let runPeakHR = 0;
  // Minimum HR seen since the current rest period began. Re-entry to working
  // requires HR to rise HR_RISE above this local rest valley, which separates
  // "still recovering" from "starting a new effort" without needing motion.
  let restMinHR = Infinity;

  for (let i = 0; i < hrSamples.length; i++) {
    const sample = hrSamples[i];
    const baseline = trailingBaseline(hrSamples, i);
    const motion = motionLookup ? motionLookup.nearestAt(sample.t) : null;

    if (state === "rest") {
      restMinHR = Math.min(restMinHR, sample.bpm);
      const hrAboveBaseline =
        sample.bpm >= baseline + DETECTION_THRESHOLDS.HR_RISE;
      const hrAboveRestValley =
        sample.bpm >= restMinHR + DETECTION_THRESHOLDS.HR_RISE;
      const motionOK = motion === null
        ? true
        : motion >= DETECTION_THRESHOLDS.MOTION_INTENSITY;
      if (hrAboveBaseline && hrAboveRestValley && motionOK) {
        state = "working";
        runStartIdx = i;
        runPeakHR = sample.bpm;
      }
    } else {
      runPeakHR = Math.max(runPeakHR, sample.bpm);
      const hrDropped = sample.bpm <= runPeakHR - DETECTION_THRESHOLDS.HR_DROP;
      const motionLow = motion === null
        ? true
        : motion < DETECTION_THRESHOLDS.MOTION_INTENSITY;
      if (hrDropped && motionLow) {
        const dur = hrSamples[i - 1].t - hrSamples[runStartIdx].t;
        if (dur >= DETECTION_THRESHOLDS.MIN_WORK_DURATION_S) {
          windows.push({ startIdx: runStartIdx, endIdx: i - 1 });
        }
        state = "rest";
        runStartIdx = -1;
        runPeakHR = 0;
        restMinHR = sample.bpm;
      }
    }
  }

  // Close trailing working window if session ended mid-set
  if (state === "working" && runStartIdx >= 0) {
    const lastIdx = hrSamples.length - 1;
    const dur = hrSamples[lastIdx].t - hrSamples[runStartIdx].t;
    if (dur >= DETECTION_THRESHOLDS.MIN_WORK_DURATION_S) {
      windows.push({ startIdx: runStartIdx, endIdx: lastIdx });
    }
  }

  const merged = mergeAdjacent(windows, hrSamples, DETECTION_THRESHOLDS.MERGE_GAP_S);

  const validSets = merged.filter((w) => {
    const dur = hrSamples[w.endIdx].t - hrSamples[w.startIdx].t;
    return dur <= DETECTION_THRESHOLDS.MAX_SET_DURATION_S;
  });

  return validSets.map((w, idx) =>
    buildDetectedSet(w, idx, hrSamples, motionSamples),
  );
};

/** Trailing-window resting baseline: minimum HR observed in the last BASELINE_WINDOW_S seconds. */
const trailingBaseline = (samples: HRSample[], currentIdx: number): number => {
  const currentT = samples[currentIdx].t;
  const windowStart = currentT - DETECTION_THRESHOLDS.BASELINE_WINDOW_S;
  let min = Infinity;
  // Walk backwards from the previous sample so the current one doesn't poison the baseline
  for (let i = currentIdx - 1; i >= 0; i--) {
    if (samples[i].t < windowStart) break;
    if (samples[i].bpm < min) min = samples[i].bpm;
  }
  return min === Infinity ? DETECTION_THRESHOLDS.DEFAULT_REST_HR : min;
};

/**
 * Sliding lookup over a sorted motion-sample array.
 * Assumes `nearestAt` is called with monotonically non-decreasing `t`.
 */
class MotionLookup {
  private idx = 0;
  constructor(private readonly samples: MotionSample[]) {}

  nearestAt(t: number): number {
    while (
      this.idx < this.samples.length - 1 &&
      this.samples[this.idx + 1].t <= t
    ) {
      this.idx++;
    }
    return this.samples[this.idx]?.intensity ?? 0;
  }
}

const mergeAdjacent = (
  windows: WindowIdx[],
  hrSamples: HRSample[],
  maxGapS: number,
): WindowIdx[] => {
  if (windows.length <= 1) return [...windows];
  const out: WindowIdx[] = [windows[0]];
  for (let i = 1; i < windows.length; i++) {
    const last = out[out.length - 1];
    const next = windows[i];
    const gap = hrSamples[next.startIdx].t - hrSamples[last.endIdx].t;
    if (gap < maxGapS) {
      out[out.length - 1] = { startIdx: last.startIdx, endIdx: next.endIdx };
    } else {
      out.push(next);
    }
  }
  return out;
};

const buildDetectedSet = (
  window: WindowIdx,
  index: number,
  hrSamples: HRSample[],
  motionSamples: MotionSample[] | null,
): DetectedSet => {
  const winSamples = hrSamples.slice(window.startIdx, window.endIdx + 1);
  const start_s = winSamples[0].t;
  const end_s = winSamples[winSamples.length - 1].t;
  const duration_s = end_s - start_s;
  const bpms = winSamples.map((s) => s.bpm);
  const peak_hr = Math.max(...bpms);
  const avg_hr = mean(bpms);

  let estimated_reps: number | null = null;
  if (motionSamples && motionSamples.length > 0) {
    const motionInWindow = motionSamples.filter(
      (m) => m.t >= start_s && m.t <= end_s,
    );
    estimated_reps = countMotionPeaks(motionInWindow);
  }

  const baselineAtStart = trailingBaseline(hrSamples, window.startIdx);
  const confidence = computeConfidence({
    hrRise: peak_hr - baselineAtStart,
    duration_s,
    hasMotion: motionSamples !== null && motionSamples.length > 0,
    hrStdDev: stdDev(bpms),
  });

  return {
    id: `set-${index + 1}`,
    start_s,
    end_s,
    duration_s,
    peak_hr,
    avg_hr,
    estimated_reps,
    confidence,
  };
};

const countMotionPeaks = (samples: MotionSample[]): number => {
  if (samples.length < 3) return 0;
  let peaks = 0;
  let lastPeakT = -Infinity;
  for (let i = 1; i < samples.length - 1; i++) {
    const s = samples[i];
    if (s.intensity < DETECTION_THRESHOLDS.REP_PEAK_INTENSITY) continue;
    const isLocalMax =
      s.intensity > samples[i - 1].intensity &&
      s.intensity >= samples[i + 1].intensity;
    if (!isLocalMax) continue;
    if (s.t - lastPeakT < DETECTION_THRESHOLDS.REP_PEAK_MIN_SEPARATION_S) continue;
    peaks++;
    lastPeakT = s.t;
  }
  return peaks;
};

const computeConfidence = (args: {
  hrRise: number;
  duration_s: number;
  hasMotion: boolean;
  hrStdDev: number;
}): number => {
  let c = 0.5;
  if (args.hrRise >= 25) c += 0.2;
  else if (args.hrRise >= 15) c += 0.1;
  if (args.duration_s >= 15 && args.duration_s <= 90) c += 0.1;
  if (args.hasMotion) c += 0.1;
  if (args.hrStdDev > 15) c -= 0.2;
  return clamp(c, 0, 1);
};
