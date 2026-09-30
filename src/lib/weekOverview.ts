import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { compactVolume } from "@/lib/consistency";
import { formatHold } from "@/lib/exerciseTracking";
import { normalizeExerciseName, type PREvent } from "@/lib/prs";
import {
  logsThisWeek,
  recordLiftsIn,
  weekdayIndex,
  weekStartFor,
} from "@/lib/workoutStats";

/* ── Home's "This week" card and the overview sheet it opens. Both read
   this one object, built on logsThisWeek, so the card's dots and count and
   the sheet's days and totals are the same week by construction. ── */

export type WeekHeadline = {
  count: number;
  /** Workouts a week from the onboarding answer; null = no plan, and the
      headline is a plain count. */
  planned: number | null;
  /** The words after the number(s). */
  noun: string;
};

export const weekHeadline = (count: number, planned: number | null): WeekHeadline => ({
  count,
  planned,
  noun: planned !== null ? "planned workouts" : count === 1 ? "workout" : "workouts",
});

/** The headline as one line: "1 of 4 planned workouts", "3 workouts". */
export const headlineText = ({ count, planned, noun }: WeekHeadline): string =>
  planned !== null ? `${count} of ${planned} ${noun}` : `${count} ${noun}`;

export type WeekWorkout = {
  id: string;
  name: string;
  /** "12 sets · 9.4k lb · 52 min" — only the parts the log has. */
  detail: string;
};

/** What a day row says. "none" is a day that has passed with nothing
    logged; "today" is today with nothing logged yet; "ahead" is a day still
    to come, which says nothing at all (never "Rest", never a zero). */
export type WeekDayStatus = "logged" | "none" | "today" | "ahead";

export type WeekDay = {
  /** Mon=0 … Sun=6 — the index of this day's dot on the card. */
  index: number;
  /** Local midnight. */
  date: Date;
  /** "Mon" */
  weekday: string;
  /** "Sep 28" */
  dateLabel: string;
  /** "Monday, September 28" — for screen readers. */
  longLabel: string;
  isToday: boolean;
  status: WeekDayStatus;
  /** In the order they were finished. */
  workouts: WeekWorkout[];
};

export type WeekTotal = { key: "sets" | "volume" | "minutes"; value: string; label: string };

export type WeekRecord = {
  key: string;
  logId: string;
  /** Mon=0 … Sun=6 — the day it was set, so a lift with two records this
      week reads as two days, not a repeated line. */
  dayIndex: number;
  exercise: string;
  /** "225 lb × 3", "12 reps", "1:30 hold". */
  value: string;
};

export type WeekOverview = {
  /** Monday 00:00 local. */
  start: Date;
  /** "Sep 28 – Oct 4" */
  rangeLabel: string;
  headline: WeekHeadline;
  /** Mon=0 … Sun=6 indices of days with a workout — the card's filled dots. */
  workedDayIndices: number[];
  todayIndex: number;
  /** Sets, weight lifted, time — each only when the week has some; empty
      for a week with no workouts, so it never reads as a row of zeros. The
      workout count is the headline's. */
  totals: WeekTotal[];
  /** Seven rows, Monday first — the card's order. */
  days: WeekDay[];
  /** Bests beaten this week, one per lift per workout — the unit the
      card's "N personal records this month" counts — in the order they
      were set. */
  records: WeekRecord[];
};

const trim = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ""));

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

const shortDate = (d: Date): string => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const positive = (n: number | null | undefined): number =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;

/** One workout's short detail line. Volume is in the lifter's own unit —
    logs store it that way, nothing is converted. Weight is compactVolume
    everywhere ("950", "9.4k", "10.5k"), so a workout, its week and its
    month never read the same number two ways. */
export const workoutDetail = (log: WorkoutLog, units: string): string => {
  const parts: string[] = [];
  const sets = positive(log.completed_sets);
  const volume = positive(log.total_volume);
  const minutes = positive(log.duration_minutes);
  if (sets > 0) parts.push(plural(sets, "set"));
  if (volume > 0) parts.push(`${compactVolume(volume)} ${units}`);
  if (minutes > 0) parts.push(`${Math.round(minutes)} min`);
  return parts.join(" · ");
};

