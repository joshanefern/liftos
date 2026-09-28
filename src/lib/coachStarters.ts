import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { formatHold } from "@/lib/exerciseTracking";

/* ── Starting points for a blank coach chat.

     The chips are a promise: tapping one leads to an answer built from
     something the account really has. A lifter with no logs is never
     offered a review of a week that did not happen, and nobody is offered
     an adjustment to a workout that is not on today's card.

     One chip is answered on the device instead of by the model: the coach
     model is told about training data, not about this app's features, so a
     question about voice logging would get an invented answer. ── */

export type CoachStarterFacts = {
  /** Workouts logged, all time. */
  totalLogs: number;
  /** Workouts logged in the last 7 days. */
  logsLast7Days: number;
  /** Workouts saved in the library. */
  savedWorkouts: number;
  /** The app names a workout for today (the Home card's pick) — false once
      today's workout is logged and the pick turns to recovery. */
  hasWorkoutToday: boolean;
};

export type CoachStarterId =
  | "build-first"
  | "choose-routine"
  | "voice-help"
  | "adjust-today"
  | "thirty-minutes"
  | "replace-exercise"
  | "review-week"
  | "review-last-workout";

export type CoachStarter = {
  id: CoachStarterId;
  /** The chip's text, and the sentence it puts in the chat. */
  label: string;
  /** "draft" lands in the composer for the lifter to send or edit;
      "local" is answered on the device and never reaches the model. */
  action: "draft" | "local";
};

export const MAX_COACH_STARTERS = 4;

export const VOICE_HELP_QUESTION = "How does voice logging work?";

const STARTERS: Record<CoachStarterId, CoachStarter> = {
  "build-first": { id: "build-first", label: "Build my first workout", action: "draft" },
  "choose-routine": { id: "choose-routine", label: "Help me choose a routine", action: "draft" },
  "voice-help": { id: "voice-help", label: VOICE_HELP_QUESTION, action: "local" },
  "adjust-today": { id: "adjust-today", label: "Adjust today's workout", action: "draft" },
  "thirty-minutes": { id: "thirty-minutes", label: "I only have 30 minutes", action: "draft" },
  "replace-exercise": {
    id: "replace-exercise",
    label: "Find a replacement for an exercise",
    action: "draft",
  },
  "review-week": { id: "review-week", label: "Review my last week", action: "draft" },
  "review-last-workout": {
    id: "review-last-workout",
    label: "Review my last workout",
    action: "draft",
  },
};

const count = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

export const coachStarters = (facts: CoachStarterFacts): CoachStarter[] => {
  const total = count(facts.totalLogs);
  const recent = Math.min(count(facts.logsLast7Days), total);
  const saved = count(facts.savedWorkouts);
  const ids: CoachStarterId[] = [];

  if (total === 0 && saved === 0) {
    // Nothing logged, nothing saved: the questions a first day raises. The
    // app's own starter pick is not offered for adjusting — the lifter has
    // not chosen anything yet.
    ids.push("build-first", "choose-routine", "voice-help");
  } else {
    if (facts.hasWorkoutToday) ids.push("adjust-today");
    ids.push("thirty-minutes", "replace-exercise");
    if (total === 0) ids.push("voice-help");
    else ids.push(recent > 0 ? "review-week" : "review-last-workout");
  }

  return ids.slice(0, MAX_COACH_STARTERS).map((id) => STARTERS[id]);
};

/* ── What the page knows before it offers anything ────────────────────── */

export type CoachHistoryFacts = {
  /** Workouts held in memory. */
  logs: number;
  logsLoading: boolean;
  logsLoadFailed: boolean;
  /** Saved workouts held in memory. */
  savedWorkouts: number;
  savedLoading: boolean;
  savedLoadFailed: boolean;
};

export type CoachHistoryState = {
  /** The workout history can be read: some is held, or the load finished
      cleanly and found none. */
  logsKnown: boolean;
  /** Known, and empty — a new account. */
  noHistory: boolean;
  /** The load failed with nothing held. The page says so and offers a
      retry; it never reads this as "nothing logged". */
  logsUnavailable: boolean;
  /** Enough is known to choose the starting chips. */
  startersKnown: boolean;
};

/** A list that holds rows is known, whatever its load is doing: both
    providers keep what they had when a reload fails, and both go back to
    "loading" on every reload. Only an EMPTY list has to wait for a load
    that finished cleanly — empty while loading, or after a failure, is not
    a new account.

    The chips need the saved workouts only to tell the first day apart
    (`coachStarters` looks at them when nothing is logged), so once a
    workout is held a failed library load takes nothing away. */
export const coachHistoryState = (facts: CoachHistoryFacts): CoachHistoryState => {
  const logs = count(facts.logs);
  const saved = count(facts.savedWorkouts);
  const logsKnown = logs > 0 || (!facts.logsLoading && !facts.logsLoadFailed);
  const savedKnown = saved > 0 || (!facts.savedLoading && !facts.savedLoadFailed);
  return {
    logsKnown,
    noHistory: logsKnown && logs === 0,
    logsUnavailable: logs === 0 && facts.logsLoadFailed,
    startersKnown: logsKnown && (logs > 0 || savedKnown),
  };
};

const DAY_MS = 86_400_000;

const finishedAt = (log: WorkoutLog, now: number): number | null => {
  const t = Date.parse(log.finished_at);
  return Number.isFinite(t) && t <= now ? t : null;
};

