import type { StarterProgram } from "@/data/starterPrograms";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import type { SupabaseTemplate } from "@/hooks/useWorkoutTemplates";
import { getLastTrainedByMuscle, labelForMuscle } from "@/lib/muscleCoverage";
import { lookupMuscles, type Muscle } from "@/lib/muscleMap";

/* ── Suggestion engine v1 — deterministic answer to "what should I do
     right now?". Pure function of (logs, templates, starters, now) so the
     Dashboard hero can name the pick and one tap can start it. ── */

export type Suggestion = {
  kind: "template" | "starter" | "rest";
  /** Template/starter id for session seeding; null for rest. */
  id: string | null;
  title: string;
  ctaLabel: string;
  reason: string;
  /** The pick's primary-mover union — empty for rest. */
  muscles: Muscle[];
};

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// Rule a: staleness saturates at 14 days for scoring — a muscle three weeks
// cold isn't more urgent than one two weeks cold, and never-trained muscles
// score as 14 too (they get first-time copy instead of a bigger number).
const STALENESS_CAP_DAYS = 14;

// Rule g: when the pool is starters and the athlete declared a split in
// onboarding, matching starters get a small boost — enough to prefer the
// chosen split, small enough that a genuinely stale muscle still wins.
const SPLIT_MATCH_BONUS = 2;

/** A log only counts as training if something was actually completed — the
    same convention getLastTrainedByMuscle uses. A session opened and
    finished with zero sets (the de-facto "abandon" path) must not flip the
    rest rule or trigger the recency penalty. */
const hasTraining = (log: WorkoutLog): boolean =>
  log.exercises.some((e) => e.sets.some((s) => s.completed));

/** "Push Pull Legs" (onboarding) and "Push / Pull / Legs" (starter) are the
    same split — compare letters only. */
const normalizeSplit = (split: string): string =>
  split.toLowerCase().replace(/[^a-z]/g, "");

/** Equipment eligibility: onboarding's "What equipment do you have?" gates
    which STARTERS can be suggested — a "None" athlete must never be told to
    start a cable-machine program. Onboarding values: "Full gym", "Home gym",
    "Dumbbells only", "None". Unknown/unset values gate nothing. Returns the
    allowed starter tags, or null for "everything is eligible". */
const allowedEquipment = (
  declared: string | null | undefined,
): Set<StarterProgram["equipment"]> | null => {
  const normalized = declared?.trim().toLowerCase();
  if (normalized === "none") return new Set(["none"]);
  if (normalized === "dumbbells only") return new Set(["none", "dumbbells"]);
  return null;
};

/** Applies equipment eligibility to the starter pool only — user templates
    are never filtered (the user built them; they know their equipment). If
    filtering would empty the pool, the unfiltered pool stands: a wrong-
    equipment suggestion beats having nothing startable at all. */
const eligibleStarters = (
  starters: StarterProgram[],
  declared: string | null | undefined,
): StarterProgram[] => {
  const allowed = allowedEquipment(declared);
  if (!allowed) return starters;
  const filtered = starters.filter((s) => allowed.has(s.equipment));
  return filtered.length > 0 ? filtered : starters;
};

// Labels are conjugated as written: "Quads haven't", but "Chest hasn't".
// Everything not listed here reads as plural ("Traps", "Glutes", "Abs", …).
const SINGULAR_MUSCLES = new Set<Muscle>(["chest", "upper-back", "lower-back"]);

type Candidate = {
  kind: "template" | "starter";
  id: string;
  title: string;
  exerciseNames: string[];
  /** Starter programs carry their split for the rule-g bonus. */
  split?: string;
};

/** Rule b (second half): a candidate's muscles = union of primary movers
    across its exercises, in first-seen exercise order. */
const primaryMusclesOf = (exerciseNames: string[]): Muscle[] => {
  const muscles: Muscle[] = [];
  const seen = new Set<Muscle>();
  for (const name of exerciseNames) {
    const mapping = lookupMuscles(name);
    if (!mapping) continue;
    for (const muscle of mapping.primary) {
      if (seen.has(muscle)) continue;
      seen.add(muscle);
      muscles.push(muscle);
    }
  }
  return muscles;
};

/** Rule a: days since a muscle was last a PRIMARY mover in a completed log —
    the Progress coverage convention (elapsed-ms floor); Infinity if never. */
const stalenessDays = (
  lastTrained: Map<Muscle, number>,
  muscle: Muscle,
  nowMs: number,
): number => {
  const time = lastTrained.get(muscle);
  if (time === undefined) return Infinity;
  return Math.max(0, Math.floor((nowMs - time) / DAY_MS));
};

/** Rule e: the reason line names the winner's stalest primary muscle. */
const reasonFor = (stalest: { muscle: Muscle; days: number } | null): string => {
  if (stalest === null) {
    // Candidate has no mappable muscles — fall back to neutral copy.
    return "Pick up where you left off.";
  }
  const label = labelForMuscle(stalest.muscle);
  const singular = SINGULAR_MUSCLES.has(stalest.muscle);
  if (stalest.days === Infinity) {
    // Never-trained muscles get first-time copy instead of a day count.
    return `You haven't hit ${label} yet — start here.`;
  }
  if (stalest.days === 0) {
    // Under 24h elapsed but the rest rule didn't fire — so the session
    // finished before local midnight, i.e. yesterday, never today.
    return `${label} ${singular ? "was" : "were"} trained yesterday.`;
  }
  return `${label} ${singular ? "hasn't" : "haven't"} been trained in ${stalest.days} day${stalest.days === 1 ? "" : "s"}.`;
};

