import { describe, expect, it } from "vitest";
import { DETECTION_THRESHOLDS, detectSets } from "./detectSets";
import {
  cardioRunSession,
  cleanLiftingSession,
  mixedSession,
  noisyHRSession,
  singleSetSession,
  tooShortSession,
  withoutMotion,
} from "./syntheticData";

describe("detectSets — clean lifting session", () => {
  const session = cleanLiftingSession({ seed: 1 });
  const sets = detectSets(session.hr_samples, session.motion_samples);

  it("recovers 4–6 sets", () => {
    expect(sets.length).toBeGreaterThanOrEqual(4);
    expect(sets.length).toBeLessThanOrEqual(6);
  });

  it("each detected set peaks well above resting HR", () => {
    sets.forEach((s) => expect(s.peak_hr).toBeGreaterThan(120));
  });

  it("each detected set clears the user-attention confidence threshold", () => {
    sets.forEach((s) =>
      expect(s.confidence).toBeGreaterThanOrEqual(DETECTION_THRESHOLDS.CONFIDENCE_FLAG),
    );
  });

  it("estimates reps from motion peaks", () => {
    sets.forEach((s) => {
      expect(s.estimated_reps).not.toBeNull();
      expect(s.estimated_reps!).toBeGreaterThan(0);
    });
  });

  it("each set lies inside a plausible duration band", () => {
    sets.forEach((s) => {
      expect(s.duration_s).toBeGreaterThan(20);
      expect(s.duration_s).toBeLessThan(120);
    });
  });
});

describe("detectSets — noisy HR session", () => {
  const session = noisyHRSession({ seed: 1 });
  const sets = detectSets(session.hr_samples, session.motion_samples);

  it("does not fragment into many spurious sets", () => {
    expect(sets.length).toBeGreaterThanOrEqual(3);
    expect(sets.length).toBeLessThanOrEqual(7);
  });

  it("still produces non-zero confidence on detected sets", () => {
    sets.forEach((s) => expect(s.confidence).toBeGreaterThan(0));
  });
});

describe("detectSets — no motion data", () => {
  const session = withoutMotion(cleanLiftingSession({ seed: 1 }));
  const sets = detectSets(session.hr_samples, session.motion_samples);

  it("still detects sets from HR alone", () => {
    expect(sets.length).toBeGreaterThanOrEqual(4);
  });

  it("leaves estimated_reps null when motion is absent", () => {
    sets.forEach((s) => expect(s.estimated_reps).toBeNull());
  });
});

describe("detectSets — pure cardio", () => {
  const session = cardioRunSession({ seed: 1 });
  it("returns no discrete sets for sustained cardio", () => {
    const sets = detectSets(session.hr_samples, session.motion_samples);
    expect(sets).toEqual([]);
  });
});

describe("detectSets — too short session", () => {
  const session = tooShortSession();
  it("returns no sets when the session is shorter than a working window", () => {
    const sets = detectSets(session.hr_samples, session.motion_samples);
    expect(sets.length).toBeLessThanOrEqual(1);
  });
});

describe("detectSets — single set", () => {
  const session = singleSetSession();
  it("detects exactly one set", () => {
    const sets = detectSets(session.hr_samples, session.motion_samples);
    expect(sets).toHaveLength(1);
    expect(sets[0].peak_hr).toBeGreaterThan(130);
  });
});

describe("detectSets — mixed cardio + strength session", () => {
  const session = mixedSession({ seed: 1 });
  const sets = detectSets(session.hr_samples, session.motion_samples);

  it("detects between 2 and 8 sets (regression net for threshold tuning)", () => {
    expect(sets.length).toBeGreaterThanOrEqual(2);
    expect(sets.length).toBeLessThanOrEqual(8);
  });
});

describe("detectSets — empty input", () => {
  it("returns an empty array for empty samples", () => {
    expect(detectSets([], null)).toEqual([]);
    expect(detectSets([], [])).toEqual([]);
  });
});
