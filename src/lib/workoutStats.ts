import type { WorkoutLog } from "@/hooks/useWorkoutLogs";

// Mon=0, Sun=6
const dayIndex = (date: Date) => (date.getDay() + 6) % 7;

const localMidnight = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfCurrentWeek = () => {
  const now = new Date();
  const d = localMidnight(now);
  d.setDate(d.getDate() - dayIndex(now));
  return d;
};

export type WeekStats = {
  sessions: number;
  workedDayIndices: number[];
  totalVolume: number;
  /** Sum of duration_minutes for this week's logs (null durations count as 0). */
  totalMinutes: number;
};

export const getWeekStats = (logs: WorkoutLog[]): WeekStats => {
  const weekStart = startOfCurrentWeek();
  const weekLogs = logs.filter((l) => new Date(l.finished_at) >= weekStart);
  const indices = [...new Set(weekLogs.map((l) => dayIndex(new Date(l.finished_at))))];
  return {
    sessions: weekLogs.length,
    workedDayIndices: indices,
    totalVolume: weekLogs.reduce((s, l) => s + l.total_volume, 0),
    totalMinutes: weekLogs.reduce((s, l) => s + (l.duration_minutes ?? 0), 0),
  };
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

export const getStreak = (logs: WorkoutLog[]): number => {
  if (logs.length === 0) return 0;
  const workedDays = new Set(
    logs.map((l) => localMidnight(new Date(l.finished_at)).getTime()),
  );
  const today = localMidnight(new Date());
  let streak = 0;
  const cursor = new Date(today);
  while (workedDays.has(cursor.getTime())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  if (streak === 0) {
    cursor.setDate(cursor.getDate() - 1); // yesterday
    while (workedDays.has(cursor.getTime())) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
  }
  return streak;
};

export const getConsistency = (logs: WorkoutLog[], frequencyStr: string | null): number => {
  const target = parseInt(frequencyStr?.match(/\d+/)?.[0] ?? "0") * 4;
  if (!target) return 0;
  const fourWeeksAgo = new Date();
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
  const actual = logs.filter((l) => new Date(l.finished_at) >= fourWeeksAgo).length;
  return Math.min(Math.round((actual / target) * 100), 100);
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
  const weeks: Record<string, number> = {};
  for (const log of logs) {
    const d = new Date(log.finished_at);
    const ws = new Date(d);
    ws.setDate(d.getDate() - dayIndex(d));
    ws.setHours(0, 0, 0, 0);
    const key = ws.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    weeks[key] = (weeks[key] ?? 0) + log.total_volume;
  }
  const sorted = Object.entries(weeks).sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime());
  return sorted.slice(-8).map(([week, volume]) => ({ week, volume }));
};

export type TopLift = { name: string; weight: number; reps: number };

export const getTopLifts = (logs: WorkoutLog[]): TopLift[] => {
  const bests: Record<string, TopLift> = {};
  for (const log of logs) {
    for (const exercise of log.exercises) {
      for (const set of exercise.sets) {
        // Warmup sets never count toward bests (or any per-set stat here —
        // volume/set counts come from precomputed log totals).
        if (!set.completed || set.isWarmup || set.weight <= 0) continue;
        const existing = bests[exercise.name];
        if (!existing || set.weight > existing.weight) {
          bests[exercise.name] = { name: exercise.name, weight: set.weight, reps: set.reps };
        }
      }
    }
  }
  return Object.values(bests).sort((a, b) => b.weight - a.weight).slice(0, 5);
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
