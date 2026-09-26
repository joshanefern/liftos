import type { WorkoutLog } from "@/hooks/useWorkoutLogs";

/* ── Progress-page helpers that read the whole log, not one lift.

     weeksTrained — "N of the last M weeks trained". Weeks start Monday in
     local time (the same week the Dashboard's weekly streak counts) and the
     window always ends with the current, still-open week: a fresh Monday
     reads one lower until the first session lands, which is the nudge the
     tile exists to give.

     volumeComparison — total weight moved in the last 4 weeks against the 4
     before. Deliberately a demoted, secondary number: more volume is not
     the same as being stronger, so the page shows it below the per-lift
     records. ── */

export const CONSISTENCY_WEEKS = 8;

const DAY_MS = 86_400_000;
const VOLUME_WINDOW_DAYS = 28;

/** Local midnight of the Monday that starts the week containing `date`. */
const weekStart = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

export type WeeksTrained = {
  /** Weeks in the window with at least one logged workout. */
  trained: number;
  /** Window size — the M in "N of the last M weeks". */
  weeks: number;
};

export const weeksTrained = (
  logs: WorkoutLog[],
  weeks: number = CONSISTENCY_WEEKS,
  now: number = Date.now(),
): WeeksTrained => {
  const span = Math.max(1, Math.floor(weeks));
  const current = weekStart(new Date(now)).getTime();
  // Walk back by calendar days rather than milliseconds — a DST week is 167
  // or 169 hours long, so ms arithmetic would land beside the Monday.
  const first = new Date(current);
  first.setDate(first.getDate() - (span - 1) * 7);
  const earliest = first.getTime();

  const seen = new Set<number>();
  for (const log of logs) {
    const t = Date.parse(log.finished_at);
    if (!Number.isFinite(t) || t > now) continue;
    const ws = weekStart(new Date(t)).getTime();
    if (ws < earliest || ws > current) continue;
    seen.add(ws);
  }
  return { trained: seen.size, weeks: span };
};

export type VolumeComparison = {
  /** Total lifted in the last 4 weeks. */
  recent: number;
  /** Total lifted in the 4 weeks before that. */
  prior: number;
  /** Rounded % change; null until both windows have volume to compare. */
  pct: number | null;
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
  const pct = recent > 0 && prior > 0 ? Math.round(((recent - prior) / prior) * 100) : null;
  return { recent, prior, pct };
};

/** Short numeral for a volume total: "48.2k", "12k", "950". Unit is the
    caller's — it differs per profile. */
export const compactVolume = (volume: number): string => {
  const v = volume > 0 ? volume : 0;
  if (v < 1000) return String(Math.round(v));
  return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
};
