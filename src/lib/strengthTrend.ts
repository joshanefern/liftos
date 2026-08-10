import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { normalizeExerciseName } from "@/lib/prs";

/* ── Strength trends — the question lifters actually re-check is "am I
     getting stronger?", per-lift (research: JEFIT/RepReturn/Cora; Strong's
     per-exercise trend is its most-loved screen). One best working-set
     weight per session per lift, across a rolling window. ── */

const DAY_MS = 86_400_000;

export type LiftTrend = {
  /** Display name — the most recent casing the user actually typed. */
  name: string;
  /** Best working-set weight in the first/last session of the window. */
  first: number;
  last: number;
  delta: number;
  /** One point per session (chronological best working-set weight). */
  points: number[];
  sessions: number;
};

/** Per-lift best completed working-set weight per session, oldest→newest,
    for lifts with enough history to show a trend. Ranked: improving lifts
    first (biggest gain), then by how often they're trained. */
export const getLiftTrends = (
  logs: WorkoutLog[],
  windowDays = 84,
  minSessions = 3,
): LiftTrend[] => {
  const cutoff = Date.now() - windowDays * DAY_MS;
  const bySession = new Map<string, { name: string; points: { t: number; weight: number }[] }>();

  for (const log of logs) {
    const t = Date.parse(log.finished_at);
    if (!Number.isFinite(t) || t < cutoff) continue;
    for (const exercise of log.exercises) {
      let best = 0;
      for (const set of exercise.sets) {
        if (!set.completed || set.isWarmup) continue;
        if (typeof set.weight === "number" && set.weight > best) best = set.weight;
      }
      if (best <= 0) continue;
      const key = normalizeExerciseName(exercise.name);
      const entry = bySession.get(key) ?? { name: exercise.name, points: [] };
      entry.name = exercise.name;
      entry.points.push({ t, weight: best });
      bySession.set(key, entry);
    }
  }

  const trends: LiftTrend[] = [];
  for (const { name, points } of bySession.values()) {
    if (points.length < minSessions) continue;
    points.sort((a, b) => a.t - b.t);
    const weights = points.map((p) => p.weight);
    trends.push({
      name,
      first: weights[0],
      last: weights[weights.length - 1],
      delta: weights[weights.length - 1] - weights[0],
      points: weights,
      sessions: weights.length,
    });
  }

  return trends.sort((a, b) => b.delta - a.delta || b.sessions - a.sessions);
};

/** The screen's headline lift: the biggest gainer, falling back to the most
    trained when nothing is improving yet. */
export const featuredLift = (trends: LiftTrend[]): LiftTrend | null => {
  if (trends.length === 0) return null;
  const improving = trends[0];
  if (improving.delta > 0) return improving;
  return [...trends].sort((a, b) => b.sessions - a.sessions)[0];
};
