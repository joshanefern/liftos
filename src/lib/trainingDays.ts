/* ── Training days per week. Onboarding asks for one exact number and
   stores it in profiles.frequency as text ("4 days"). Accounts created
   before that hold a range ("3–4 days"), so every reader goes through the
   parsers here instead of matching strings: the week card, the consistency
   figure, the coach prompts and the plan sheet's preselected days all have
   to agree on the same number. ── */

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

/** The weekday a workout title opens with — "Monday · Push", "friday: legs",
    "Thursday - Upper" — or null when it opens with anything else. The plan
    sheet names every day it builds this way, so this is how the rest of the
    app tells a plan day from a workout that belongs to no day. One reader,
    so the pick, its tie-break and Home cannot disagree on what counts. */
export const leadingWeekday = (title: string): Weekday | null => {
  const match = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.exec(
    title.trim(),
  );
  if (!match) return null;
  const name = match[1].toLowerCase();
  return WEEKDAYS.find((day) => day.toLowerCase() === name) ?? null;
};

/** The choices onboarding offers. 1 and 7 are left out on purpose: seven
    rows would make this the tallest onboarding step, and both stay
    reachable in the plan sheet, where any day can be toggled. */
export const TRAINING_DAY_CHOICES = [2, 3, 4, 5, 6] as const;

/** The text stored in profiles.frequency for an exact answer. */
export const frequencyAnswer = (days: number): string =>
  `${days} day${days === 1 ? "" : "s"}`;

const clampDays = (n: number): number | null =>
  Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 7) : null;

/** The number, only when the answer IS one number: "4 days", "4", "7 days".
    A legacy range ("3–4 days") is null — the lifter never committed to an
    exact count, so nothing downstream may claim they did. */
export const exactTrainingDays = (frequency: string | null | undefined): number | null => {
  const match = /^\s*(\d+)\s*(?:days?)?\s*$/i.exec(frequency ?? "");
  return match ? clampDays(parseInt(match[1], 10)) : null;
};

/** Planned training days per week for any stored answer. A legacy range
    reads at its LOW end — that is the commitment the lifter actually made,
    so "2 of 3" never nags someone who said "3–4" for a fourth day. null
    when the answer is missing or holds no usable number. */
export const trainingDaysPerWeek = (frequency: string | null | undefined): number | null =>
  clampDays(parseInt(frequency?.match(/\d+/)?.[0] ?? "", 10));

/* Rest days fall between training days wherever the count allows it, and
   the week starts on Monday. Five days keeps a midweek rest (Thursday)
   rather than training Monday to Friday straight. */
const SPREADS: Record<number, readonly Weekday[]> = {
  1: ["Monday"],
  2: ["Monday", "Thursday"],
  3: ["Monday", "Wednesday", "Friday"],
  4: ["Monday", "Tuesday", "Thursday", "Friday"],
  5: ["Monday", "Tuesday", "Wednesday", "Friday", "Saturday"],
  6: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  7: WEEKDAYS,
};

/** Which weekdays to preselect for N training days, in week order. Empty
    when there is no usable count — the lifter then picks from scratch. */
export const spreadTrainingDays = (count: number | null | undefined): Weekday[] => {
  const days = clampDays(count ?? NaN);
  return days === null ? [] : [...SPREADS[days]];
};
