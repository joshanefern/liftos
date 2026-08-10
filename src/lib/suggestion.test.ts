import { describe, expect, it } from "vitest";
import type { WorkoutExercise } from "@/data/liftosMock";
import { starterPrograms, type StarterProgram } from "@/data/starterPrograms";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import type { SupabaseTemplate } from "@/hooks/useWorkoutTemplates";
import { suggestNextWorkout } from "./suggestion";

/* Fixed local "now": Sunday Aug 9 2026, 12:00 noon. Constructed with the
   local-time Date constructor because rest-day detection uses local midnight. */
const NOW = new Date(2026, 7, 9, 12, 0, 0);

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

const hoursAgo = (h: number): string => new Date(NOW.getTime() - h * HOUR_MS).toISOString();
const daysAgo = (d: number): string => new Date(NOW.getTime() - d * DAY_MS).toISOString();

const ex = (name: string, completed = true): WorkoutExercise => ({
  id: name.toLowerCase().replace(/\s+/g, "-"),
  name,
  category: "c",
  target: "t",
  sets: [{ id: `${name}-1`, reps: 8, weight: 100, completed }],
});

const log = (
  name: string,
  finished_at: string,
  exercises: WorkoutExercise[],
  templateId: string | null = null,
): WorkoutLog => ({
  id: `log-${name}-${finished_at}`,
  template_id: templateId,
  name,
  exercises,
  notes: null,
  started_at: null,
  finished_at,
  duration_minutes: 45,
  total_sets: 3,
  completed_sets: 3,
  total_volume: 1000,
  source: "manual",
  captured_session_id: null,
  created_at: finished_at,
});

const template = (id: string, name: string, exerciseNames: string[]): SupabaseTemplate => ({
  id,
  name,
  exercises: exerciseNames.map((n) => ex(n)),
  created_at: "2026-01-01T00:00:00Z",
});

const starter = (
  id: string,
  name: string,
  exerciseNames: string[],
  split = "Split",
  equipment: StarterProgram["equipment"] = "gym",
): StarterProgram => ({
  id,
  name,
  split,
  focus: "f",
  duration: 45,
  difficulty: "Moderate",
  equipment,
  description: "d",
  exercises: exerciseNames.map((n) => ex(n)),
});

describe("suggestNextWorkout — staleness math (rule a)", () => {
  it("counts whole elapsed days since a muscle was last a primary mover, across week boundaries", () => {
    // 10 days crosses the Mon-start week boundary twice — staleness is pure
    // elapsed days, not a week convention.
    const args = {
      logs: [log("Leg Day", daysAgo(10), [ex("Back Squat")])],
      templates: [template("t-legs", "Leg Day", ["Back Squat"])],
      starters: [],
      now: NOW,
    };
    const s = suggestNextWorkout(args);
    expect(s.kind).toBe("template");
    expect(s.reason).toBe("Quads haven't been trained in 10 days.");
  });

  it("singularizes one day", () => {
    const s = suggestNextWorkout({
      logs: [log("Leg Day", hoursAgo(25), [ex("Back Squat")])],
      templates: [template("t-legs", "Leg Day", ["Back Squat"])],
      starters: [],
      now: NOW,
    });
    expect(s.reason).toBe("Quads haven't been trained in 1 day.");
  });

  it("secondary activation does not reset a muscle's clock", () => {
    // Bench hits triceps as a secondary — triceps must still read never-trained.
    const s = suggestNextWorkout({
      logs: [log("Push", daysAgo(1), [ex("Barbell Bench Press")])],
      templates: [template("t-arms", "Arms", ["Tricep Pushdown"])],
      starters: [],
      now: NOW,
    });
    expect(s.reason).toBe("You haven't hit Triceps yet — start here.");
  });

  it("uncompleted sets do not count as training", () => {
    const s = suggestNextWorkout({
      logs: [log("Leg Day", daysAgo(2), [ex("Back Squat", false)])],
      templates: [template("t-legs", "Leg Day", ["Back Squat"])],
      starters: [],
      now: NOW,
    });
    expect(s.reason).toBe("You haven't hit Quads yet — start here.");
  });
});

