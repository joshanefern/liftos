/* ── Effort tracking — how a set's work is measured, per exercise.
     Most lifts count reps; isometrics and carries count time. Either way the
     weight column stays optional, so a plank, a weighted plank, a pull-up and
     a weighted pull-up all log naturally:

       reps          bodyweight movements (push-up)          reps
       reps + lb     barbell / dumbbell lifts                reps × weight
       time          holds (plank, dead hang, wall sit)      duration
       time + lb     weighted holds / loaded carries         duration × weight

     The mode is inferred from the exercise name and can be overridden per
     exercise (WorkoutExercise.tracking) — inference is a default, never a
     cage. ── */

export type EffortTracking = "reps" | "time";

const TIMED_NAME = /\b(planks?|holds?|hangs?|carry|carries|wall sits?|l[- ]?sits?|farmers?|suitcase|yoke|sled push|sled drag|isometric|iso |bridges?)\b/;

export const inferTracking = (name: string): EffortTracking =>
  TIMED_NAME.test(name.trim().toLowerCase()) ? "time" : "reps";

/* Cardio by NAME — a treadmill run typed into a quick start must never get
   the reps/weight layout. "row" alone is a lift (Barbell Row); only the
   machine/erg forms count. Loaded carries stay timed strength work. */
const CARDIO_NAME =
  /\b(treadmill|run|runs|running|jog|jogging|sprints?|bike|biking|cycling|cycle|spin|peloton|rowing|rower|row machine|erg|elliptical|stair ?(master|climber|stepper)|stairs|walk|walking|hike|hiking|swim|swimming|jump ?rope|skipping|hiit|cardio|assault bike|airdyne|ski ?erg|battle ropes?)\b/;
const NOT_CARDIO = /\b(farmer|carry|carries|lunge|lunges|sled|suitcase|yoke)\b/;

export type InferredKind = "cardio" | "weighted";

/** "cardio" for cardio-named work, otherwise "weighted" (bodyweight is
    left to explicit data — the logger treats it like weighted anyway). */
export const inferKind = (name: string): InferredKind => {
  const n = name.trim().toLowerCase();
  if (!n) return "weighted";
  if (NOT_CARDIO.test(n)) return "weighted";
  return CARDIO_NAME.test(n) ? "cardio" : "weighted";
};

/** Explicit per-exercise setting wins; otherwise infer from the name. */
export const trackingFor = (exercise: {
  name: string;
  tracking?: EffortTracking;
}): EffortTracking => exercise.tracking ?? inferTracking(exercise.name);

/** Display seconds as a hold: "45s", "1:30", "1:02:05". */
export const formatHold = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
};

/** Input-field form of a hold — always m:ss ("0:45", "1:30") so the field
    reads unambiguously while editing. Display copy uses formatHold instead. */
export const formatHoldInput = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
};

/** Hold delta for trend lines: "+45s", "-1:10". */
export const formatHoldDelta = (deltaSeconds: number): string => {
  const sign = deltaSeconds < 0 ? "-" : "+";
  return `${sign}${formatHold(Math.abs(deltaSeconds))}`;
};

export const sanitizeHold = (raw: string): string =>
  // digits + at most one colon (keep the last — "1:2:30" was a typo for 12:30)
  raw.replace(/[^\d:]/g, "").replace(/:(?=.*:)/g, "").slice(0, 7);

/**
 * Parse a typed hold into seconds. Unlike cardio durations (where "30" means
 * 30 minutes), holds read bare digits as seconds — the plank mental model:
 *
 *   "45"    → 45s        "90"   → 90s (1:30)
 *   "130"   → 1:30       "1230" → 12:30
 *   "1:30"  → 1:30       ":45"  → 45s
 *
 * Returns null for empty/unparseable input.
 */
export const parseHoldSeconds = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;

  if (trimmed.includes(":")) {
    if (!/^\d*:\d*$/.test(trimmed)) return null;
    const [m, s] = trimmed.split(":");
    const mins = m === "" ? 0 : parseInt(m, 10);
    const secs = s === "" ? 0 : parseInt(s, 10);
    if (!Number.isFinite(mins) || !Number.isFinite(secs)) return null;
    const total = mins * 60 + secs;
    return total > 0 ? total : null;
  }

  if (!/^\d+$/.test(trimmed)) return null;
  let total: number;
  if (trimmed.length <= 2) {
    total = parseInt(trimmed, 10); // bare digits = seconds ("45", "90")
  } else {
    // "130" → 1:30, "1230" → 12:30
    total = parseInt(trimmed.slice(0, -2), 10) * 60 + parseInt(trimmed.slice(-2), 10);
  }
  return total > 0 ? total : null;
};

/**
 * Parse a typed cardio duration into seconds. Cardio thinks in minutes —
 * the treadmill mental model, opposite of holds:
 *
 *   "30"    → 30:00      "5"     → 5:00
 *   "30:30" → 30m 30s    ":45"   → 45s
 *
 * Returns null for empty/unparseable input.
 */
export const parseCardioSeconds = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.includes(":")) return parseHoldSeconds(trimmed);
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = parseInt(trimmed, 10);
  return minutes > 0 ? minutes * 60 : null;
};

/** Cardio hint/prefill form: whole minutes as a bare number ("30"), odd
    remainders as m:ss so nothing is silently rounded away. */
export const formatCardioInput = (totalSeconds: number): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  return s % 60 === 0 ? String(s / 60) : formatHoldInput(s);
};
