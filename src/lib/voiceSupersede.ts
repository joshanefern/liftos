import {
  applyVoiceIntent,
  type VoiceApplyOptions,
  type VoiceApplyResult,
  type VoiceIntent,
  type VoiceLoggedExercise,
} from "@/lib/voiceApply";
import { revertVoiceApply } from "@/lib/voiceRevert";

/* ── What one voice "fire" does to the session.

     Endpointing is Jarvis-style: a short pause logs what was said and the
     mic stays open. Speech that resumes inside the grace window is the
     same sentence, so the merged transcript REPLACES the first log — it
     is never a second log on top of it.

     The first log is given up only once the merged sentence has been
     understood. The merged intent is worked out against the session as it
     would be without the first log — on a copy, the session itself is not
     touched — and only a result worth applying takes the first log's
     place. An interpretation that failed, came back unsure, or applies
     nothing leaves the first log exactly as the lifter saw it.

     One answer is not a replacement: a bare correction or scratch ("that
     was 12", "scratch that", no exercise named) AMENDS the log it follows.
     Worked out after taking that log back, "the last set" would be one
     the lifter logged by hand — so it is applied on top of the first log,
     whose own rows count as the most recent.

     Every guard on WHAT may be written stays in lib/voiceApply. ── */

/** Below this the interpreter is guessing: re-ask instead of applying. */
export const MIN_VOICE_CONFIDENCE = 0.5;

/** A voice log that is on the books: the session before it and straight
    after it (what lib/voiceRevert needs to take it back). */
export type AppliedVoiceLog = {
  before: VoiceLoggedExercise[];
  after: VoiceLoggedExercise[];
};

export type VoiceFireOutcome =
  | {
      at: "applied";
      result: VoiceApplyResult;
      /** The session the result was worked out against — `before` for the
          log this becomes. */
      base: VoiceLoggedExercise[];
      /** True when it takes the place of `first`: undo that, then apply. */
      replacesFirst: boolean;
    }
  | {
      at: "missed";
      /** True when an earlier log stands untouched behind this miss. */
      firstLogKept: boolean;
    };

/** Corrections and scratches only, none naming an exercise. */
const amendsLastSet = (intent: VoiceIntent): boolean => {
  const actions = intent.actions ?? [];
  return (
    actions.length > 0 &&
    actions.every((a) => (a.correct === true || a.undo === true) && a.exercise.trim() === "")
  );
};

/** Ids of the rows a voice log completed, last one first. */
const rowsLoggedBy = (log: AppliedVoiceLog): string[] => {
  const before = new Map(
    log.before.flatMap((e) => e.sets.map((s) => [s.id, s.completed] as const)),
  );
  return log.after
    .flatMap((e) => e.sets)
    .filter((s) => s.completed && before.get(s.id) !== true)
    .map((s) => s.id)
    .reverse();
};

export const resolveVoiceFire = ({
  now,
  intent,
  first,
  options,
}: {
  /** The session as it is, the first log (and anything done by hand
      since) included. */
  now: VoiceLoggedExercise[];
  /** null = the interpreter failed or timed out. */
  intent: VoiceIntent | null;
  /** The log this fire would replace; null for the first fire. */
  first: AppliedVoiceLog | null;
  options?: VoiceApplyOptions;
}): VoiceFireOutcome => {
  const missed: VoiceFireOutcome = { at: "missed", firstLogKept: first !== null };
  if (intent === null) return missed;
  if ((intent.confidence ?? 1) < MIN_VOICE_CONFIDENCE) return missed;
  if (first !== null && amendsLastSet(intent)) {
    const result = applyVoiceIntent(now, intent, {
      ...options,
      recentSetIds: [...rowsLoggedBy(first), ...(options?.recentSetIds ?? [])],
    });
    if (result.empty) return missed;
    return { at: "applied", result, base: now, replacesFirst: false };
  }
  const base = first === null ? now : revertVoiceApply(first.before, first.after, now);
  const result = applyVoiceIntent(base, intent, options);
  if (result.empty) return missed;
  return { at: "applied", result, base, replacesFirst: first !== null };
};
