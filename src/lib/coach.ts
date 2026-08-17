import type { CapturedSessionRow } from "@/context/CapturedSessionsProvider";
import type { UserProfile } from "@/context/UserContext";
import { localDayKey } from "@/hooks/useDayKey";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { detectSets } from "@/lib/capture";
import { getMuscleActivation, lookupMuscles, type Muscle } from "@/lib/muscleMap";
import { supabase } from "@/lib/supabase";
import {
  getConsistency,
  getMonthStats,
  getStreak,
  getTopLifts,
  getVolumeTrend,
  getWeekStats,
} from "@/lib/workoutStats";

/** Thrown when the coach Edge Function is unreachable, undeployed, or errors. */
export class CoachOfflineError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "CoachOfflineError";
    this.status = status;
  }
}

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type MuscleRecency = { muscle: Muscle; days_since: number };

/** The suggestion engine's pick, narrowed to what the coach needs to phrase
    it — the full Suggestion (id, ctaLabel, muscles) stays client-side. */
export type TodaySuggestion = {
  kind: "template" | "starter" | "rest";
  title: string;
  reason: string;
};

export type HRSessionSummary = {
  date: string;
  activity_type: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  duration_min: number | null;
  set_count: number;
  avg_set_peak_hr: number | null;
  avg_set_duration_s: number | null;
  avg_rest_between_sets_s: number | null;
};

