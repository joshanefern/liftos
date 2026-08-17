import { supabase } from "@/lib/supabase";
import { formatHold, trackingFor } from "@/lib/exerciseTracking";
import { isPlaceholderName } from "@/lib/exerciseNames";
import { isMetricUnits } from "@/lib/review/inputFormatters";
import { stravaExerciseType } from "@/lib/strava/exerciseEnum";
import type { WorkoutExercise } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";

/* ── Strava write-back ─────────────────────────────────────────────
   The client owns the activity content (pure, unit-tested below in
   writeback.test.ts); the strava-export-activity Edge Function owns
   tokens, scope checks, and the import-dedupe seed row. Posting is
   always non-blocking: a workout save never waits on Strava.

   Two paths, chosen server-side:
   - upload_json → POST /uploads (data_type=json): per-set data Strava
     renders as a native workout log + muscle map (the Hevy/Fitbod look).
   - createActivity fallback when the sets payload is empty/rejected —
     plain manual activity carrying the long description instead. */

const LB_PER_KG = 2.2046226218;

/** One Strava upload set — weight is ALWAYS kilograms per the upload spec. */
export type StravaUploadSet = {
  exercise_type: string;
  repetitions?: number;
  weight?: number;
  duration?: number;
};

export type StravaUploadJson = {
  version: "1.0";
  start_time: string;
  utc_offset: number;
  elapsed_time: number;
  creator: { name: string };
  sets: StravaUploadSet[];
};

export type StravaExportPayload = {
  name: string;
  /** Long form — one line per exercise; used by the createActivity fallback. */
  description: string;
  /** Short form for the JSON-upload path, where sets render natively. */
  description_short: string;
  /** Idempotency + import-loop guard: the fetch path skips liftos-* ids. */
  external_id: string;
  /** Wall-clock local time, ISO shaped ("2026-08-16T14:52:54Z") — Strava
      reads start_date_local as naive local time. */
  start_date_local: string;
  /** True UTC instant, for the server's dedupe seed row. */
  started_at: string;
  elapsed_time: number;
  /** Per-set payload; null when no set survives the filters. */
  upload_json: StravaUploadJson | null;
};

export type StravaPostState =
  | "posted"
  | "missing_write_scope"
  | "not_connected"
  | "reconnect_required"
  | "failed";

/** The device's wall-clock reading of a UTC instant, in ISO shape. */
export const localWallClockIso = (date: Date): string => {
  const p = (v: number, len = 2) => String(v).padStart(len, "0");
  return (
    `${p(date.getFullYear(), 4)}-${p(date.getMonth() + 1)}-${p(date.getDate())}` +
    `T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}Z`
  );
};

/** Best completed working set of an exercise, rendered as one line —
    heaviest weight first, longest hold for timed work, reps as fallback. */
const topSetLine = (
  exercise: WorkoutExercise,
  units: string,
): string | null => {
  if (exercise.kind === "cardio") return null;
  const timed = trackingFor(exercise) === "time";
  let bestWeight = { weight: 0, reps: 0 };
  let bestHold = { seconds: 0, weight: 0 };
  let bestReps = 0;
  for (const set of exercise.sets) {
    if (!set.completed || set.isWarmup) continue;
    const reps = typeof set.reps === "number" ? set.reps : 0;
    const weight = typeof set.weight === "number" ? set.weight : 0;
    const seconds =
      typeof set.duration_seconds === "number" ? set.duration_seconds : 0;
    if (seconds > bestHold.seconds) bestHold = { seconds, weight };
    if (weight > 0 && reps >= 1 && weight > bestWeight.weight) {
      bestWeight = { weight, reps };
    }
    if (reps > bestReps) bestReps = reps;
  }
  if (timed && bestHold.seconds > 0) {
    const hold = formatHold(bestHold.seconds);
    return bestHold.weight > 0
      ? `${exercise.name} — ${hold} @ ${bestHold.weight} ${units}`
      : `${exercise.name} — ${hold}`;
  }
  if (bestWeight.weight > 0) {
    return `${exercise.name} — ${bestWeight.weight} ${units} × ${bestWeight.reps}`;
  }
  if (bestHold.seconds > 0) return `${exercise.name} — ${formatHold(bestHold.seconds)}`;
  if (bestReps > 0) return `${exercise.name} — ${bestReps} reps`;
  return null;
};

/** Flatten a log's completed working sets into Strava upload sets.
    Warmups and placeholder-named exercises are excluded — the muscle map
    Strava renders is only as good as the movements we claim. */
export const buildUploadSets = (
  exercises: WorkoutExercise[],
  units: string,
): StravaUploadSet[] => {
  const metric = isMetricUnits(units);
  const toKg = (w: number): number =>
    Math.round((metric ? w : w / LB_PER_KG) * 10) / 10;
  const sets: StravaUploadSet[] = [];
  for (const exercise of exercises) {
    if (isPlaceholderName(exercise.name)) continue;
    const exerciseType =
      exercise.kind === "cardio" ? "CARDIO_GENERIC" : stravaExerciseType(exercise.name);
    const timed = exercise.kind !== "cardio" && trackingFor(exercise) === "time";
    for (const set of exercise.sets) {
      if (!set.completed || set.isWarmup) continue;
      const reps = typeof set.reps === "number" ? set.reps : 0;
      const weight = typeof set.weight === "number" ? set.weight : 0;
      const seconds =
        typeof set.duration_seconds === "number" ? set.duration_seconds : 0;
      const entry: StravaUploadSet = { exercise_type: exerciseType };
      if (timed || exercise.kind === "cardio") {
        if (seconds <= 0 && reps < 1) continue;
        if (seconds > 0) entry.duration = Math.round(seconds);
        if (reps >= 1) entry.repetitions = reps;
      } else {
        if (reps < 1 && seconds <= 0) continue;
        if (reps >= 1) entry.repetitions = reps;
        if (seconds > 0) entry.duration = Math.round(seconds);
      }
      if (weight > 0) entry.weight = toKg(weight);
      sets.push(entry);
    }
  }
  return sets;
};

