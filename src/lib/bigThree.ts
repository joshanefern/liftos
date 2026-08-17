import { allTimePRs, type AllTimePR } from "@/lib/prs";
import { isPlaceholderName } from "@/lib/exerciseNames";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";

/* The home-screen PR strip: three scoreboard numbers. Bench / Squat /
   Deadlift when they exist in the user's history (the numbers lifters
   actually recite), each slot backfilled with the next-heaviest other
   lift so the strip is never empty rows of dashes. Raw best weights —
   never a composite or an estimate (research: invented indexes split
   users; raw numbers don't). */

export type PRStripEntry = {
  /** Short display label — "Bench", "Squat", or the lift's own name. */
  label: string;
  weight: number;
  /** Broken within the trailing 72h — the strip's celebration accent. */
  recent: boolean;
};

const RECENT_MS = 72 * 3_600_000;

type Slot = { label: string; match: (name: string) => boolean };

// Conventional big-3 definitions: variants that change the lift (front/
// split/hack squat, Romanian/stiff-leg deadlift, incline/close-grip bench)
// don't claim the slot.
const SLOTS: Slot[] = [
  {
    label: "Bench",
    match: (n) =>
      /\bbench\b/.test(n) && !/incline|decline|close.?grip|floor|machine|smith|dip/.test(n),
  },
  {
    label: "Squat",
    match: (n) =>
      /\bsquats?\b/.test(n) && !/split|hack|goblet|pistol|jump|front|overhead|sumo|wall/.test(n),
  },
  {
    label: "Deadlift",
    match: (n) => /\bdead.?lifts?\b/.test(n) && !/romanian|stiff|straight|single/.test(n),
  },
];

const isRecent = (pr: AllTimePR, now: number): boolean =>
  now - Date.parse(pr.lastImproved) <= RECENT_MS;

/** Best-weight PRs for the strip, big-3 slots first, backfilled with the
    heaviest remaining lifts. Returns at most 3; fewer when the history is
    thin; empty for a weightless history. */
export const prStrip = (logs: WorkoutLog[], now = Date.now()): PRStripEntry[] => {
  const prs = allTimePRs(logs).filter(
    (pr) =>
      !isPlaceholderName(pr.exerciseName) &&
      typeof pr.maxWeight === "number" &&
      pr.maxWeight > 0,
  );
  const taken = new Set<string>();
  const entries: PRStripEntry[] = [];

  for (const slot of SLOTS) {
    let best: AllTimePR | null = null;
    for (const pr of prs) {
      if (taken.has(pr.exerciseName) || !slot.match(pr.exerciseName.toLowerCase())) continue;
      if (!best || (pr.maxWeight ?? 0) > (best.maxWeight ?? 0)) best = pr;
    }
    if (best) {
      taken.add(best.exerciseName);
      entries.push({
        label: slot.label,
        weight: best.maxWeight ?? 0,
        recent: isRecent(best, now),
      });
    }
  }

  // Backfill: heaviest lifts that didn't claim a big-3 slot.
  const rest = prs
    .filter((pr) => !taken.has(pr.exerciseName))
    .sort((a, b) => (b.maxWeight ?? 0) - (a.maxWeight ?? 0));
  for (const pr of rest) {
    if (entries.length >= 3) break;
    entries.push({
      label: pr.exerciseName,
      weight: pr.maxWeight ?? 0,
      recent: isRecent(pr, now),
    });
  }

  return entries;
};