export type CoachContext = {
  profile: {
    goal: string | null;
    experience: string | null;
    equipment: string | null;
    frequency: string | null;
    split: string | null;
    units: string;
  };
  week_stats: { sessions: number; total_volume: number; days_trained: number };
  month_stats: { sessions: number; total_volume: number; avg_sets: number };
  streak_days: number;
  consistency_pct: number;
  volume_trend_8w: { week: string; volume: number }[];
  top_lifts: { name: string; weight: number; reps: number }[];
  muscles_trained_last_7d: { primary: Muscle[]; secondary: Muscle[] };
  days_since_muscle: MuscleRecency[];
  muscles_behind: MuscleRecency[];
  hr_sessions: HRSessionSummary[];
  /** Null when the caller has no engine pick (e.g. logs still loading). */
  today_suggestion: TodaySuggestion | null;
  /** Overnight readiness verdict — null without a wearable baseline. The
      coach must never contradict it (same hand-off rule as the pick). */
  today_readiness: {
    state: "primed" | "steady" | "run_down";
    illness: boolean;
    summary: string | null;
  } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Most recent training date per primary muscle across the full log history,
 * expressed as whole days since. Reuses the exercise→muscle mapping from
 * muscleMap; only exercises with at least one completed set count.
 */
const getDaysSincePerMuscle = (logs: WorkoutLog[]): MuscleRecency[] => {
  const latest = new Map<Muscle, number>();
  for (const log of logs) {
    const finished = new Date(log.finished_at).getTime();
    for (const exercise of log.exercises) {
      if (!exercise.sets.some((s) => s.completed)) continue;
      const mapping = lookupMuscles(exercise.name);
      if (!mapping) continue;
      for (const muscle of mapping.primary) {
        const existing = latest.get(muscle);
        if (existing === undefined || finished > existing) {
          latest.set(muscle, finished);
        }
      }
    }
  }
  const now = Date.now();
  return [...latest.entries()]
    .map(([muscle, ts]) => ({
      muscle,
      days_since: Math.max(0, Math.floor((now - ts) / DAY_MS)),
    }))
    .sort((a, b) => b.days_since - a.days_since);
};

const round = (n: number): number => Math.round(n);

const summarizeHRSession = (row: CapturedSessionRow): HRSessionSummary => {
  const sets = row.hr_samples && row.hr_samples.length > 0
    ? detectSets(row.hr_samples, row.motion_samples)
    : [];

  let avgPeak: number | null = null;
  let avgDuration: number | null = null;
  let avgRest: number | null = null;

  if (sets.length > 0) {
    avgPeak = round(sets.reduce((s, d) => s + d.peak_hr, 0) / sets.length);
    avgDuration = round(sets.reduce((s, d) => s + d.duration_s, 0) / sets.length);
    if (sets.length > 1) {
      let restTotal = 0;
      for (let i = 1; i < sets.length; i++) {
        restTotal += Math.max(0, sets[i].start_s - sets[i - 1].end_s);
      }
      avgRest = round(restTotal / (sets.length - 1));
    }
  }

  return {
    date: row.started_at,
    activity_type: row.aggregates?.activity_type ?? null,
    avg_hr: row.aggregates?.avg_hr != null ? round(row.aggregates.avg_hr) : null,
    max_hr: row.aggregates?.max_hr != null ? round(row.aggregates.max_hr) : null,
    duration_min:
      row.aggregates?.duration_s != null
        ? round(row.aggregates.duration_s / 60)
        : null,
    set_count: sets.length,
    avg_set_peak_hr: avgPeak,
    avg_set_duration_s: avgDuration,
    avg_rest_between_sets_s: avgRest,
  };
};

/**
 * Assemble the grounded stats object the coach sees. Pure function — pass in
 * the live data from useWorkoutLogs / useUser / useCapturedSessions. The
 * captured-sessions list is summary-only (no samples), so callers pass the
 * provider's `hrDetailSessions` — the full rows for the newest ≤3 HR-bearing
 * sessions — as `hrDetailSessions` here.
 */
export const buildCoachContext = (
  logs: WorkoutLog[],
  profile: UserProfile | null,
  hrDetailSessions: CapturedSessionRow[] = [],
  todaySuggestion: TodaySuggestion | null = null,
  todayReadiness: {
    state: "primed" | "steady" | "run_down" | null;
    illness: boolean;
    summary: string | null;
  } | null = null,
): CoachContext => {
  const weekStats = getWeekStats(logs);
  const monthStats = getMonthStats(logs);
  const activation = getMuscleActivation(logs, 7);
  const daysSince = getDaysSincePerMuscle(logs);

  // Defensive re-narrow: the provider already selects newest ≤3 HR-bearing
  // rows, but this keeps the function honest for any caller.
  const hrSessions = hrDetailSessions
    .filter((s) => s.hr_samples && s.hr_samples.length > 0)
    .slice(0, 3)
    .map(summarizeHRSession);

  return {
    profile: {
      goal: profile?.goal ?? null,
      experience: profile?.experience ?? null,
      equipment: profile?.equipment ?? null,
      frequency: profile?.frequency ?? null,
      split: profile?.split ?? null,
      units: profile?.units ?? "lb",
    },
    week_stats: {
      sessions: weekStats.sessions,
      total_volume: weekStats.totalVolume,
      days_trained: weekStats.workedDayIndices.length,
    },
    month_stats: {
      sessions: monthStats.count,
      total_volume: monthStats.volume,
      avg_sets: monthStats.avgSets,
    },
    streak_days: getStreak(logs),
    consistency_pct: getConsistency(logs, profile?.frequency ?? null),
    volume_trend_8w: getVolumeTrend(logs),
    top_lifts: getTopLifts(logs),
    muscles_trained_last_7d: {
      primary: [...activation.primary],
      secondary: [...activation.secondary],
    },
    days_since_muscle: daysSince,
    muscles_behind: daysSince.filter((m) => m.days_since > 7),
    hr_sessions: hrSessions,
    // Re-narrow so a caller passing a full Suggestion can't leak extra
    // fields into the prompt payload.
    today_suggestion: todaySuggestion
      ? {
          kind: todaySuggestion.kind,
          title: todaySuggestion.title,
          reason: todaySuggestion.reason,
        }
      : null,
    // Re-narrow for the same reason as the pick — and drop the no-verdict
    // tiers entirely so the model can't invent a readiness state.
    today_readiness:
      todayReadiness && todayReadiness.state !== null
        ? {
            state: todayReadiness.state,
            illness: todayReadiness.illness,
            summary: todayReadiness.summary,
          }
        : null,
  };
};

// Derive the functions base the same way src/lib/supabase.ts derives the
// client — supabase-js's functions.invoke targets `${url}/functions/v1/<name>`.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const COACH_URL = `${SUPABASE_URL}/functions/v1/coach`;

const authHeaders = async (): Promise<HeadersInit> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token ?? SUPABASE_ANON_KEY;
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    apikey: SUPABASE_ANON_KEY,
  };
};