describe("suggestNextWorkout — candidate scoring (rules b + c)", () => {
  const pushTemplate = template("t-push", "Push Day", ["Barbell Bench Press", "Overhead Press"]);
  const legTemplate = template("t-legs", "Leg Day", ["Back Squat", "Romanian Deadlift", "Leg Curl"]);

  it("picks the template with the stalest muscles (stale legs beat fresh chest)", () => {
    const logs = [
      log("Push Day", daysAgo(1), [ex("Barbell Bench Press"), ex("Overhead Press")]),
      log("Leg Day", daysAgo(9), [ex("Back Squat"), ex("Romanian Deadlift")]),
    ];
    const s = suggestNextWorkout({ logs, templates: [pushTemplate, legTemplate], starters: [], now: NOW });
    expect(s.kind).toBe("template");
    expect(s.id).toBe("t-legs");
    expect(s.title).toBe("Leg Day");
    expect(s.ctaLabel).toBe("Start Leg Day");
    expect(s.reason).toBe("Quads haven't been trained in 9 days.");
    expect(s.muscles).toContain("quadriceps");
    expect(s.muscles).toContain("hamstring");
    expect(s.muscles).toContain("gluteal");
  });

  it("recency penalty (48h, −8) flips an otherwise-tied pick away from the last session", () => {
    // Both templates train quads → identical staleness. "Alpha" was the most
    // recent session 24h ago, so it eats −8 and "Beta" wins.
    const templates = [
      template("t-a", "Alpha", ["Back Squat"]),
      template("t-b", "Beta", ["Front Squat"]),
    ];
    const s = suggestNextWorkout({
      logs: [log("Alpha", hoursAgo(24), [ex("Back Squat")], "t-a")],
      templates,
      starters: [],
      now: NOW,
    });
    expect(s.title).toBe("Beta");
  });

  it("recency penalty (96h, −4) still flips the pick", () => {
    const templates = [
      template("t-a", "Alpha", ["Back Squat"]),
      template("t-b", "Beta", ["Front Squat"]),
    ];
    const s = suggestNextWorkout({
      logs: [log("Alpha", hoursAgo(72), [ex("Back Squat")], "t-a")],
      templates,
      starters: [],
      now: NOW,
    });
    expect(s.title).toBe("Beta");
  });

  it("no penalty beyond 96h — the tie breaks alphabetically instead", () => {
    const templates = [
      template("t-a", "Alpha", ["Back Squat"]),
      template("t-b", "Beta", ["Front Squat"]),
    ];
    const s = suggestNextWorkout({
      logs: [log("Alpha", hoursAgo(120), [ex("Back Squat")], "t-a")],
      templates,
      starters: [],
      now: NOW,
    });
    expect(s.title).toBe("Alpha");
  });

  it("only the MOST RECENT session carries a penalty", () => {
    // Alpha ran 30h ago (inside the 48h window), but an unrelated session is
    // more recent — so Alpha is NOT penalized, and with both templates tied on
    // quad staleness the alphabetical tie-break keeps Alpha on top.
    const templates = [
      template("t-a", "Alpha", ["Back Squat"]),
      template("t-b", "Beta", ["Front Squat"]),
    ];
    const s = suggestNextWorkout({
      logs: [
        log("Other", hoursAgo(25), [ex("Crunch")]), // Saturday 11am — not today
        log("Alpha", hoursAgo(30), [ex("Back Squat")], "t-a"),
      ],
      templates,
      starters: [],
      now: NOW,
    });
    expect(s.title).toBe("Alpha");
  });

  it("staleness is capped at 14 days for scoring", () => {
    // Zeta's quads are 30 days cold, Alpha's chest 14 — capped they tie, and
    // the alphabetical tie-break exposes that the 30 didn't out-score the 14.
    const templates = [
      template("t-z", "Zeta Legs", ["Back Squat"]),
      template("t-al", "Alpha Push", ["Barbell Bench Press"]),
    ];
    const s = suggestNextWorkout({
      logs: [
        log("Zeta Legs", daysAgo(30), [ex("Back Squat")], "t-z"),
        log("Alpha Push", daysAgo(14), [ex("Barbell Bench Press")], "t-al"),
      ],
      templates,
      starters: [],
      now: NOW,
    });
    expect(s.title).toBe("Alpha Push");
    expect(s.reason).toBe("Chest hasn't been trained in 14 days.");
  });
});

describe("suggestNextWorkout — rest day (rule d)", () => {
  const templates = [template("t-legs", "Leg Day", ["Back Squat"])];

  it("returns rest when a log finished today", () => {
    const finishedToday = new Date(2026, 7, 9, 7, 0).toISOString(); // 7am local
    const s = suggestNextWorkout({
      logs: [log("Morning", finishedToday, [ex("Crunch")])],
      templates,
      starters: [],
      now: NOW,
    });
    expect(s).toEqual({
      kind: "rest",
      id: null,
      title: "Recovery",
      ctaLabel: "Browse workouts",
      reason: "You already trained today — recovery counts too.",
      muscles: [],
    });
  });

  it("11:59pm yesterday is NOT today — suggests a workout, not rest", () => {
    const lateLastNight = new Date(2026, 7, 8, 23, 59).toISOString();
    const s = suggestNextWorkout({
      logs: [log("Leg Day", lateLastNight, [ex("Back Squat")], "t-legs")],
      templates,
      starters: [],
      now: NOW,
    });
    expect(s.kind).toBe("template");
    expect(s.title).toBe("Leg Day");
    // Under 24h elapsed but before local midnight → the day-0 phrasing
    // says yesterday, because it was.
    expect(s.reason).toBe("Quads were trained yesterday.");
  });
});