/** Build the Strava activity content from a saved workout log. */
export const buildStravaActivityPayload = (
  log: Pick<
    WorkoutLog,
    | "id"
    | "name"
    | "exercises"
    | "started_at"
    | "finished_at"
    | "duration_minutes"
    | "completed_sets"
    | "total_volume"
  >,
  units: string,
): StravaExportPayload => {
  const finished = new Date(log.finished_at);
  const durationSeconds = Math.max(
    60,
    log.started_at
      ? Math.round((finished.getTime() - Date.parse(log.started_at)) / 1000)
      : (log.duration_minutes ?? 1) * 60,
  );
  const started = log.started_at
    ? new Date(log.started_at)
    : new Date(finished.getTime() - durationSeconds * 1000);

  const lines: string[] = [];
  for (const exercise of log.exercises) {
    if (isPlaceholderName(exercise.name)) continue;
    const line = topSetLine(exercise, units);
    if (line) lines.push(line);
  }

  const exerciseCount = lines.length;
  const statBits = [
    `${exerciseCount} exercise${exerciseCount === 1 ? "" : "s"}`,
    `${log.completed_sets} set${log.completed_sets === 1 ? "" : "s"}`,
  ];
  if (log.total_volume > 0) {
    statBits.push(`${Math.round(log.total_volume).toLocaleString("en-US")} ${units} lifted`);
  }

  const description = [
    statBits.join(" · "),
    ...(lines.length > 0 ? ["", ...lines] : []),
    "",
    "Logged with LiftOS",
  ].join("\n");

  // Sets render natively on the upload path — the description only carries
  // what the workout log doesn't show.
  const descriptionShort = [
    ...(log.total_volume > 0
      ? [
          `Volume: ${Math.round(log.total_volume).toLocaleString("en-US")} ${units} in ${log.completed_sets} set${log.completed_sets === 1 ? "" : "s"}`,
          "",
        ]
      : []),
    "Logged with LiftOS",
  ].join("\n");

  const uploadSets = buildUploadSets(log.exercises, units);

  return {
    name: log.name?.trim() ? log.name.trim() : "Strength Training",
    description,
    description_short: descriptionShort,
    external_id: `liftos-${log.id}`,
    start_date_local: localWallClockIso(started),
    started_at: started.toISOString(),
    elapsed_time: durationSeconds,
    upload_json:
      uploadSets.length > 0
        ? {
            version: "1.0",
            start_time: started.toISOString(),
            // getTimezoneOffset is minutes BEHIND UTC (240 for EDT) — Strava
            // wants seconds ahead, hence the sign flip.
            utc_offset: -started.getTimezoneOffset() * 60,
            elapsed_time: durationSeconds,
            creator: { name: "LiftOS" },
            sets: uploadSets,
          }
        : null,
  };
};

/** Post one workout to Strava. Never throws — the caller renders the state. */
export const postWorkoutToStrava = async (
  log: WorkoutLog,
  units: string,
): Promise<StravaPostState> => {
  try {
    const { data, error } = await supabase.functions.invoke(
      "strava-export-activity",
      { body: buildStravaActivityPayload(log, units) },
    );
    if (error) {
      // supabase-js surfaces non-2xx as FunctionsHttpError with the response
      // attached; pull the typed error out so the UI can offer the right fix.
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === "function") {
        try {
          const body = (await ctx.json()) as { error?: string };
          if (body.error === "missing_write_scope") return "missing_write_scope";
          if (body.error === "not_connected") return "not_connected";
          if (body.error === "reconnect_required") return "reconnect_required";
        } catch {
          /* fall through to generic failure */
        }
      }
      return "failed";
    }
    return data && typeof data === "object" && "activity_id" in data
      ? "posted"
      : "failed";
  } catch {
    return "failed";
  }
};

/* ── Integration state (scope + autopost preference) ─────────────── */

export type StravaIntegrationState = {
  connected: boolean;
  /** Token can create activities (granted activity:write). */
  canWrite: boolean;
  autopost: boolean;
};

export const fetchStravaIntegration = async (): Promise<StravaIntegrationState> => {
  const { data } = await supabase
    .from("wearable_integrations")
    .select("scope, autopost, status")
    .eq("provider", "strava")
    .maybeSingle();
  if (!data || data.status === "revoked") {
    return { connected: false, canWrite: false, autopost: false };
  }
  return {
    connected: true,
    canWrite:
      typeof data.scope === "string" && data.scope.includes("activity:write"),
    autopost: data.autopost === true,
  };
};

export const setStravaAutopost = async (enabled: boolean): Promise<void> => {
  const { error } = await supabase
    .from("wearable_integrations")
    .update({ autopost: enabled })
    .eq("provider", "strava");
  if (error) throw error;
};