/**
 * Stream a chat reply from the coach Edge Function. Parses Anthropic's SSE
 * pass-through and calls `onDelta` for every text token. Resolves with the
 * full reply text. Throws CoachOfflineError when the function is unreachable
 * or returns a non-200.
 */
export const streamCoach = async (
  messages: ChatMessage[],
  context: CoachContext,
  onDelta: (delta: string) => void,
): Promise<string> => {
  let res: Response;
  try {
    res = await fetch(COACH_URL, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ mode: "chat", messages, context }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new CoachOfflineError(`coach unreachable: ${detail}`);
  }

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new CoachOfflineError(
      `coach returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      res.status,
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  const handleLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let event: {
      type?: string;
      delta?: { type?: string; text?: string };
      error?: { message?: string };
    };
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }
    if (event.type === "error") {
      throw new CoachOfflineError(event.error?.message ?? "coach stream error");
    }
    if (
      event.type === "content_block_delta" &&
      event.delta?.type === "text_delta" &&
      typeof event.delta.text === "string"
    ) {
      full += event.delta.text;
      onDelta(event.delta.text);
    }
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line);
  }
  if (buffer) handleLine(buffer);

  return full;
};

const INSIGHT_KEY_PREFIX = "liftos-insight-";

/* Cache identity = user + LOCAL calendar day + the engine's pick. User-scoped
   so a shared device never serves someone else's numbers; local-day so the
   cache rolls over at the same midnight as the rest rule (toISOString would
   roll at UTC); pick-fingerprinted so logging a workout (pick → rest)
   invalidates the morning's sentence instead of contradicting the CTA. */
const insightCacheKey = (userId: string, context: CoachContext): string => {
  const pick = context.today_suggestion;
  const fingerprint = pick ? `${pick.kind}:${pick.title}` : "none";
  return `${INSIGHT_KEY_PREFIX}${userId}-${localDayKey()}-${fingerprint}`;
};

/** Drop every other insight entry — old days, old picks, other accounts. */
const pruneInsightCache = (keep: string): void => {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(INSIGHT_KEY_PREFIX) && k !== keep) stale.push(k);
    }
    for (const k of stale) localStorage.removeItem(k);
  } catch {
    // Best-effort cleanup only.
  }
};

/**
 * Fetch (or return the cached) one-sentence insight from the coach. Cached in
 * localStorage under `liftos-insight-<user>-<local date>-<pick>`.
 */
export const fetchDailyInsight = async (
  context: CoachContext,
): Promise<string> => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const key = insightCacheKey(session?.user?.id ?? "anon", context);
  try {
    const cached = localStorage.getItem(key);
    if (cached) return cached;
  } catch {
    // localStorage unavailable (private mode) — fall through to fetch.
  }

  let res: Response;
  try {
    res = await fetch(COACH_URL, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ mode: "insight", context }),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new CoachOfflineError(`coach unreachable: ${detail}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new CoachOfflineError(
      `coach returned ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      res.status,
    );
  }

  const body = (await res.json()) as { insight?: string };
  const insight = typeof body.insight === "string" ? body.insight.trim() : "";
  if (!insight) throw new CoachOfflineError("coach returned an empty insight");

  pruneInsightCache(key);
  try {
    localStorage.setItem(key, insight);
  } catch {
    // Best-effort cache only.
  }
  return insight;
};