describe("suggestNextWorkout — starter fallbacks (rules b + f)", () => {
  it("no templates → suggests from starter programs", () => {
    const starters = [
      starter("s-push", "Push", ["Barbell Bench Press"]),
      starter("s-legs", "Legs", ["Back Squat"]),
    ];
    const s = suggestNextWorkout({
      logs: [log("Push", daysAgo(1), [ex("Barbell Bench Press")])],
      templates: [],
      starters,
      now: NOW,
    });
    expect(s.kind).toBe("starter");
    expect(s.id).toBe("s-legs");
    expect(s.ctaLabel).toBe("Start Legs");
    expect(s.reason).toBe("You haven't hit Quads yet — start here.");
  });

  it("never-trained muscles get first-time copy on template picks too", () => {
    // Zero logs but the user built templates — all muscles read "yet".
    const s = suggestNextWorkout({
      logs: [],
      templates: [
        template("t-b", "Bench", ["Barbell Bench Press"]),
        template("t-s", "Squat", ["Back Squat"]),
      ],
      starters: [],
      now: NOW,
    });
    expect(s.kind).toBe("template");
    expect(s.title).toBe("Bench"); // 14-point tie → alphabetical
    expect(s.reason).toBe("You haven't hit Chest yet — start here.");
  });

  it("zero logs AND zero templates → the full-body starter with first-day copy", () => {
    const s = suggestNextWorkout({
      logs: [],
      templates: [],
      starters: starterPrograms,
      now: NOW,
    });
    expect(s.kind).toBe("starter");
    expect(s.id).toBe("full-body-foundations");
    expect(s.title).toBe("Full Body Foundations");
    expect(s.ctaLabel).toBe("Start Full Body Foundations");
    expect(s.reason).toBe("No blank pages — this one trains everything.");
    expect(s.muscles.length).toBeGreaterThan(0);
  });

  it("finds the full-body starter by name/split even when it is not first", () => {
    const starters = [
      starter("s-push", "Push", ["Barbell Bench Press"]),
      starter("s-fb", "Foundations", ["Back Squat"], "Full Body"),
    ];
    const s = suggestNextWorkout({ logs: [], templates: [], starters, now: NOW });
    expect(s.id).toBe("s-fb");
  });

  it("falls back to the first starter when nothing suggests full-body", () => {
    const starters = [
      starter("s-a", "Alpha", ["Back Squat"]),
      starter("s-b", "Beta", ["Barbell Bench Press"]),
    ];
    const s = suggestNextWorkout({ logs: [], templates: [], starters, now: NOW });
    expect(s.id).toBe("s-a");
    expect(s.reason).toBe("No blank pages — this one trains everything.");
  });
});

describe("suggestNextWorkout — abandoned sessions are invisible", () => {
  const templates = [template("t-legs", "Leg Day", ["Back Squat"])];

  it("a zero-completed-set log finished today does NOT trigger the rest rule", () => {
    // The de-facto "abandon" path: open a session, tap Finish with nothing
    // done. The hero must keep naming a workout, not claim you trained.
    const abandoned = log("Leg Day", hoursAgo(3), [ex("Back Squat", false)], "t-legs");
    const s = suggestNextWorkout({ logs: [abandoned], templates, starters: [], now: NOW });
    expect(s.kind).toBe("template");
    expect(s.title).toBe("Leg Day");
  });

  it("a zero-completed-set log does NOT carry the recency penalty", () => {
    const templates2 = [
      template("t-a", "Alpha", ["Back Squat"]),
      template("t-b", "Beta", ["Front Squat"]),
    ];
    // Abandoned Alpha 24h ago — without the hasTraining filter this would
    // penalize Alpha −8 and flip the pick to Beta.
    const s = suggestNextWorkout({
      logs: [log("Alpha", hoursAgo(24), [ex("Back Squat", false)], "t-a")],
      templates: templates2,
      starters: [],
      now: NOW,
    });
    expect(s.title).toBe("Alpha"); // alphabetical tie-break, no penalty
  });

  it("an account whose only log is abandoned still counts as brand-new (rule f)", () => {
    const abandoned = log("Ghost", daysAgo(1), [ex("Back Squat", false)]);
    const s = suggestNextWorkout({
      logs: [abandoned],
      templates: [],
      starters: starterPrograms,
      now: NOW,
    });
    expect(s.id).toBe("full-body-foundations");
    expect(s.reason).toBe("No blank pages — this one trains everything.");
  });
});

