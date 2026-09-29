import { formatRestClock } from "@/lib/sessionFocus";

/* ── The rest timer, as the lifter set it up.

     A remembered preference, not a per-workout setting: whether a rest
     countdown starts after a set, and how long it runs. It is OFF until
     the lifter adds it — rest is theirs to choose — and 2:00 is the length
     it starts with once they do.

     It lives in localStorage, so everything read back is checked: missing,
     corrupt or unreadable storage is the default, never an error, and a
     length is always a whole 5 seconds between 0:15 and 10:00. ── */

export const REST_TIMER_KEY = "liftos-rest-timer";

export type RestTimerPrefs = {
  /** A rest starts after each set. */
  on: boolean;
  /** How long it runs. */
  seconds: number;
};

export const MIN_REST_SECONDS = 15;
export const MAX_REST_SECONDS = 600;
/** Lengths are kept to this grain. */
const REST_GRAIN_SECONDS = 5;
/** What the fine-tune stepper moves by. */
export const REST_NUDGE_SECONDS = 15;
/** The lengths offered as one-tap choices. */
export const REST_PRESETS: readonly number[] = [30, 60, 90, 120, 180, 300];

export const DEFAULT_REST_TIMER: RestTimerPrefs = { on: false, seconds: 120 };

/** A usable length: rounded to 5 seconds, held to 0:15 … 10:00. Anything
    that is not a number is the default length. */
export const clampRestSeconds = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_REST_TIMER.seconds;
  const stepped = Math.round(value / REST_GRAIN_SECONDS) * REST_GRAIN_SECONDS;
  return Math.min(MAX_REST_SECONDS, Math.max(MIN_REST_SECONDS, stepped));
};

/** The length after one press of the stepper (`direction` is +1 or −1). */
export const nudgeRestSeconds = (seconds: number, direction: 1 | -1): number =>
  clampRestSeconds(seconds + direction * REST_NUDGE_SECONDS);

/** Prefs from whatever was stored. Only `on: true` turns the timer on. */
export const parseRestTimerPrefs = (raw: unknown): RestTimerPrefs => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return DEFAULT_REST_TIMER;
  const { on, seconds } = raw as Record<string, unknown>;
  return { on: on === true, seconds: clampRestSeconds(seconds) };
};

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

/** localStorage, or null where touching it throws (blocked site data). */
const browserStorage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const loadRestTimerPrefs = (
  storage: ReadableStorage | null = browserStorage(),
): RestTimerPrefs => {
  try {
    const raw = storage?.getItem(REST_TIMER_KEY);
    if (!raw) return DEFAULT_REST_TIMER;
    return parseRestTimerPrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_REST_TIMER;
  }
};

/** Remember the prefs, cleaned up the way a load would read them — and
    hand that back, so what the screen shows is what was kept. Storage
    that cannot be written only means the choice lasts this session. */
export const saveRestTimerPrefs = (
  prefs: RestTimerPrefs,
  storage: WritableStorage | null = browserStorage(),
): RestTimerPrefs => {
  const clean = parseRestTimerPrefs(prefs);
  try {
    storage?.setItem(REST_TIMER_KEY, JSON.stringify(clean));
  } catch {
    /* full or unavailable — the choice still holds until the app closes */
  }
  return clean;
};

/** The setting in plain words: "Off", or "2:00 after each set". */
export const restTimerSummary = (prefs: RestTimerPrefs): string =>
  prefs.on ? `${formatRestClock(prefs.seconds)} after each set` : "Off";
