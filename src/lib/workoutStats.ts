import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { firstWorkoutTime } from "@/lib/consistency";
import { detectSessionPRs, normalizeExerciseName, type PREvent } from "@/lib/prs";
import { trainingDaysPerWeek } from "@/lib/trainingDays";

// Mon=0, Sun=6
const dayIndex = (date: Date) => (date.getDay() + 6) % 7;

/** A date's Mon=0 … Sun=6 index in its local week — the slot of its dot on
    Home's week card (today's is the ringed one). */
export const weekdayIndex = (date: Date): number => dayIndex(date);

const localMidnight = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/** Monday 00:00 LOCAL of the week `now` falls in. Stepped with setDate, not
    by subtracting 24h blocks, so a week that crosses a clock change still
    starts at midnight. */
export const weekStartFor = (now: Date = new Date()): Date => {
  const d = localMidnight(now);
  d.setDate(d.getDate() - dayIndex(now));
  return d;
};

const startOfCurrentWeek = () => weekStartFor(new Date());

/** The workouts of the week `now` falls in: finished from Monday 00:00 local
    to the end of today. The ONE week Home's week card and its overview
    sheet read, so the two can never disagree. A log dated on a later day (a
    clock set wrong, a bad import) belongs to no week yet — it would light a
    day that has not happened. Later TODAY still counts: another device's
    clock running a few minutes ahead must not hide a workout just logged. */
