import type { WorkoutLog } from "@/hooks/useWorkoutLogs";

/* ── Progress and Calendar helpers that read the whole log, not one lift.

     An account's history starts with its first logged workout. Nothing here
     counts time before that against the lifter: weeks, planned workouts and
     unlogged days all begin there, so a two-week-old account is never told
     it missed six weeks it did not have.

     The open week — one rule, in `lastCountedWeek`, for every count made
     in weeks. The current week counts once it holds a workout. While it is
     still empty it is left out: a week that has only just opened has not
     been missed, and a lifter who trains every week must read the same on
     Sunday morning as on Saturday night. A week only counts against the
     lifter once it has ended without a workout.

     weeksTrained — "N of the last M weeks trained". Weeks start Sunday in
     local time by default — the same rows the Calendar grid draws, so the
     tile and the grid agree on which week a Sunday session belongs to
     (`weekStartsOn` lets a caller pick Monday).

     weekStreak — weeks in a row with a workout, on those same rows and
     ending on the same week as weeksTrained, so the Progress tile and the
     Calendar streak tell one story. A streak counted in days reads 0 on
     every day off, so a lifter keeping a three-day plan to the letter
     would be told most mornings that the streak is gone.

     plannedWorkoutsInMonth — workouts logged in a month against the weekly
     plan, counted only over the days the account had a history.

     monthVolumeDelta — a calendar month's volume against the month before,
     only when the account was already training on the 1st of that earlier
     month.

     volumeComparison — total weight moved in the last 4 weeks against the 4
     before, once the history covers both windows. Deliberately a demoted,
     secondary number: more volume is not the same as being stronger, so the
     page shows it below the per-lift records. ── */

export const CONSISTENCY_WEEKS = 8;

const DAY_MS = 86_400_000;
const VOLUME_WINDOW_DAYS = 28;

/* Ceiling for the planned-workouts %, so a month far over plan stays a
   readable three digits instead of a five-digit number. */
const PLANNED_PCT_CAP = 999;

/** 0 = Sunday … 6 = Saturday, as `Date#getDay` numbers them. */
export type WeekStartDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Local midnight of the day that starts the week containing `date`. */
const weekStart = (date: Date, weekStartsOn: WeekStartDay): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() - weekStartsOn + 7) % 7));
  return d;
};

const localMidnight = (t: number): number => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Whole calendar days from one local midnight to another. Rounded, because
    a span that crosses a DST change is an hour short or long. */
const daysBetween = (from: number, to: number): number => Math.round((to - from) / DAY_MS);

/** When the account's history starts: the finish time of its earliest
    logged workout. Future and unparseable rows are not history. Null when
    nothing is logged. */
export const firstWorkoutTime = (logs: WorkoutLog[], now: number = Date.now()): number | null => {
  let first: number | null = null;
  for (const log of logs) {
    const t = Date.parse(log.finished_at);
    if (!Number.isFinite(t) || t > now) continue;
    if (first === null || t < first) first = t;
  }
  return first;
};

export type WeeksTrained = {
  /** Weeks in the window with at least one logged workout. */
  trained: number;
  /** Window size — the M in "N of the last M weeks". Never longer than the
      account's own history; 0 when nothing is logged. */
  weeks: number;
  /** The window is the account's whole history, which is shorter than the
      span that was asked for. */
  wholeHistory: boolean;
};

/** Start of every week that holds a logged workout. Future and
    unparseable rows are not history. */
const trainedWeekStarts = (
  logs: WorkoutLog[],
  now: number,
  weekStartsOn: WeekStartDay,
): Set<number> => {
  const weeks = new Set<number>();
  for (const log of logs) {
    const t = Date.parse(log.finished_at);
    if (!Number.isFinite(t) || t > now) continue;
    weeks.add(weekStart(new Date(t), weekStartsOn).getTime());
  }
  return weeks;
};

/** Start of the newest week that counts: the current week once it holds a
    workout, last week while it is still empty. */
const lastCountedWeek = (
  trainedWeeks: Set<number>,
  now: number,
  weekStartsOn: WeekStartDay,
): Date => {
  const week = weekStart(new Date(now), weekStartsOn);
  // Stepped by calendar days: a week that holds a clock change is 167 or
  // 169 hours long, and a step in milliseconds would miss its midnight.
  if (!trainedWeeks.has(week.getTime())) week.setDate(week.getDate() - 7);
  return week;
};

