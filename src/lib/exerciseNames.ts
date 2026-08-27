import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { normalizeExerciseName } from "@/lib/prs";
import { supabase } from "@/lib/supabase";

/* ── Imported-name hygiene — sessions saved from smart review without a name
     fall back to "Exercise 1", "Exercise 2"… Those placeholders carry zero
     meaning, and a records list containing gibberish is the fastest possible
     credibility kill (research: bad auto-data reads as "the app is wrong").
     They are excluded from the hero, records, and trends, and surfaced as a
     single fix-it row until the user names them. ── */

export const isPlaceholderName = (name: string): boolean =>
  /^exercise\s+\d+$/i.test(name.trim());

/** Distinct placeholder names present in history (normalized → display). */
export const placeholderNames = (logs: WorkoutLog[]): string[] => {
  const seen = new Map<string, string>();
  for (const log of logs) {
    for (const exercise of log.exercises ?? []) {
      if (!isPlaceholderName(exercise.name)) continue;
      seen.set(normalizeExerciseName(exercise.name), exercise.name);
    }
  }
  return [...seen.values()].sort();
};

/**
 * Rename exercises across the user's ENTIRE log history. `renames` maps the
 * current (display) name → new name; matching is normalized. Fetches every
 * workout_logs row in pages (the UI's log cache is capped at 200 — renames
 * must not silently miss older workouts), rewrites each affected exercises
 * JSON, and verifies every update actually persisted (an UPDATE matching
 * zero rows — e.g. under a restrictive policy — returns no error, so the
 * write-back is confirmed via the returned row id). Throws on the first
 * failure so the caller can surface it.
 */
export const renameExercisesInLogs = async (
  renames: Map<string, string>,
): Promise<number> => {
  const byKey = new Map<string, string>();
  for (const [from, to] of renames) {
    const trimmed = to.trim();
    if (trimmed && !isPlaceholderName(trimmed)) {
      byKey.set(normalizeExerciseName(from), trimmed);
    }
  }
  if (byKey.size === 0) return 0;

  type LogRow = Pick<WorkoutLog, "id" | "exercises">;
  const rows: LogRow[] = [];
  const PAGE = 500;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from("workout_logs")
      .select("id, exercises")
      // Postgres guarantees no row order without ORDER BY — unordered pages
      // can repeat or skip rows, leaving some names silently un-renamed.
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    rows.push(...((data as LogRow[]) ?? []));
    if (!data || data.length < PAGE) break;
  }

  let updated = 0;
  for (const row of rows) {
    let touched = false;
    const exercises = (row.exercises ?? []).map((exercise) => {
      const next = byKey.get(normalizeExerciseName(exercise.name));
      if (!next) return exercise;
      touched = true;
      return { ...exercise, name: next, category: next };
    });
    if (!touched) continue;
    const { data, error } = await supabase
      .from("workout_logs")
      .update({ exercises })
      .eq("id", row.id)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(`rename did not persist for workout log ${row.id}`);
    }
    updated++;
  }
  return updated;
};