describe("suggestNextWorkout — declared split bonus (rule g)", () => {
  it("prefers starters matching the onboarding split when staleness ties", () => {
    // Both never trained → mean 14 each. "Push Day" would lose the
    // alphabetical tie-break to "Lower Body", but the declared PPL split
    // gives it +2.
    const starters = [
      starter("s-lower", "Lower Body", ["Back Squat"], "Upper / Lower"),
      starter("s-push", "Push Day", ["Barbell Bench Press"], "Push / Pull / Legs"),
    ];
    const s = suggestNextWorkout({
      logs: [log("Warmup", daysAgo(20), [ex("Crunch")])], // non-empty logs → skip rule f
      templates: [],
      starters,
      profile: { split: "Push Pull Legs" }, // onboarding phrasing, no slashes
      now: NOW,
    });
    expect(s.id).toBe("s-push");
  });

  it("the bonus cannot outweigh genuinely stale muscles", () => {
    // Matching split but quads trained yesterday (staleness 1 + bonus 2 = 3)
    // vs off-split chest 9 days cold (staleness 9).
    const starters = [
      starter("s-legs", "Leg Day", ["Back Squat"], "Push / Pull / Legs"),
      starter("s-upper", "Upper Body", ["Barbell Bench Press"], "Upper / Lower"),
    ];
    const s = suggestNextWorkout({
      logs: [
        log("Leg Day", daysAgo(1), [ex("Back Squat")]),
        log("Upper Body", daysAgo(9), [ex("Barbell Bench Press")]),
      ],
      templates: [],
      starters,
      profile: { split: "Push Pull Legs" },
      now: NOW,
    });
    expect(s.id).toBe("s-upper");
  });

  it("no declared split (or 'Not Sure / Other') changes nothing", () => {
    const starters = [
      starter("s-lower", "Lower Body", ["Back Squat"], "Upper / Lower"),
      starter("s-push", "Push Day", ["Barbell Bench Press"], "Push / Pull / Legs"),
    ];
    const args = {
      logs: [log("Warmup", daysAgo(20), [ex("Crunch")])],
      templates: [],
      starters,
      now: NOW,
    };
    expect(suggestNextWorkout({ ...args, profile: { split: "Not Sure / Other" } }).id).toBe(
      "s-lower", // alphabetical tie-break, no bonus anywhere
    );
    expect(suggestNextWorkout({ ...args, profile: null }).id).toBe("s-lower");
  });
});