// Which of a lift's record events names it: the heaviest set first, then the
// best estimated single, then reps, then a hold.
const RECORD_ORDER: PREvent["kind"][] = ["weight", "e1rm", "reps", "duration"];

const recordValue = (event: PREvent, log: WorkoutLog, units: string): string => {
  const set = log.exercises.flatMap((e) => e.sets).find((s) => s.id === event.setId);
  const load = event.weight ?? 0;
  switch (event.kind) {
    case "weight":
    case "e1rm":
      // The set that did it — "225 lb × 3" — rather than an estimate.
      return set && positive(set.weight) > 0 && positive(set.reps) > 0
        ? `${trim(set.weight as number)} ${units} × ${set.reps}`
        : `${trim(event.value)} ${units}`;
    case "reps":
      return load > 0 ? `${event.value} reps at ${trim(load)} ${units}` : `${event.value} reps`;
    case "duration":
      return load > 0 ? `${formatHold(event.value)} at ${trim(load)} ${units}` : `${formatHold(event.value)} hold`;
  }
};

export const buildWeekOverview = ({
  logs,
  planned,
  units,
  now = new Date(),
}: {
  /** The whole history — records are judged against everything before. */
  logs: WorkoutLog[];
  planned: number | null;
  units: string;
  now?: Date;
}): WeekOverview => {
  const start = weekStartFor(now);
  const todayIndex = weekdayIndex(now);
  const week = [...logsThisWeek(logs, now)].sort(
    (a, b) => Date.parse(a.finished_at) - Date.parse(b.finished_at),
  );

  const days: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    // setDate, not + 24h: every row is its own local midnight across a
    // clock change.
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const workouts = week
      .filter((log) => weekdayIndex(new Date(log.finished_at)) === index)
      .map((log) => ({ id: log.id, name: log.name, detail: workoutDetail(log, units) }));
    const isToday = index === todayIndex;
    const status: WeekDayStatus =
      workouts.length > 0 ? "logged" : isToday ? "today" : index < todayIndex ? "none" : "ahead";
    return {
      index,
      date,
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      dateLabel: shortDate(date),
      longLabel: date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
      isToday,
      status,
      workouts,
    };
  });

  const sets = week.reduce((n, log) => n + positive(log.completed_sets), 0);
  const volume = week.reduce((n, log) => n + positive(log.total_volume), 0);
  const minutes = Math.round(week.reduce((n, log) => n + positive(log.duration_minutes), 0));
  const totals: WeekTotal[] = [];
  if (sets > 0) totals.push({ key: "sets", value: String(sets), label: sets === 1 ? "set" : "sets" });
  if (volume > 0) totals.push({ key: "volume", value: compactVolume(volume), label: `${units} lifted` });
  if (minutes > 0) totals.push({ key: "minutes", value: String(minutes), label: "min" });

  // One line per lift per workout, as the card counts them: a lift that beat
  // its best on Monday and again on Wednesday is two lines, each with its
  // day.
  const records: WeekRecord[] = week.flatMap((log) =>
    recordLiftsIn(logs, log).map((liftEvents) => {
      const pick = [...liftEvents].sort(
        (a, b) => RECORD_ORDER.indexOf(a.kind) - RECORD_ORDER.indexOf(b.kind),
      )[0];
      return {
        key: `${log.id}:${normalizeExerciseName(pick.exerciseName)}`,
        logId: log.id,
        dayIndex: weekdayIndex(new Date(log.finished_at)),
        exercise: pick.exerciseName,
        value: recordValue(pick, log, units),
      };
    }),
  );

  const sunday = days[6].date;
  return {
    start,
    rangeLabel: `${shortDate(start)} – ${shortDate(sunday)}`,
    headline: weekHeadline(week.length, planned),
    workedDayIndices: days.filter((d) => d.workouts.length > 0).map((d) => d.index),
    todayIndex,
    totals,
    days,
    records,
  };
};