/** Workouts finished inside the last `days` days — the "last 7 days" fact. */
export const countRecentLogs = (
  logs: WorkoutLog[],
  days: number = 7,
  now: number = Date.now(),
): number =>
  logs.filter((log) => {
    const t = finishedAt(log, now);
    return t !== null && now - t <= days * DAY_MS;
  }).length;

/* ── The voice-logging answer ─────────────────────────────────────────── */

const normalizeQuestion = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[?.!\s]+$/, "");

/** True for the voice-logging chip's question, however it was punctuated
    or capitalized. Deliberately exact: a wider net would pull real training
    questions away from the coach. */
export const isVoiceHelpQuestion = (text: string): boolean =>
  normalizeQuestion(text) === normalizeQuestion(VOICE_HELP_QUESTION);

/** Every sentence here describes behavior in VoiceLogControl and
    lib/voiceApply. The mic exists only in the iPhone app, so anywhere else
    the answer opens by saying so rather than pointing at a button that is
    not on the screen. */
export const voiceLoggingAnswer = ({ available }: { available: boolean }): string =>
  [
    available
      ? "**You log by voice while a workout is in progress.**"
      : "**Voice logging is part of the LiftOS iPhone app.** On iPhone, you log by voice while a workout is in progress.",
    "",
    "1. Tap the mic button, **Tap to speak**, at the bottom of the workout screen.",
    "2. Say what you did in plain words, for example “3 sets of 8 at 185 on bench”.",
    "3. Pause. The pause logs it, and a **Logged** card shows what was saved.",
    "",
    "To fix a mistake, tap **Edit** or **Undo** on that card, or say it: “actually that was 12 reps” corrects the last set, and “scratch that” clears it.",
    "",
    "The first time, your iPhone asks for microphone and speech permission.",
  ].join("\n");

/* ── What the review chips stand on ───────────────────────────────────── */

export type CoachWorkoutSummary = {
  name: string;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  days_ago: number;
  duration_min: number | null;
  total_volume: number;
  completed_sets: number;
  exercises: { name: string; sets_done: number; best_set: string }[];
};

const MAX_REVIEW_WORKOUTS = 7;
const MAX_REVIEW_EXERCISES = 12;
const REVIEW_WINDOW_DAYS = 7;

const localDay = (t: number): string => {
  const d = new Date(t);
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const localMidnight = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const positive = (value: number | undefined): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

/** The heaviest completed working set (most reps breaks a tie), else the
    longest hold, else the most reps. Null when nothing usable was logged.
    Cardio reports time only: its weight slot holds a distance, which would
    read as a load. */
const bestSet = (
  sets: WorkoutLog["exercises"][number]["sets"],
  cardio: boolean,
  units: string,
): string | null => {
  let weight = 0;
  let repsAtWeight = 0;
  let seconds = 0;
  let reps = 0;
  for (const set of sets) {
    const w = positive(set.weight);
    const r = positive(set.reps);
    if (w > weight || (w === weight && w > 0 && r > repsAtWeight)) {
      weight = w;
      repsAtWeight = r;
    }
    seconds = Math.max(seconds, positive(set.duration_seconds));
    reps = Math.max(reps, r);
  }
  if (cardio) return seconds > 0 ? formatHold(seconds) : null;
  if (weight > 0) return repsAtWeight > 0 ? `${weight} ${units} × ${repsAtWeight}` : `${weight} ${units}`;
  if (seconds > 0) return `${formatHold(seconds)} hold`;
  if (reps > 0) return `${reps} reps`;
  return null;
};

/** The workouts a review can honestly talk about: everything from the last
    7 days, or the single most recent workout when that week is empty.
    Newest first. The coach context otherwise carries totals only, so
    without this the model would review a workout it cannot see. */
export const recentWorkoutsForCoach = (
  logs: WorkoutLog[],
  units: string,
  now: number = Date.now(),
): CoachWorkoutSummary[] => {
  const dated = logs
    .map((log) => ({ log, t: finishedAt(log, now) }))
    .filter((entry): entry is { log: WorkoutLog; t: number } => entry.t !== null)
    .sort((a, b) => b.t - a.t);
  if (dated.length === 0) return [];

  const inWindow = dated.filter((entry) => now - entry.t <= REVIEW_WINDOW_DAYS * DAY_MS);
  const chosen = (inWindow.length > 0 ? inWindow : dated.slice(0, 1)).slice(0, MAX_REVIEW_WORKOUTS);
  const today = localMidnight(now);

  return chosen.map(({ log, t }) => ({
    name: log.name,
    date: localDay(t),
    // Calendar days, not elapsed 24h blocks: last night's workout is one
    // day ago at breakfast. Rounding absorbs a 23- or 25-hour DST day.
    days_ago: Math.max(0, Math.round((today - localMidnight(t)) / DAY_MS)),
    duration_min: positive(log.duration_minutes ?? undefined) || null,
    total_volume: Math.round(positive(log.total_volume)),
    completed_sets: positive(log.completed_sets),
    exercises: (log.exercises ?? [])
      .map((exercise) => {
        const done = (exercise.sets ?? []).filter((set) => set.completed && !set.isWarmup);
        const best = bestSet(done, exercise.kind === "cardio", units);
        return best === null ? null : { name: exercise.name, sets_done: done.length, best_set: best };
      })
      .filter((row): row is CoachWorkoutSummary["exercises"][number] => row !== null)
      .slice(0, MAX_REVIEW_EXERCISES),
  }));
};
