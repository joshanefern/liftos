import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { WorkoutExercise } from "@/data/liftosMock";
import type { WorkoutLog } from "@/hooks/useWorkoutLogs";
import { buildWeekOverview, headlineText, weekHeadline, workoutDetail } from "./weekOverview";
import { countPRsThisMonth, getWeekStats } from "./workoutStats";
import { compactVolume } from "./consistency";

const mk = (id: string, when: Date, extra: Partial<WorkoutLog> = {}): WorkoutLog => ({
  id,
  template_id: null,
  name: "Push Day",
  exercises: [],
  notes: null,
  started_at: null,
  finished_at: when.toISOString(),
  duration_minutes: 52,
  total_sets: 12,
  completed_sets: 12,
  total_volume: 9400,
  source: "manual",
  captured_session_id: null,
  created_at: when.toISOString(),
  ...extra,
});

const bench = (id: string, weight: number, reps: number): WorkoutExercise => ({
  id: `${id}-bench`,
  name: "Bench Press",
  category: "",
  target: "",
  sets: [{ id: `${id}-bench-1`, weight, reps, completed: true }],
});

// Wednesday 30 Sep 2026, noon local. The week is Mon 28 Sep – Sun 4 Oct.
const NOW = new Date(2026, 8, 30, 12, 0, 0);