export const weeksTrained = (
  logs: WorkoutLog[],
  weeks: number = CONSISTENCY_WEEKS,
  now: number = Date.now(),
  weekStartsOn: WeekStartDay = 0,
): WeeksTrained => {
  const first = firstWorkoutTime(logs, now);
  if (first === null) return { trained: 0, weeks: 0, wholeHistory: true };

  const cap = Math.max(1, Math.floor(weeks));
  const trainedWeeks = trainedWeekStarts(logs, now, weekStartsOn);
  const closes = lastCountedWeek(trainedWeeks, now, weekStartsOn);
  const firstWeek = weekStart(new Date(first), weekStartsOn).getTime();

  // Weeks from the first workout's through the last one counted, inclusive.
  // Never 0: the first workout's own week is always trained. The window is
  // measured on these weeks, not on the calendar — otherwise the morning a
  // history turns eight weeks old the window would reach back past the
  // first workout to a week the account did not have.
  const lived = Math.round(daysBetween(firstWeek, closes.getTime()) / 7) + 1;
  const wholeHistory = lived < cap;
  const span = Math.min(lived, cap);

  const opens = new Date(closes);
  opens.setDate(opens.getDate() - (span - 1) * 7);

  let trained = 0;
  for (const ws of trainedWeeks) {
    if (ws >= opens.getTime() && ws <= closes.getTime()) trained += 1;
  }
  return { trained, weeks: span, wholeHistory };
};

/** Weeks in a row with at least one workout, ending on the last counted
    week. 0 when neither this week nor last week was trained. */
