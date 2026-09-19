import type { VoiceIntent } from "@/lib/voiceApply";

/* ── Unilateral guard.
   "1 set of bicep curls on each arm" is ONE set — the interpreter is told
   so, but a model can still double it. This deterministic pass runs on the
   client: when the transcript says how many sets were done AND carries a
   per-side qualifier, an action that came back with exactly double that
   count (identical halves) is folded back to the spoken count. Anything
   that doesn't match that exact shape is left alone. ── */

const UNILATERAL =
  /\b(each|per|both|either)\s+(arm|leg|side|hand|foot|knee)s?\b|\b(single|one)[- ](arm|leg|leg(ged)?|side)\b|\balternating\b/i;

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  a: 1,
};

/** "3 sets", "three sets", "a set", "1 set of" → 3 / 3 / 1 / 1; null if unspoken. */
export const spokenSetCount = (transcript: string): number | null => {
  const m = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|a)\s+sets?\b/i.exec(
    transcript,
  );
  if (!m) return null;
  const raw = m[1].toLowerCase();
  const n = /^\d+$/.test(raw) ? Number(raw) : WORD_NUMBERS[raw];
  return n && n > 0 ? n : null;
};

export const mentionsUnilateral = (transcript: string): boolean => UNILATERAL.test(transcript);

const sameSet = (a: Record<string, unknown>, b: Record<string, unknown>): boolean =>
  (a.reps ?? null) === (b.reps ?? null) &&
  (a.weight ?? null) === (b.weight ?? null) &&
  (a.seconds ?? null) === (b.seconds ?? null);

export const foldUnilateralSets = (intent: VoiceIntent, transcript: string): VoiceIntent => {
  if (!mentionsUnilateral(transcript)) return intent;
  const spoken = spokenSetCount(transcript);
  if (spoken === null || !intent.actions?.length) return intent;
  return {
    ...intent,
    actions: intent.actions.map((action) => {
      const sets = action.sets ?? [];
      if (sets.length !== spoken * 2) return action;
      // Only fold when the two halves are identical — that is the "doubled
      // for each side" shape, never a genuine 2N-set report.
      const first = sets.slice(0, spoken);
      const second = sets.slice(spoken);
      const doubled = first.every((s, i) => sameSet(s as never, second[i] as never));
      return doubled ? { ...action, sets: first } : action;
    }),
  };
};
