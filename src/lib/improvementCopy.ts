import { formatHold } from "@/lib/exerciseTracking";
import type { ProgressHeroStat } from "@/lib/progressHero";
import type {
  ImprovementBreakdown,
  ImprovementLift,
  ImprovementMeasure,
  ImprovementSet,
  ImprovementSkip,
} from "@/lib/strengthTrend";

/* ── Words for the Progress page's Improvement tile and the sheet behind
   it. The tile is ONE number (the owner's call); everything that explains
   it — which workout, compared with what, lift by lift — is phrased here
   so the tile and the sheet can never describe it two different ways. ── */

/** Names a quick start or an import is saved under when the lifter gave
    it none — saying "your latest Workout" reads like a bug. */
const GENERIC_NAMES = new Set([
  "",
  "workout",
  "session",
  "quick start",
  "weighttraining",
  "weight training",
  "strength training",
  "untitled",
  "untitled workout",
  "new workout",
]);

/** The workout's own name when it has one worth saying, else null. */
export const workoutTitle = (name: string | null | undefined): string | null => {
  const tidy = (name ?? "").trim().replace(/\s+/g, " ");
  return GENERIC_NAMES.has(tidy.toLowerCase()) ? null : tidy;
};

/** The tile's number: "Even" at 0 — matching the last workout is holding a
    level, not a zero — otherwise signed ("+4%", "-3%"). Sheet rows may
    carry one decimal ("+2.6%"). */
export const formatImprovementPct = (pct: number, decimals = 0): string =>
  pct === 0 ? "Even" : `${pct > 0 ? "+" : ""}${pct.toFixed(decimals)}%`;

/* The tile's rounding — `Math.round(-0.4)` is -0, which must read "Even". */
const roundPct = (value: number): number => Math.round(value) || 0;

/** The per-lift % the sheet shows, so a lifter who averages the rows lands
    on the tile. The tile is the rounded mean of the UNROUNDED changes, and
    whole-number rows often average to something else (Even, +3, +3, +5
    under a +2 tile). So: whole numbers when they already agree (most
    workouts); otherwise one decimal for every row, and if even that misses
    (a mean just beside a half), the closest calls take their other tenth —
    each row stays within 0.1 of its true change and never changes sign.
    `values` pair with `lifts` by index. */
export const shownLiftPcts = (
  lifts: ImprovementLift[],
  pct: number,
): { values: number[]; decimals: 0 | 1 } => {
  const agrees = (units: number[], scale: number): boolean =>
    units.length === 0 ||
    roundPct(units.reduce((sum, u) => sum + u, 0) / units.length / scale) === pct;

  const whole = lifts.map((lift) => roundPct(lift.change));
  if (agrees(whole, 1)) return { values: whole, decimals: 0 };

  const tenths = lifts.map((lift) => Math.round(lift.change * 10));
  // Each nudge moves the sum one tenth toward the tile; a sum that agrees
  // always lies between every row's floor and ceiling, so this ends there.
  for (let guard = 0; guard < lifts.length && !agrees(tenths, 10); guard += 1) {
    const mean = tenths.reduce((sum, u) => sum + u, 0) / tenths.length / 10;
    const raise = roundPct(mean) < pct;
    let pick = -1;
    let pickDistance = Infinity;
    lifts.forEach((lift, i) => {
      const exact = lift.change * 10;
      const other = raise ? Math.ceil(exact) : Math.floor(exact);
      if (other === tenths[i]) return;
      const distance = Math.abs(other - exact);
      if (distance < pickDistance) {
        pick = i;
        pickDistance = distance;
      }
    });
    if (pick < 0) break;
    tenths[pick] = raise ? Math.ceil(lifts[pick].change * 10) : Math.floor(lifts[pick].change * 10);
  }
  return { values: tenths.map((u) => u / 10 || 0), decimals: 1 };
};

/** What the tile compares, as its caption's two parts: the workout (its
    name, or "Last workout") and "vs the time before". */
export const improvementCaption = (
  latestName: string,
): { workout: string; against: string } => ({
  workout: workoutTitle(latestName) ?? "Last workout",
  against: "vs the time before",
});

/** The sheet's one plain sentence of what the number is. "The Push Day
    before it" only when every lift really came from one earlier workout of
    the same name; otherwise each lift's own last time. */
export const improvementIntro = (breakdown: ImprovementBreakdown): string => {
  const title = workoutTitle(breakdown.latest.name);
  const previousTitle = breakdown.previous ? workoutTitle(breakdown.previous.name) : null;
  const compared =
    title && previousTitle && title.toLowerCase() === previousTitle.toLowerCase()
      ? `Your latest ${title} compared with the ${title} before it.`
      : `Your latest ${title ?? "workout"} compared with the last time you did each lift.`;
  const scoring = breakdown.lifts.some((lift) => lift.measure === "e1rm")
    ? "Each lift is scored on its best set, with weight and reps both counting."
    : "Each lift is scored on its best set.";
  return `${compared} ${scoring}`;
};

/** Before any lift can be compared: what will appear, and when. */
export const IMPROVEMENT_EMPTY_TITLE = "Appears once you repeat a lift";
export const IMPROVEMENT_EMPTY_BODY =
  "It compares your latest workout with the last time you did the same lifts, as one number like +4%. Each lift is scored on its best set.";

const trimNumber = (value: number): string => String(Math.round(value * 100) / 100);