describe("buildWeekOverview — the card's week", () => {
  const logs = [
    mk("last-sunday", new Date(2026, 8, 27, 23, 59, 59)),
    mk("monday-midnight", new Date(2026, 8, 28, 0, 0, 0)),
    mk("today", new Date(2026, 8, 30, 9, 0, 0)),
  ];

  it("runs Monday 00:00 local to Sunday, Monday first", () => {
    const week = buildWeekOverview({ logs, planned: 4, units: "lb", now: NOW });
    expect(week.start.getTime()).toBe(new Date(2026, 8, 28).getTime());
    expect(week.rangeLabel).toBe("Sep 28 – Oct 4");
    expect(week.days.map((d) => d.weekday)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(week.days.map((d) => d.dateLabel)).toEqual([
      "Sep 28", "Sep 29", "Sep 30", "Oct 1", "Oct 2", "Oct 3", "Oct 4",
    ]);
    expect(week.days[2].longLabel).toBe("Wednesday, September 30");
    expect(week.todayIndex).toBe(2);
    expect(week.days.filter((d) => d.isToday).map((d) => d.index)).toEqual([2]);
  });

  it("takes a log at Monday 00:00 and leaves last Sunday's 23:59 to last week", () => {
    const week = buildWeekOverview({ logs, planned: 4, units: "lb", now: NOW });
    expect(week.days[0].workouts.map((w) => w.id)).toEqual(["monday-midnight"]);
    expect(week.headline.count).toBe(2);
  });

  it("agrees with the card's count and dots", () => {
    const withFuture = [...logs, mk("friday", new Date(2026, 9, 2, 18)), mk("next-week", new Date(2026, 9, 6, 18))];
    const week = buildWeekOverview({ logs: withFuture, planned: 4, units: "lb", now: NOW });
    const card = getWeekStats(withFuture, NOW);
    expect(week.headline.count).toBe(card.sessions);
    expect([...week.workedDayIndices].sort()).toEqual([...card.workedDayIndices].sort());
    expect(week.workedDayIndices).toEqual([0, 2]);
  });

  it("uses the week `now` falls in on a Monday morning and a Sunday night", () => {
    const mondayMorning = new Date(2026, 8, 28, 0, 5);
    expect(buildWeekOverview({ logs, planned: null, units: "lb", now: mondayMorning }).start.getTime()).toBe(
      new Date(2026, 8, 28).getTime(),
    );
    const sundayNight = new Date(2026, 9, 4, 23, 59);
    const sunday = buildWeekOverview({ logs, planned: null, units: "lb", now: sundayNight });
    expect(sunday.start.getTime()).toBe(new Date(2026, 8, 28).getTime());
    expect(sunday.todayIndex).toBe(6);
    expect(sunday.days.slice(0, 6).every((d) => d.status !== "ahead")).toBe(true);
  });
});

describe("buildWeekOverview — days", () => {
  it("gives each workout on one day its own line, in the order they were finished", () => {
    const logs = [
      mk("evening", new Date(2026, 8, 29, 19), { name: "Run" }),
      mk("morning", new Date(2026, 8, 29, 7), { name: "Pull Day" }),
    ];
    const week = buildWeekOverview({ logs, planned: 4, units: "lb", now: NOW });
    expect(week.days[1].workouts.map((w) => w.name)).toEqual(["Pull Day", "Run"]);
    expect(week.days[1].status).toBe("logged");
    expect(week.headline.count).toBe(2);
    expect(week.workedDayIndices).toEqual([1]);
  });

  it("says a past empty day had nothing logged, today not yet, and nothing about days ahead", () => {
    const week = buildWeekOverview({
      logs: [mk("mon", new Date(2026, 8, 28, 18))],
      planned: 4,
      units: "lb",
      now: NOW,
    });
    expect(week.days.map((d) => d.status)).toEqual([
      "logged", "none", "today", "ahead", "ahead", "ahead", "ahead",
    ]);
    expect(week.days.slice(3).every((d) => d.workouts.length === 0)).toBe(true);
  });

  it("marks today logged once it has a workout", () => {
    const week = buildWeekOverview({
      logs: [mk("wed", new Date(2026, 8, 30, 8))],
      planned: null,
      units: "lb",
      now: NOW,
    });
    expect(week.days[2]).toMatchObject({ isToday: true, status: "logged" });
  });

  it("ignores logs dated on a later day — later this week, next week", () => {
    const logs = [
      mk("done", new Date(2026, 8, 28, 18)),
      mk("thursday", new Date(2026, 9, 1, 0, 0, 0)),
      mk("friday", new Date(2026, 9, 2, 18)),
      mk("next-monday", new Date(2026, 9, 5, 18)),
    ];
    const week = buildWeekOverview({ logs, planned: 4, units: "lb", now: NOW });
    expect(week.headline.count).toBe(1);
    expect(week.days.flatMap((d) => d.workouts.map((w) => w.id))).toEqual(["done"]);
    expect(week.days[3].status).toBe("ahead");
    expect(week.days[4].status).toBe("ahead");
    expect(week.days[2].status).toBe("today");
  });

  it("keeps a log stamped a few minutes ahead today, on today's row", () => {
    const week = buildWeekOverview({
      logs: [mk("skewed", new Date(2026, 8, 30, 12, 3))],
      planned: 4,
      units: "lb",
      now: NOW,
    });
    expect(week.days[2]).toMatchObject({ status: "logged", isToday: true });
    expect(week.headline.count).toBe(getWeekStats([mk("skewed", new Date(2026, 8, 30, 12, 3))], NOW).sessions);
  });

  it("ignores a log with an unreadable date", () => {
    const week = buildWeekOverview({
      logs: [{ ...mk("bad", NOW), finished_at: "not a date" }],
      planned: 4,
      units: "lb",
      now: NOW,
    });
    expect(week.headline.count).toBe(0);
  });
});

describe("buildWeekOverview — totals and units", () => {
  it("adds up sets, weight lifted and minutes for the week only", () => {
    const logs = [
      mk("last-week", new Date(2026, 8, 25, 18), { completed_sets: 99, total_volume: 99_000 }),
      mk("mon", new Date(2026, 8, 28, 18), { completed_sets: 12, total_volume: 9400, duration_minutes: 52 }),
      mk("tue", new Date(2026, 8, 29, 18), { completed_sets: 10, total_volume: 8050, duration_minutes: 48 }),
    ];
    const week = buildWeekOverview({ logs, planned: 4, units: "lb", now: NOW });
    expect(week.totals).toEqual([
      { key: "sets", value: "22", label: "sets" },
      // 17,450 — one decimal, the same rule (and the same float rounding)
      // as every other weight total in the app.
      { key: "volume", value: "17.4k", label: "lb lifted" },
      { key: "minutes", value: "100", label: "min" },
    ]);
  });

  it("names the lifter's unit and converts nothing", () => {
    const log = mk("kg", new Date(2026, 8, 28, 18), { total_volume: 4300 });
    const week = buildWeekOverview({ logs: [log], planned: 4, units: "kg", now: NOW });
    expect(week.days[0].workouts[0].detail).toBe("12 sets · 4.3k kg · 52 min");
    expect(week.totals.find((t) => t.key === "volume")).toEqual({
      key: "volume",
      value: "4.3k",
      label: "kg lifted",
    });
  });

  it("leaves out what a week does not have instead of a zero", () => {
    // A bodyweight session with no recorded duration.
    const logs = [mk("bw", new Date(2026, 8, 28, 18), { total_volume: 0, duration_minutes: null, completed_sets: 1 })];
    const week = buildWeekOverview({ logs, planned: 4, units: "lb", now: NOW });
    expect(week.totals).toEqual([{ key: "sets", value: "1", label: "set" }]);
    expect(week.days[0].workouts[0].detail).toBe("1 set");
  });

  it("prints weight lifted by Home's one rule, so the week never reads bigger than its month", () => {
    // Mon 1 Jun 2026: the month so far IS this week. 10,500 + 12,885 lb.
    const now = new Date(2026, 5, 3, 23);
    const logs = [
      mk("may", new Date(2026, 4, 29, 18), { total_volume: 30_000 }),
      mk("push", new Date(2026, 5, 1, 19), { total_volume: 10_500, duration_minutes: 60 }),
      mk("pull", new Date(2026, 5, 3, 19), { total_volume: 12_885, duration_minutes: 56 }),
    ];
    const week = buildWeekOverview({ logs, planned: 4, units: "lb", now });
    const monthVolume = 10_500 + 12_885;
    // Home's month tile prints the same number the same way.
    expect(week.totals.find((t) => t.key === "volume")?.value).toBe(compactVolume(monthVolume));
    expect(compactVolume(monthVolume)).toBe("23.4k");
    // Per workout: a decimal, like the Calendar's day sheet ("10.5k").
    expect(week.days[0].workouts[0].detail).toBe("12 sets · 10.5k lb · 60 min");
    expect(week.days[2].workouts[0].detail).toBe("12 sets · 12.9k lb · 56 min");
  });

  it("has no totals at all for a week with no workouts", () => {
    const week = buildWeekOverview({ logs: [], planned: 4, units: "lb", now: NOW });
    expect(week.totals).toEqual([]);
    expect(week.headline.count).toBe(0);
    expect(week.records).toEqual([]);
    expect(week.workedDayIndices).toEqual([]);
  });
});

describe("workoutDetail", () => {
  it("reads sets, compact weight and minutes, skipping what is missing", () => {
    expect(workoutDetail(mk("a", NOW), "lb")).toBe("12 sets · 9.4k lb · 52 min");
    expect(workoutDetail(mk("big", NOW, { total_volume: 18_120 }), "lb")).toBe("12 sets · 18.1k lb · 52 min");
    expect(workoutDetail(mk("b", NOW, { total_volume: 950, duration_minutes: null }), "lb")).toBe(
      "12 sets · 950 lb",
    );
    expect(workoutDetail(mk("c", NOW, { completed_sets: 0, total_volume: 0, duration_minutes: 30 }), "lb")).toBe(
      "30 min",
    );
    expect(workoutDetail(mk("d", NOW, { completed_sets: 0, total_volume: 0, duration_minutes: 0 }), "lb")).toBe("");
  });
});

describe("the headline", () => {
  it("reads against the plan when there is one", () => {
    expect(headlineText(weekHeadline(1, 4))).toBe("1 of 4 planned workouts");
    expect(headlineText(weekHeadline(0, 3))).toBe("0 of 3 planned workouts");
  });

  it("is a plain count with no plan", () => {
    expect(headlineText(weekHeadline(1, null))).toBe("1 workout");
    expect(headlineText(weekHeadline(3, null))).toBe("3 workouts");
    const week = buildWeekOverview({
      logs: [mk("mon", new Date(2026, 8, 28, 18)), mk("tue", new Date(2026, 8, 29, 18))],
      planned: null,
      units: "lb",
      now: NOW,
    });
    expect(week.headline).toEqual({ count: 2, planned: null, noun: "workouts" });
  });
});

describe("buildWeekOverview — records", () => {
  it("lists bests beaten this week, never a first-ever lift", () => {
    const logs = [
      mk("old", new Date(2026, 8, 21, 18), { exercises: [bench("old", 185, 5)] }),
      mk("mon", new Date(2026, 8, 28, 18), {
        exercises: [
          bench("mon", 195, 3),
          {
            id: "mon-squat",
            name: "Back Squat",
            category: "",
            target: "",
            sets: [{ id: "mon-squat-1", weight: 225, reps: 5, completed: true }],
          },
        ],
      }),
    ];
    const week = buildWeekOverview({ logs, planned: 4, units: "lb", now: NOW });
    expect(week.records).toEqual([
      { key: "mon:bench press", logId: "mon", dayIndex: 0, exercise: "Bench Press", value: "195 lb × 3" },
    ]);
  });

  it("lists a lift that beat its best in two workouts twice, each on its day", () => {
    const logs = [
      mk("old", new Date(2026, 8, 21, 18), { exercises: [bench("old", 185, 5)] }),
      mk("mon", new Date(2026, 8, 28, 18), { exercises: [bench("mon", 190, 5)] }),
      mk("wed", new Date(2026, 8, 30, 9), { exercises: [bench("wed", 195, 5)] }),
    ];
    const week = buildWeekOverview({ logs, planned: 4, units: "kg", now: NOW });
    expect(week.records.map((r) => [r.logId, r.dayIndex, r.exercise, r.value])).toEqual([
      ["mon", 0, "Bench Press", "190 kg × 5"],
      ["wed", 2, "Bench Press", "195 kg × 5"],
    ]);
    expect(new Set(week.records.map((r) => r.key)).size).toBe(2);
  });

  it("counts in the card's unit: the list adds up to its records-this-month count", () => {
    // Wed 3 Jun 2026 — Mon 1 Jun starts both the month and the week. Bench
    // and squat beat their bests on Monday, bench again twice today (one
    // workout each), and a set that beats weight, e1rm and reps at once is
    // still one record.
    const now = new Date(2026, 5, 3, 23);
    const squat = (id: string, weight: number): WorkoutExercise => ({
      id: `${id}-squat`,
      name: "Back Squat",
      category: "",
      target: "",
      sets: [{ id: `${id}-squat-1`, weight, reps: 5, completed: true }],
    });
    const logs = [
      mk("may", new Date(2026, 4, 29, 18), { exercises: [bench("may", 185, 5), squat("may", 225)] }),
      mk("mon", new Date(2026, 5, 1, 18), { exercises: [bench("mon", 190, 6), squat("mon", 235)] }),
      mk("am", new Date(2026, 5, 3, 8), { exercises: [bench("am", 195, 5)] }),
      mk("pm", new Date(2026, 5, 3, 20), { exercises: [bench("pm", 200, 5)] }),
    ];
    const week = buildWeekOverview({ logs, planned: 4, units: "lb", now });
    expect(week.records.map((r) => `${r.dayIndex} ${r.exercise}: ${r.value}`)).toEqual([
      "0 Bench Press: 190 lb × 6",
      "0 Back Squat: 235 lb × 5",
      "2 Bench Press: 195 lb × 5",
      "2 Bench Press: 200 lb × 5",
    ]);
    expect(week.records).toHaveLength(countPRsThisMonth(logs, now));
  });

  it("names a rep record and a hold record in their own terms", () => {
    const pullUps = (id: string, reps: number): WorkoutExercise => ({
      id: `${id}-pu`,
      name: "Pull Up",
      category: "",
      target: "",
      sets: [{ id: `${id}-pu-1`, reps, completed: true }],
    });
    const plank = (id: string, seconds: number): WorkoutExercise => ({
      id: `${id}-pl`,
      name: "Plank",
      tracking: "time",
      category: "",
      target: "",
      sets: [{ id: `${id}-pl-1`, reps: 0, duration_seconds: seconds, completed: true }],
    });
    const logs = [
      mk("old", new Date(2026, 8, 21, 18), { exercises: [pullUps("old", 8), plank("old", 60)] }),
      mk("tue", new Date(2026, 8, 29, 18), { exercises: [pullUps("tue", 10), plank("tue", 90)] }),
    ];
    const week = buildWeekOverview({ logs, planned: 4, units: "lb", now: NOW });
    expect(week.records.map((r) => `${r.exercise}: ${r.value}`)).toEqual([
      "Pull Up: 10 reps",
      "Plank: 1:30 hold",
    ]);
  });

  it("ignores records from outside the week", () => {
    const logs = [
      mk("older", new Date(2026, 8, 14, 18), { exercises: [bench("older", 185, 5)] }),
      mk("last-week", new Date(2026, 8, 21, 18), { exercises: [bench("last-week", 195, 5)] }),
      mk("future", new Date(2026, 9, 2, 18), { exercises: [bench("future", 225, 5)] }),
    ];
    const week = buildWeekOverview({ logs, planned: 4, units: "lb", now: NOW });
    expect(week.records).toEqual([]);
  });
});

describe("buildWeekOverview — weeks that cross a clock change", () => {
  let savedTz: string | undefined;
  beforeAll(() => {
    savedTz = process.env.TZ;
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    if (savedTz === undefined) delete process.env.TZ;
    else process.env.TZ = savedTz;
  });

  it("clocks back (Sun 1 Nov 2026): every row is local midnight and Sunday night stays Sunday", () => {
    const now = new Date(2026, 10, 1, 23, 45);
    const logs = [
      mk("mon", new Date(2026, 9, 26, 0, 30)),
      mk("sun-night", new Date(2026, 10, 1, 23, 30)),
    ];
    const week = buildWeekOverview({ logs, planned: 3, units: "lb", now });
    expect(week.rangeLabel).toBe("Oct 26 – Nov 1");
    expect(week.days.map((d) => [d.date.getDate(), d.date.getHours(), d.date.getMinutes()])).toEqual([
      [26, 0, 0], [27, 0, 0], [28, 0, 0], [29, 0, 0], [30, 0, 0], [31, 0, 0], [1, 0, 0],
    ]);
    expect(week.days[0].workouts.map((w) => w.id)).toEqual(["mon"]);
    expect(week.days[6].workouts.map((w) => w.id)).toEqual(["sun-night"]);
    expect(week.headline.count).toBe(getWeekStats(logs, now).sessions);
  });

  it("the Monday after starts a new week at its own midnight", () => {
    const now = new Date(2026, 10, 2, 0, 30);
    const logs = [mk("sun-night", new Date(2026, 10, 1, 23, 30)), mk("mon", new Date(2026, 10, 2, 0, 10))];
    const week = buildWeekOverview({ logs, planned: 3, units: "lb", now });
    expect(week.start.getTime()).toBe(new Date(2026, 10, 2).getTime());
    expect(week.start.getHours()).toBe(0);
    expect(week.headline.count).toBe(1);
    expect(week.workedDayIndices).toEqual([0]);
  });

  it("clocks forward (Sun 8 Mar 2026): the week still starts Monday 00:00", () => {
    const now = new Date(2026, 2, 8, 20);
    const logs = [
      mk("prev-sunday", new Date(2026, 2, 1, 23, 30)),
      mk("mon", new Date(2026, 2, 2, 0, 15)),
      mk("sun", new Date(2026, 2, 8, 12)),
    ];
    const week = buildWeekOverview({ logs, planned: 3, units: "lb", now });
    expect(week.start.getTime()).toBe(new Date(2026, 2, 2).getTime());
    expect(week.days[6].date.getTime()).toBe(new Date(2026, 2, 8).getTime());
    expect(week.days.map((d) => d.date.getHours())).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(week.workedDayIndices).toEqual([0, 6]);
    expect(week.headline.count).toBe(2);
  });
});