export const logsThisWeek = (logs: WorkoutLog[], now: Date = new Date()): WorkoutLog[] => {
  const from = weekStartFor(now).getTime();
  const tomorrow = localMidnight(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const to = tomorrow.getTime();
  return logs.filter((l) => {
    const t = Date.parse(l.finished_at);
    return Number.isFinite(t) && t >= from && t < to;
  });
};

export type WeekStats = {
  sessions: number;
  workedDayIndices: number[];
  totalVolume: number;
  /** Sum of duration_minutes for this week's logs (null durations count as 0). */
  totalMinutes: number;
};

export const getWeekStats = (logs: WorkoutLog[], now: Date = new Date()): WeekStats => {
  const weekLogs = logsThisWeek(logs, now);
  const indices = [...new Set(weekLogs.map((l) => dayIndex(new Date(l.finished_at))))];
  return {
    sessions: weekLogs.length,
    workedDayIndices: indices,
    totalVolume: weekLogs.reduce((s, l) => s + l.total_volume, 0),
    totalMinutes: weekLogs.reduce((s, l) => s + (l.duration_minutes ?? 0), 0),
  };
};

/** Planned workouts per week from the onboarding answer — "4 days" → 4,
    and for accounts that still hold a range, "3–4 days" → 3 (the low end;
    see trainingDaysPerWeek). null when the answer is missing or has no
    number, and the caller falls back to a plain session count. */
export const plannedSessionsPerWeek = (frequency: string | null | undefined): number | null =>
  trainingDaysPerWeek(frequency);

/** The records a logged workout set: bests it beat from history logged
    BEFORE it. Only earlier history counts — a later session's bigger number
    must not erase an earlier record. First-ever performances are excluded
    on purpose — every lift is a "record" the first time you do it, and a
    week-one user reading "12 PRs this month" learns the number means
    nothing. Home's records (this month's count, the week overview's list)
    all come from here. */
export const beatenRecords = (logs: WorkoutLog[], log: WorkoutLog): PREvent[] => {
  const finished = Date.parse(log.finished_at);
  if (!Number.isFinite(finished)) return [];
  const before = logs.filter((l) => l.id !== log.id && Date.parse(l.finished_at) < finished);
  return detectSessionPRs(before, log).filter((e) => !e.isFirst);
};

/** A workout's records grouped by lift: ONE entry per lift per workout
    (a lift can beat its weight, e1rm and reps bests in the same set). That
    is the unit Home counts records in — this month's count and the week
    overview's list both read it, so the list under the card's count adds
    up to it. A lift that beats its best in two workouts is two records. */
export const recordLiftsIn = (logs: WorkoutLog[], log: WorkoutLog): PREvent[][] => {
  const lifts = new Map<string, PREvent[]>();
  for (const event of beatenRecords(logs, log)) {
    const key = normalizeExerciseName(event.exerciseName);
    lifts.set(key, [...(lifts.get(key) ?? []), event]);
  }
  return [...lifts.values()];
};

/** Lifts that beat a PREVIOUS best in a session this calendar month, one
    per lift per session (see recordLiftsIn). */
export const countPRsThisMonth = (logs: WorkoutLog[], now: Date = new Date()): number => {
  let count = 0;
  for (const log of logs) {
    const finished = new Date(log.finished_at);
    if (Number.isNaN(finished.getTime())) continue;
    if (finished.getMonth() !== now.getMonth() || finished.getFullYear() !== now.getFullYear()) {
      continue;
    }
    count += recordLiftsIn(logs, log).length;
  }
  return count;
};

export type WeekObservationInput = {
  sessions: number;
  planned: number | null;
  weeklyStreak: number;
  prsThisMonth: number;
  prevWeekSessions: number;
};

/** The one line under the week card — freshest news first: this week's
    plan done, then records this month, then the consistency streak, then a
    neutral last-week comparison. null when history says nothing yet; the
    card shows no line rather than a filler. */
export const getWeekObservation = ({
  sessions,
  planned,
  weeklyStreak,
  prsThisMonth,
  prevWeekSessions,
}: WeekObservationInput): string | null => {
  if (planned !== null && sessions > 0 && sessions >= planned) return "This week's plan is done";
  if (prsThisMonth > 0) {
    return `${prsThisMonth} personal record${prsThisMonth === 1 ? "" : "s"} this month`;
  }
  if (weeklyStreak >= 2) return `${weeklyStreak} weeks in a row`;
  if (prevWeekSessions > 0) {
    return `Last week: ${prevWeekSessions} workout${prevWeekSessions === 1 ? "" : "s"}`;
  }
  return null;
};

/** Session count for last week (the full Mon–Sun before this one) — the
    neutral comparison This-week uses instead of a quota grade. */
export const getPrevWeekSessions = (logs: WorkoutLog[]): number => {
  const weekStart = startOfCurrentWeek();
  const prevStart = new Date(weekStart);
  prevStart.setDate(prevStart.getDate() - 7);
  return logs.filter((l) => {
    const d = new Date(l.finished_at);
    return d >= prevStart && d < weekStart;
  }).length;
};


/** Weekly streak — consecutive weeks (Mon-start, local) with at least one
    logged session. The research-backed consistency metric: alive with one
    workout a week, immune to programmed rest days (daily streaks shame
    people into junk sessions). The current week counts once it has a log,
    and an empty current week doesn't break a streak that ran through last
    week. */
export const getWeeklyStreak = (logs: WorkoutLog[]): number => {
  if (logs.length === 0) return 0;
  const weekStarts = new Set<number>();
  for (const log of logs) {
    const d = new Date(log.finished_at);
    if (Number.isNaN(d.getTime())) continue;
    const monday = localMidnight(d);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    weekStarts.add(monday.getTime());
  }
  const cursor = startOfCurrentWeek();
  let streak = 0;
  if (!weekStarts.has(cursor.getTime())) {
    cursor.setDate(cursor.getDate() - 7); // current week still open — look back
  }
  while (weekStarts.has(cursor.getTime())) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
};

/** Weekly volume goal for the dot-matrix meter: 10% above the trailing
    4-week average weekly volume, floored at 5,000 and rounded to the
    nearest 500 so the target reads as a round number. */
export const getWeeklyVolumeTarget = (logs: WorkoutLog[]): number => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 28);
  const recentVolume = logs
    .filter((l) => new Date(l.finished_at) >= cutoff)
    .reduce((s, l) => s + l.total_volume, 0);
  const avgWeekly = recentVolume / 4;
  return Math.round(Math.max(avgWeekly * 1.1, 5000) / 500) * 500;
};

const CONSISTENCY_WINDOW_DAYS = 28;

export type PlanConsistency = {
  /** Days the figure covers: 28, or fewer while the account is younger
      than that. */
  days: number;
  /** Workouts logged in those days. */
  done: number;
  /** Workouts the weekly plan asks for over the same days, as a whole
      number. */
  planned: number;
  /** Rounded % of `planned`, capped at 100. */
  pct: number;
};

/** Workouts logged against the weekly plan over the last four weeks, today
    included — or over the account's own history while it is younger than
    that, so a lifter one week in is graded on one week and not on three
    they did not have. Null when there is nothing to grade: no weekly plan,
    or no workout logged yet.

    The planned count is rounded the way plannedWorkoutsInMonth rounds it,
    so a young account reads the same figure here and on the Calendar. */
