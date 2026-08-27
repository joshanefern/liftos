import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { getLiftTrends } from "@/lib/strengthTrend";

/* ── The Progress hero: one positively-framed overall number, angled at the
   goal chosen in onboarding. Strength people hear "stronger", hypertrophy
   people hear volume, fat-loss people hear showing up. The framing never
   goes negative — a rough stretch falls through to the next stat that is
   both positive and true (consistency always is, if any session exists).
   Returns null only when there is no history at all; the page's existing
   empty-state branch owns that case. ── */

export type ProgressHeroStat = {
  /** Big numeral: "+12%", "9". */
  value: string;
  /** Unit phrase beside the numeral: "stronger overall". */
  label: string;
  /** Kicker above the numeral, goal-flavored. */
  eyebrow: string;
  /** Supporting sentence — always positive, always literally true. */
  detail: string;
};

const DAY_MS = 86_400_000;
const TREND_WINDOW_DAYS = 84;
const TREND_MIN_SESSIONS = 2;

const finishedWithin = (log: WorkoutLog, days: number, now: number): boolean => {
  const t = Date.parse(log.finished_at);
  return Number.isFinite(t) && now - t <= days * DAY_MS && t <= now;
};

/** Mean relative gain across every weight lift with a trend. Null unless
    genuinely positive — flat or shrinking months use a different headline. */
const strongerOverall = (
  logs: WorkoutLog[],
  units: string,
  now: number,
): Omit<ProgressHeroStat, "eyebrow"> | null => {
  const trends = getLiftTrends(logs, TREND_WINDOW_DAYS, TREND_MIN_SESSIONS).filter(
    (t) => t.metric === "weight" && t.first > 0,
  );
  if (trends.length === 0) return null;
  // Peak-anchored: best-in-window vs start. A regression never reads as
  // negative — the summit already reached is the honest headline.
  const relative = (t: { first: number; points: number[] }) =>
    (Math.max(...t.points) - t.first) / t.first;
  const pct = Math.round(
    (trends.reduce((sum, t) => sum + relative(t), 0) / trends.length) * 100,
  );
  if (pct <= 0) return null;
  const best = [...trends].sort((a, b) => relative(b) - relative(a))[0];
  const lifts = trends.length === 1 ? "your main lift" : `${trends.length} lifts`;
  return {
    value: `+${pct}%`,
    label: "stronger overall",
    detail:
      best.delta > 0
        ? `Across ${lifts} these 12 weeks — ${best.name} leads, up ${best.delta} ${units}.`
        : `Across ${lifts} these 12 weeks.`,
  };
};

/** Last 4 weeks of volume vs the 4 before. Null unless both exist and it's up. */
const volumeUp = (
  logs: WorkoutLog[],
  units: string,
  now: number,
): Omit<ProgressHeroStat, "eyebrow"> | null => {
  const recent = logs.filter((l) => finishedWithin(l, 28, now));
  const prior = logs.filter((l) => !finishedWithin(l, 28, now) && finishedWithin(l, 56, now));
  const recentVol = recent.reduce((sum, l) => sum + (l.total_volume || 0), 0);
  const priorVol = prior.reduce((sum, l) => sum + (l.total_volume || 0), 0);
  if (recentVol <= 0 || priorVol <= 0) return null;
  const pct = Math.round(((recentVol - priorVol) / priorVol) * 100);
  if (pct <= 0) return null;
  return {
    value: `+${pct}%`,
    label: "more volume",
    detail: `${Math.round(recentVol).toLocaleString()} ${units} moved this month, up from ${Math.round(priorVol).toLocaleString()} the month before.`,
  };
};

/** Sessions banked — the stat that can't be negative. Falls back to the
    all-time count when the last month is empty. */
const showingUp = (
  logs: WorkoutLog[],
  now: number,
): Omit<ProgressHeroStat, "eyebrow"> | null => {
  const recent = logs.filter((l) => finishedWithin(l, 28, now));
  if (recent.length > 0) {
    const minutes = recent.reduce((sum, l) => sum + (l.duration_minutes ?? 0), 0);
    const hours = Math.round((minutes / 60) * 10) / 10;
    return {
      value: String(recent.length),
      label: recent.length === 1 ? "session this month" : "sessions this month",
      detail:
        minutes > 0
          ? `${hours} ${hours === 1 ? "hour" : "hours"} of training banked in the last 4 weeks — that work compounds.`
          : "Every one is in the bank — that work compounds.",
    };
  }
  if (logs.length > 0) {
    return {
      value: String(logs.length),
      label: logs.length === 1 ? "workout logged" : "workouts logged",
      detail: "All still here — pick it back up and the trends light right up.",
    };
  }
  return null;
};

type Focus = "strength" | "muscle" | "weight" | "general";

/** profiles.goal can be a comma-joined multi-select ("Hypertrophy, Strength"). */
const focusFor = (goal: string | null): Focus => {
  const g = (goal ?? "").toLowerCase();
  if (g.includes("strength")) return "strength";
  if (g.includes("hypertrophy")) return "muscle";
  if (g.includes("fat loss")) return "weight";
  return "general";
};

const EYEBROWS: Record<Focus, string> = {
  strength: "Getting stronger",
  muscle: "Building muscle",
  weight: "Putting in the work",
  general: "Moving forward",
};

export const buildProgressHero = (
  logs: WorkoutLog[],
  goal: string | null,
  units: string,
  now: number = Date.now(),
): ProgressHeroStat | null => {
  const focus = focusFor(goal);
  const stronger = () => strongerOverall(logs, units, now);
  const volume = () => volumeUp(logs, units, now);
  const consistent = () => showingUp(logs, now);

  const order =
    focus === "strength"
      ? [stronger, volume, consistent]
      : focus === "muscle"
        ? [volume, stronger, consistent]
        : focus === "weight"
          ? [consistent, volume, stronger]
          : [stronger, volume, consistent];

  for (const make of order) {
    const stat = make();
    if (stat) return { ...stat, eyebrow: EYEBROWS[focus] };
  }
  return null;
};