export const weekStreak = (
  logs: WorkoutLog[],
  now: number = Date.now(),
  weekStartsOn: WeekStartDay = 0,
): number => {
  const trainedWeeks = trainedWeekStarts(logs, now, weekStartsOn);
  const cursor = lastCountedWeek(trainedWeeks, now, weekStartsOn);
  let streak = 0;
  while (trainedWeeks.has(cursor.getTime())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
};

export const CONSISTENCY_EMPTY_COPY = "Your consistency history starts with your first workout.";

export type ConsistencyCopy = {
  /** The big numeral; null when a sentence says it better than a number. */
  value: number | null;
  /** Reads on from the numeral ("2" + "of your first 3 weeks trained"), or
      stands alone as a sentence when `value` is null. */
  caption: string;
};

/** The Consistency tile in words. A short history is described as what it
    is — the lifter's first weeks — and a one-week window never reads
    "1 of the last 1 weeks". */
export const describeConsistency = ({ trained, weeks, wholeHistory }: WeeksTrained): ConsistencyCopy => {
  if (weeks <= 0) return { value: null, caption: CONSISTENCY_EMPTY_COPY };
  if (weeks === 1) {
    if (wholeHistory) return { value: 1, caption: "week trained so far" };
    return {
      value: null,
      caption: trained > 0 ? "Trained this week." : "No workout logged this week yet.",
    };
  }
  return {
    value: trained,
    caption: wholeHistory
      ? `of your first ${weeks} weeks trained`
      : `of the last ${weeks} weeks trained`,
  };
};

export type PlannedProgress = {
  /** Workouts logged in the month. */
  done: number;
  /** Planned workouts over the counted days, as the whole number shown. */
  planned: number;
  /** Rounded % of `planned`, capped at three digits. */
  pct: number;
  /** Counting began at the first workout, part-way through this month. */
  sinceFirstWorkout: boolean;
};

/** Planned workouts completed in one calendar month (`month` is 0-based).
    Days are counted from the account's first workout, and no later than
    today. Null when there is no honest rate to give: no weekly plan, no
    history, or a month that lies wholly before the first workout or in the
    future.

    One denominator feeds both the % and its "N of about M" caption — the
    caption shows a whole number of planned workouts, so the % divides by
    that same whole number or the two contradict each other ("3 of about 3"
    reading 86%). */
export const plannedWorkoutsInMonth = (
  logs: WorkoutLog[],
  year: number,
  month: number,
  weeklyTarget: number | null,
  now: number = Date.now(),
): PlannedProgress | null => {
  if (weeklyTarget === null || !Number.isFinite(weeklyTarget) || weeklyTarget <= 0) return null;
  const first = firstWorkoutTime(logs, now);
  if (first === null) return null;

  const monthOpens = new Date(year, month, 1).getTime();
  const monthCloses = new Date(year, month + 1, 0).getTime();
  const firstDay = localMidnight(first);
  const from = Math.max(monthOpens, firstDay);
  const to = Math.min(monthCloses, localMidnight(now));
  if (from > to) return null;

  const days = daysBetween(from, to) + 1;
  const planned = Math.max(1, Math.round((Math.min(weeklyTarget, 7) * days) / 7));
  const done = logs.filter((log) => {
    const t = Date.parse(log.finished_at);
    if (!Number.isFinite(t) || t > now) return false;
    const d = new Date(t);
    return d.getFullYear() === year && d.getMonth() === month;
  }).length;

  return {
    done,
    planned,
    pct: Math.min(PLANNED_PCT_CAP, Math.round((done / planned) * 100)),
    sinceFirstWorkout: firstDay > monthOpens,
  };
};

/** Volume logged in one calendar month against the month before, as a
    rounded % (`month` is 0-based). Null when there is no fair comparison:

    - the history does not reach back to the 1st of the earlier month. A
      lifter who started on the 17th has half a month to be compared with,
      and ordinary training would read as a jump. Measured against the
      month asked for, not against today, because any past month can be
      asked for;
    - either month holds nothing to compare;
    - the month is still open and not ahead. A month in progress trails a
      finished one until its last week, however well it is going — being
      ahead is already true, being behind waits for the month to end. */
export const monthVolumeDelta = (
  logs: WorkoutLog[],
  year: number,
  month: number,
  now: number = Date.now(),
): number | null => {
  const first = firstWorkoutTime(logs, now);
  if (first === null) return null;

  const earlierOpens = new Date(year, month - 1, 1).getTime();
  if (localMidnight(first) > earlierOpens) return null;
  const monthOpens = new Date(year, month, 1).getTime();
  const monthCloses = new Date(year, month + 1, 1).getTime();

  let logged = 0;
  let volume = 0;
  let earlier = 0;
  for (const log of logs) {
    const t = Date.parse(log.finished_at);
    if (!Number.isFinite(t) || t > now || t < earlierOpens || t >= monthCloses) continue;
    const lifted = log.total_volume > 0 ? log.total_volume : 0;
    if (t >= monthOpens) {
      logged += 1;
      volume += lifted;
    } else {
      earlier += lifted;
    }
  }
  if (logged === 0 || earlier <= 0) return null;

  const pct = Math.round(((volume - earlier) / earlier) * 100);
  const stillOpen = now < monthCloses;
  return stillOpen && pct <= 0 ? null : pct;
};

export type VolumeComparison = {
  /** Total lifted in the last 4 weeks. */
  recent: number;
  /** Total lifted in the 4 weeks before that. */
  prior: number;
  /** Rounded % change; null until both windows have volume to compare. */
  pct: number | null;
};

/** True once the account's history reaches back at least `days`. A
    comparison against an earlier window is only fair when the lifter was
    already training for all of it — a six-week-old account measured against
    "the 4 weeks before" is being compared with two weeks of data. */
export const historyCovers = (
  logs: WorkoutLog[],
  days: number,
  now: number = Date.now(),
): boolean => {
  const first = firstWorkoutTime(logs, now);
  return first !== null && now - first >= days * DAY_MS;
};

export const volumeComparison = (
  logs: WorkoutLog[],
  now: number = Date.now(),
): VolumeComparison => {
  let recent = 0;
  let prior = 0;
  for (const log of logs) {
    const t = Date.parse(log.finished_at);
    if (!Number.isFinite(t) || t > now) continue;
    const volume = log.total_volume > 0 ? log.total_volume : 0;
    const age = now - t;
    if (age <= VOLUME_WINDOW_DAYS * DAY_MS) recent += volume;
    else if (age <= 2 * VOLUME_WINDOW_DAYS * DAY_MS) prior += volume;
  }
  // No percentage until the earlier window is a whole one: a partial window
  // makes ordinary training read as a huge jump.
  const comparable = historyCovers(logs, 2 * VOLUME_WINDOW_DAYS, now);
  const pct =
    comparable && recent > 0 && prior > 0
      ? Math.round(((recent - prior) / prior) * 100)
      : null;
  return { recent, prior, pct };
};

/** Short numeral for a volume total: "48.2k", "12k", "950". Unit is the
    caller's — it differs per profile. */
export const compactVolume = (volume: number): string => {
  const v = volume > 0 ? volume : 0;
  if (v < 1000) return String(Math.round(v));
  return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
};