export const getConsistency = (
  logs: WorkoutLog[],
  frequencyStr: string | null,
  now: number = Date.now(),
): PlanConsistency | null => {
  const weekly = plannedSessionsPerWeek(frequencyStr);
  if (weekly === null) return null;
  const first = firstWorkoutTime(logs, now);
  if (first === null) return null;

  const today = localMidnight(new Date(now));
  const windowOpens = new Date(today);
  windowOpens.setDate(windowOpens.getDate() - (CONSISTENCY_WINDOW_DAYS - 1));
  const from = Math.max(windowOpens.getTime(), localMidnight(new Date(first)).getTime());
  // Rounded: a span that crosses a clock change is an hour short or long.
  const days = Math.round((today.getTime() - from) / 864e5) + 1;
  const planned = Math.max(1, Math.round((weekly * days) / 7));
  const done = logs.filter((l) => {
    const t = Date.parse(l.finished_at);
    return Number.isFinite(t) && t >= from && t <= now;
  }).length;
  return { days, done, planned, pct: Math.min(Math.round((done / planned) * 100), 100) };
};

export type SessionPoint = {
  date: string;
  volume: number;
  name: string;
  finished_at: string;
};

export const getRecentSessions = (logs: WorkoutLog[], limit = 10): SessionPoint[] =>
  [...logs]
    .sort((a, b) => new Date(a.finished_at).getTime() - new Date(b.finished_at).getTime())
    .slice(-limit)
    .map((log) => ({
      date: new Date(log.finished_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      volume: log.total_volume,
      name: log.name,
      finished_at: log.finished_at,
    }));

export type VolumePoint = { week: string; volume: number };

export const getVolumeTrend = (logs: WorkoutLog[]): VolumePoint[] => {
  // Buckets key on the week-start timestamp — year-less "Aug 4" labels parse
  // as year 2001 and mis-sort across a New Year boundary.
  const weeks: Record<number, number> = {};
  for (const log of logs) {
    const d = new Date(log.finished_at);
    const ws = new Date(d);
    ws.setDate(d.getDate() - dayIndex(d));
    ws.setHours(0, 0, 0, 0);
    weeks[ws.getTime()] = (weeks[ws.getTime()] ?? 0) + log.total_volume;
  }
  return Object.entries(weeks)
    .sort(([a], [b]) => Number(a) - Number(b))
    .slice(-8)
    .map(([ts, volume]) => ({
      week: new Date(Number(ts)).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      volume,
    }));
};

export type TopLift = { name: string; weight: number; reps: number };

export const getTopLifts = (logs: WorkoutLog[], limit = 5): TopLift[] => {
  const bests: Record<string, TopLift> = {};
  for (const log of logs) {
    for (const exercise of log.exercises) {
      for (const set of exercise.sets) {
        // Warmup sets never count toward bests (or any per-set stat here —
        // volume/set counts come from precomputed log totals). The inverted
        // comparison also rejects undefined/NaN weights from review imports.
        if (!set.completed || set.isWarmup || !(set.weight > 0)) continue;
        const existing = bests[exercise.name];
        if (!existing || set.weight > existing.weight) {
          bests[exercise.name] = { name: exercise.name, weight: set.weight, reps: set.reps };
        }
      }
    }
  }
  return Object.values(bests).sort((a, b) => b.weight - a.weight).slice(0, limit);
};

export const getMonthStats = (logs: WorkoutLog[]) => {
  const now = new Date();
  const monthLogs = logs.filter((l) => {
    const d = new Date(l.finished_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  return {
    count: monthLogs.length,
    volume: monthLogs.reduce((s, l) => s + l.total_volume, 0),
    avgSets: monthLogs.length
      ? Math.round(monthLogs.reduce((s, l) => s + l.completed_sets, 0) / monthLogs.length)
      : 0,
  };
};

export const getLogsByDay = (logs: WorkoutLog[]): Record<number, WorkoutLog[]> => {
  const map: Record<number, WorkoutLog[]> = {};
  for (const log of logs) {
    const d = localMidnight(new Date(log.finished_at)).getTime();
    if (!map[d]) map[d] = [];
    map[d].push(log);
  }
  return map;
};

/** `YYYY-MM-DD` in LOCAL time — the Calendar's ?day= deep-link key. */
export const localDayParam = (iso: string): string => {
  const d = new Date(iso);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