export function suggestNextWorkout(args: {
  logs: WorkoutLog[];
  templates: SupabaseTemplate[];
  starters: StarterProgram[];
  /** Onboarding answers — split feeds the scoring (rule g), equipment gates
      starter eligibility. */
  profile?: { split?: string | null; equipment?: string | null } | null;
  now?: Date;
}): Suggestion {
  const { templates, profile } = args;
  const now = args.now ?? new Date();
  const nowMs = now.getTime();

  // Equipment gate — applied to starters everywhere they can surface (rule f
  // AND the ongoing candidate pool), never to user templates.
  const starters = eligibleStarters(args.starters, profile?.equipment);

  // Zero-completed-set logs (abandoned sessions) are invisible to every rule.
  const logs = args.logs.filter(hasTraining);

  // Rule d: a log finished today (local midnight boundary) → rest-day copy.
  // The CTA still opens the library — recovery advice must never block
  // training — and its label says exactly that.
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const trainedToday = logs.some((log) => {
    const finished = new Date(log.finished_at).getTime();
    return Number.isFinite(finished) && finished >= todayStart.getTime() && finished <= nowMs;
  });
  if (trainedToday) {
    return {
      kind: "rest",
      id: null,
      title: "Recovery",
      ctaLabel: "Browse workouts",
      reason: "You already trained today — recovery counts too.",
      muscles: [],
    };
  }

  // Rule f: brand-new account (no real training, no templates) → the
  // full-body starter so the first tap trains everything and lights the
  // whole body map — deliberately ignoring the declared split for session
  // one; rule g takes over from session two.
  if (logs.length === 0 && templates.length === 0) {
    const fullBody =
      starters.find((s) => `${s.name} ${s.split}`.toLowerCase().includes("full body")) ??
      starters[0];
    if (fullBody) {
      return {
        kind: "starter",
        id: fullBody.id,
        title: fullBody.name,
        ctaLabel: `Start ${fullBody.name}`,
        reason: "No blank pages — this one trains everything.",
        muscles: primaryMusclesOf(fullBody.exercises.map((e) => e.name)),
      };
    }
  }

  // Rule b: user templates are the candidate pool when any exist; otherwise
  // the curated starter programs are.
  const candidates: Candidate[] =
    templates.length > 0
      ? templates.map((t) => ({
          kind: "template" as const,
          id: t.id,
          title: t.name,
          exerciseNames: t.exercises.map((e) => e.name),
        }))
      : starters.map((s) => ({
          kind: "starter" as const,
          id: s.id,
          title: s.name,
          exerciseNames: s.exercises.map((e) => e.name),
          split: s.split,
        }));

  // Degenerate input (no templates AND no starters shipped) — unreachable in
  // the app, but the engine still answers something startable.
  if (candidates.length === 0) {
    return {
      kind: "rest",
      id: null,
      title: "Recovery",
      ctaLabel: "Browse workouts",
      reason: "Log your first workout to start tracking.",
      muscles: [],
    };
  }

  // Rule g: starter candidates matching the declared split score a bonus.
  const declaredSplit = profile?.split ? normalizeSplit(profile.split) : null;
  const splitBonus = (candidate: Candidate): number =>
    declaredSplit && candidate.split && normalizeSplit(candidate.split) === declaredSplit
      ? SPLIT_MATCH_BONUS
      : 0;

  const lastTrained = getLastTrainedByMuscle(logs);

  // Rule c (penalty): only the MOST RECENT session can penalize — repeating
  // it within 48h costs 8 points, within 96h costs 4.
  const mostRecent = logs.reduce<WorkoutLog | null>((best, log) => {
    const t = new Date(log.finished_at).getTime();
    if (!Number.isFinite(t)) return best;
    return best === null || t > new Date(best.finished_at).getTime() ? log : best;
  }, null);
  const recencyPenalty = (candidate: Candidate): number => {
    if (!mostRecent) return 0;
    const matches =
      (candidate.kind === "template" && mostRecent.template_id === candidate.id) ||
      mostRecent.name === candidate.title;
    if (!matches) return 0;
    const hours = (nowMs - new Date(mostRecent.finished_at).getTime()) / HOUR_MS;
    if (hours <= 48) return 8;
    if (hours <= 96) return 4;
    return 0;
  };

  // Rule c (score): mean staleness of the candidate's primary muscles, each
  // capped at 14 days, minus the recency penalty, plus the split bonus.
  // Muscle-less candidates score 0 so anything with stale muscles beats them.
  const scored = candidates.map((candidate) => {
    const muscles = primaryMusclesOf(candidate.exerciseNames);
    const staleness = muscles.map((m) => stalenessDays(lastTrained, m, nowMs));
    const capped = staleness.map((d) => Math.min(d, STALENESS_CAP_DAYS));
    const score =
      capped.length === 0
        ? 0
        : capped.reduce((s, d) => s + d, 0) / capped.length -
          recencyPenalty(candidate) +
          splitBonus(candidate);
    // Stalest primary — Infinity (never trained) outranks any day count.
    let stalest: { muscle: Muscle; days: number } | null = null;
    muscles.forEach((muscle, i) => {
      if (stalest === null || staleness[i] > stalest.days) {
        stalest = { muscle, days: staleness[i] };
      }
    });
    return { candidate, muscles, score, stalest };
  });

  // Rule c (tie-break): alphabetical by title, for determinism.
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.candidate.title < b.candidate.title ? -1 : a.candidate.title > b.candidate.title ? 1 : 0),
  );

  const winner = scored[0];
  return {
    kind: winner.candidate.kind,
    id: winner.candidate.id,
    title: winner.candidate.title,
    ctaLabel: `Start ${winner.candidate.title}`,
    reason: reasonFor(winner.stalest),
    muscles: winner.muscles,
  };
}