describe("suggestNextWorkout — equipment eligibility (starters only)", () => {
  it('"None" first-run (rule f) gets the bodyweight program, not the cable full-body', () => {
    const s = suggestNextWorkout({
      logs: [],
      templates: [],
      starters: starterPrograms,
      profile: { equipment: "None" },
      now: NOW,
    });
    expect(s.kind).toBe("starter");
    expect(s.id).toBe("bodyweight-foundations");
    expect(s.reason).toBe("No blank pages — this one trains everything.");
    expect(s.muscles.length).toBeGreaterThan(0);
  });

  it('"Full gym" / "Home gym" / unset still get the original full-body starter', () => {
    const args = { logs: [], templates: [], starters: starterPrograms, now: NOW };
    expect(suggestNextWorkout({ ...args, profile: { equipment: "Full gym" } }).id).toBe(
      "full-body-foundations",
    );
    expect(suggestNextWorkout({ ...args, profile: { equipment: "Home gym" } }).id).toBe(
      "full-body-foundations",
    );
    expect(suggestNextWorkout({ ...args, profile: null }).id).toBe("full-body-foundations");
  });

  it('"None" ongoing pool contains only bodyweight starters', () => {
    // The gym starter's upper-back is never-trained (capped 14) and would win
    // outright — proof that it was excluded, not merely out-tie-broken.
    const starters = [
      starter("s-gym", "Gym Rows", ["Barbell Row"], "Split", "gym"),
      starter("s-bw", "Bodyweight Push", ["Push-Up"], "Split", "none"), // chest 1 day ago → 1
    ];
    const s = suggestNextWorkout({
      logs: [log("Push", daysAgo(1), [ex("Push-Up")])], // non-empty logs → skip rule f
      templates: [],
      starters,
      profile: { equipment: "None" },
      now: NOW,
    });
    expect(s.id).toBe("s-bw");
  });

  it('"Dumbbells only" allows none + dumbbells starters but not gym', () => {
    // Unfiltered, "Alpha Gym" ties "Dumbbell Push" at 14 and wins the
    // alphabetical tie-break — the filter is what hands the win to dumbbells.
    const starters = [
      starter("s-gym", "Alpha Gym", ["Barbell Row"], "Split", "gym"),
      starter("s-db", "Dumbbell Push", ["Dumbbell Bench Press"], "Split", "dumbbells"),
      starter("s-bw", "Bodyweight Core", ["Crunch"], "Split", "none"), // abs 1 day ago → 1
    ];
    const s = suggestNextWorkout({
      logs: [log("Core", daysAgo(1), [ex("Crunch")])],
      templates: [],
      starters,
      profile: { equipment: "Dumbbells only" },
      now: NOW,
    });
    expect(s.id).toBe("s-db");

    // And "none" starters stay in the dumbbell user's pool too.
    const s2 = suggestNextWorkout({
      logs: [log("Push", daysAgo(1), [ex("Dumbbell Bench Press")])],
      templates: [],
      starters: [
        starter("s-db2", "Dumbbell Push", ["Dumbbell Bench Press"], "Split", "dumbbells"), // chest 1d → 1
        starter("s-bw2", "Bodyweight Legs", ["Bodyweight Squat"], "Split", "none"), // quads never → 14
      ],
      profile: { equipment: "Dumbbells only" },
      now: NOW,
    });
    expect(s2.id).toBe("s-bw2");
  });

  it("user templates are never filtered by equipment", () => {
    // A "None" user who built a barbell template gets it suggested — they
    // made it, they know what they have access to.
    const s = suggestNextWorkout({
      logs: [log("Warmup", daysAgo(20), [ex("Crunch")])],
      templates: [template("t-bb", "Barbell Day", ["Back Squat"])],
      starters: starterPrograms,
      profile: { equipment: "None" },
      now: NOW,
    });
    expect(s.kind).toBe("template");
    expect(s.id).toBe("t-bb");
  });

  it("falls back to the unfiltered pool when no starter matches the equipment", () => {
    const allGym = [
      starter("s-a", "Alpha", ["Back Squat"], "Full Body", "gym"),
      starter("s-b", "Beta", ["Barbell Bench Press"], "Split", "gym"),
    ];
    // Rule f: a brand-new "None" account must still get something startable.
    const first = suggestNextWorkout({
      logs: [],
      templates: [],
      starters: allGym,
      profile: { equipment: "None" },
      now: NOW,
    });
    expect(first.kind).toBe("starter");
    expect(first.id).toBe("s-a"); // full-body match on the fallback pool

    // Ongoing: same fallback keeps the pool non-empty.
    const ongoing = suggestNextWorkout({
      logs: [log("Warmup", daysAgo(20), [ex("Crunch")])],
      templates: [],
      starters: allGym,
      profile: { equipment: "None" },
      now: NOW,
    });
    expect(ongoing.kind).toBe("starter");
    expect(["s-a", "s-b"]).toContain(ongoing.id);
  });
});

describe("suggestNextWorkout — determinism", () => {
  it("identical inputs produce identical output", () => {
    const args = {
      logs: [
        log("Push Day", daysAgo(2), [ex("Barbell Bench Press")]),
        log("Leg Day", daysAgo(6), [ex("Back Squat")]),
      ],
      templates: [
        template("t-push", "Push Day", ["Barbell Bench Press"]),
        template("t-legs", "Leg Day", ["Back Squat"]),
        template("t-pull", "Pull Day", ["Barbell Row"]),
      ],
      starters: starterPrograms,
      now: NOW,
    };
    const first = suggestNextWorkout(args);
    const second = suggestNextWorkout(args);
    expect(second).toEqual(first);
    // Pull Day's upper-back is untrained → capped 14, the clear winner.
    expect(first.title).toBe("Pull Day");
  });

  it("score ties break alphabetically by title", () => {
    // Both never trained → both mean 14. "Anchor" < "Zenith".
    const s = suggestNextWorkout({
      logs: [],
      templates: [
        template("t-z", "Zenith", ["Back Squat"]),
        template("t-a", "Anchor", ["Barbell Bench Press"]),
      ],
      starters: [],
      now: NOW,
    });
    expect(s.title).toBe("Anchor");
  });
});