/** One scored set in the lifter's unit: "185 lb × 8", a hold as time
    ("45s", "1:05"), bodyweight work as reps. */
export const formatScoredSet = (
  set: ImprovementSet,
  measure: ImprovementMeasure,
  units: string,
): string => {
  if (measure === "hold") return formatHold(set.seconds);
  if (measure === "reps") return `${set.reps} ${set.reps === 1 ? "rep" : "reps"}`;
  return `${trimNumber(set.weight)} ${units} × ${set.reps}`;
};

const dateFormat = (iso: string, now: Date, options: Intl.DateTimeFormatOptions): string => {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    ...options,
    ...(sameYear ? {} : { year: "numeric" }),
  });
};

/** "Mon, Sep 28" — the year only when it isn't this one. */
export const workoutDate = (iso: string, now: Date = new Date()): string =>
  dateFormat(iso, now, { weekday: "short", month: "short", day: "numeric" });

/** "Sep 21" — for a lift whose last time was its own. */
export const shortWorkoutDate = (iso: string, now: Date = new Date()): string =>
  dateFormat(iso, now, { month: "short", day: "numeric" });

/** The day most compared lifts were last done — the sheet's "Before".
    Ties go to the most recent day. Null when nothing was compared. */
export const usualBeforeAt = (lifts: ImprovementLift[], now: Date = new Date()): string | null => {
  const byDay = new Map<string, { at: string; count: number }>();
  for (const lift of lifts) {
    const day = workoutDate(lift.prevAt, now);
    const entry = byDay.get(day);
    if (entry) {
      entry.count += 1;
      if (Date.parse(lift.prevAt) > Date.parse(entry.at)) entry.at = lift.prevAt;
    } else {
      byDay.set(day, { at: lift.prevAt, count: 1 });
    }
  }
  let best: { at: string; count: number } | null = null;
  for (const entry of byDay.values()) {
    if (
      !best ||
      entry.count > best.count ||
      (entry.count === best.count && Date.parse(entry.at) > Date.parse(best.at))
    ) {
      best = entry;
    }
  }
  return best?.at ?? null;
};

/** Whether a lift was last done on a different day than the sheet's
    "Before" — its line then carries its own date. */
export const beforeDiffers = (
  lift: ImprovementLift,
  usualAt: string | null,
  now: Date = new Date(),
): boolean => usualAt !== null && workoutDate(lift.prevAt, now) !== workoutDate(usualAt, now);

/** A lift's line: best set last time → best set this time. A lift last
    done on another day than the sheet's "Before" carries its own date. */
export const liftChangeLine = (
  lift: ImprovementLift,
  units: string,
  withDate: boolean,
  now: Date = new Date(),
): string => {
  const before = formatScoredSet(lift.prev, lift.measure, units);
  const after = formatScoredSet(lift.last, lift.measure, units);
  return withDate
    ? `${before} on ${shortWorkoutDate(lift.prevAt, now)} → ${after}`
    : `${before} → ${after}`;
};

const joinNames = (names: string[]): string =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** The lifts that did not count, in one line, so the average is never a
    mystery. Null when every lift counted. */
export const skippedSummary = (skipped: ImprovementSkip[]): string | null => {
  const group = (reason: ImprovementSkip["reason"], why: string): string | null => {
    const names = skipped.filter((s) => s.reason === reason).map((s) => s.name);
    return names.length > 0 ? `${joinNames(names)} (${why})` : null;
  };
  const parts = [
    group("first-time", "first time"),
    group("measured-differently", "logged differently last time"),
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? `Not counted: ${parts.join("; ")}.` : null;
};

/** The line that keeps the page's top number and this one from reading as
    a contradiction. Only percentage heroes carry a scope. */
export const heroContrast = (hero: ProgressHeroStat | null): string | null =>
  hero?.scope ? `The ${hero.value} at the top of the page is a longer view: ${hero.scope}.` : null;

/** The tile and sheet when there is no number. A first lifting workout
    gets the first-run words; a returning lifter whose latest workout had
    nothing to compare is told which workout and why — never the first-run
    message beside months of records. */
export type ImprovementPending = {
  /** The tile's sentence (and, without its full stop, the sheet's title). */
  title: string;
  /** "Not counted: …" — null on a first run. */
  notCounted: string | null;
  /** When the number comes back — null on a first run. */
  next: string | null;
};

export const improvementPending = (
  breakdown: ImprovementBreakdown | null,
): ImprovementPending => {
  if (!breakdown || breakdown.firstLiftingWorkout || breakdown.skipped.length === 0) {
    return { title: IMPROVEMENT_EMPTY_TITLE, notCounted: null, next: null };
  }
  const title = workoutTitle(breakdown.latest.name);
  const reasons = new Set(breakdown.skipped.map((skip) => skip.reason));
  const allNew = reasons.size === 1 && reasons.has("first-time");
  const allDifferent = reasons.size === 1 && reasons.has("measured-differently");
  return {
    title: allNew
      ? `${title ?? "Your last workout"} was all new lifts`
      : allDifferent
        ? `${title ?? "Your last workout"} was logged differently than before`
        : `Nothing to compare in ${title ?? "your last workout"}`,
    notCounted: skippedSummary(breakdown.skipped),
    next: allNew
      ? "The number comes back after your next workout that repeats a lift."
      : "The number comes back after your next workout that repeats a lift, logged the same way as before.",
  };
};
