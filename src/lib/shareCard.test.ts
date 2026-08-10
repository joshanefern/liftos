import { describe, expect, it } from "vitest";
import {
  formatCompactVolume,
  formatDateLabel,
  formatNumber,
  heroStat,
  hexWithAlpha,
  metaColumns,
  muscleIntensity,
  muscleLabel,
  splitHeroValue,
  topMuscles,
  wrapText,
  type ShareCardSession,
} from "./shareCard";
import type { Muscle, MuscleActivation } from "./muscleMap";

const makeLog = (over: Partial<ShareCardSession> = {}): ShareCardSession => ({
  name: "Push Strength",
  exercises: [
    { id: "e1", name: "Barbell Bench Press", category: "Chest", target: "", sets: [] },
    { id: "e2", name: "Incline Dumbbell Press", category: "Chest", target: "", sets: [] },
    { id: "e3", name: "Cable Lateral Raise", category: "Shoulders", target: "", sets: [] },
  ],
  finished_at: "2026-08-07T12:00:00",
  duration_minutes: 84,
  total_sets: 21,
  completed_sets: 18,
  total_volume: 12450,
  ...over,
});

const act = (primary: Muscle[], secondary: Muscle[] = []): MuscleActivation => ({
  primary: new Set(primary),
  secondary: new Set(secondary),
  unmatchedExercises: [],
});

describe("formatDateLabel", () => {
  it("renders an uppercased editorial date", () => {
    expect(formatDateLabel("2026-08-07T12:00:00")).toBe("FRIDAY — AUG 7, 2026");
  });
});

describe("formatNumber / formatCompactVolume", () => {
  it("groups thousands", () => {
    expect(formatNumber(12450)).toBe("12,450");
  });

  it("keeps small volumes exact", () => {
    expect(formatCompactVolume(0)).toBe("0");
    expect(formatCompactVolume(850)).toBe("850");
    expect(formatCompactVolume(9850)).toBe("9,850");
  });

  it("abbreviates from 10k up", () => {
    expect(formatCompactVolume(12450)).toBe("12.5k");
    expect(formatCompactVolume(13000)).toBe("13k");
    expect(formatCompactVolume(100000)).toBe("100k");
  });
});

describe("splitHeroValue", () => {
  it("bolds the trailing digit group after a separator", () => {
    expect(splitHeroValue("1:24")).toEqual([
      { text: "1:", bold: false },
      { text: "24", bold: true },
    ]);
    expect(splitHeroValue("12,450")).toEqual([
      { text: "12,", bold: false },
      { text: "450", bold: true },
    ]);
  });

  it("leaves a plain number as a single light segment", () => {
    expect(splitHeroValue("58")).toEqual([{ text: "58", bold: false }]);
  });
});

describe("heroStat", () => {
  it("prefers duration, in h:mm from an hour up", () => {
    const hero = heroStat(makeLog({ duration_minutes: 84 }));
    expect(hero.value).toBe("1:24");
    expect(hero.unit).toBe("hrs");
    expect(hero.label).toBe("duration");
  });

  it("uses plain minutes under an hour", () => {
    const hero = heroStat(makeLog({ duration_minutes: 58 }));
    expect(hero.value).toBe("58");
    expect(hero.unit).toBe("min");
  });

  it("falls back to volume in the user's units when duration is missing", () => {
    const hero = heroStat(makeLog({ duration_minutes: null }), "kg");
    expect(hero.value).toBe("12,450");
    expect(hero.unit).toBe("kg");
    expect(hero.label).toBe("total volume");
  });

  it("falls back to completed sets when duration and volume are empty", () => {
    const hero = heroStat(makeLog({ duration_minutes: null, total_volume: 0 }));
    expect(hero.value).toBe("18");
    expect(hero.unit).toBe("sets");
  });
});

describe("metaColumns", () => {
  it("builds sets, volume, exercises columns", () => {
    const cols = metaColumns(makeLog());
    expect(cols.map((c) => c.label)).toEqual(["sets", "volume · lb", "exercises"]);
    expect(cols[0].value).toBe("18/21");
    expect(cols[1].value).toBe("12.5k");
    expect(cols[2].value).toBe("3");
  });

  it("appends a PR column only when a count is provided", () => {
    expect(metaColumns(makeLog(), "lb", 2).at(-1)).toEqual({ label: "prs", value: "2" });
    expect(metaColumns(makeLog(), "lb").length).toBe(3);
  });

  it("respects kg units in the volume label", () => {
    expect(metaColumns(makeLog(), "kg")[1].label).toBe("volume · kg");
  });
});

describe("muscleIntensity", () => {
  it("scores primary 1 and secondary 0.5, normalized to the max", () => {
    const scores = muscleIntensity([act(["chest"], ["triceps"])]);
    expect(scores.get("chest")).toBe(1);
    expect(scores.get("triceps")).toBe(0.5);
  });

  it("accumulates across activations before normalizing", () => {
    const scores = muscleIntensity([
      act(["chest"], ["triceps"]),
      act(["chest"], ["front-deltoids"]),
    ]);
    expect(scores.get("chest")).toBe(1);
    expect(scores.get("triceps")).toBe(0.25);
  });

  it("does not double-count a muscle listed as both primary and secondary", () => {
    const scores = muscleIntensity([act(["chest"], ["chest", "triceps"])]);
    expect(scores.get("chest")).toBe(1);
  });

  it("returns an empty map for no activations", () => {
    expect(muscleIntensity([]).size).toBe(0);
  });
});

describe("topMuscles", () => {
  it("ranks by score, ties alphabetical, capped at five", () => {
    const top = topMuscles([
      act(["chest", "quadriceps"], ["triceps", "biceps", "forearm", "calves"]),
    ]);
    expect(top).toHaveLength(5);
    expect(top[0].muscle).toBe("chest");
    expect(top[1].muscle).toBe("quadriceps");
    expect(top.slice(2).map((t) => t.muscle)).toEqual(["biceps", "calves", "forearm"]);
  });

  it("returns empty for no activations", () => {
    expect(topMuscles([])).toEqual([]);
  });
});

describe("muscleLabel", () => {
  it("uses friendly names for mapped muscles", () => {
    expect(muscleLabel("front-deltoids")).toBe("front delts");
    expect(muscleLabel("gluteal")).toBe("glutes");
  });

  it("falls back to de-hyphenated slug", () => {
    expect(muscleLabel("chest")).toBe("chest");
    expect(muscleLabel("upper-back")).toBe("upper back");
  });
});

describe("wrapText", () => {
  const byLength = (s: string) => s.length;

  it("wraps greedily on word boundaries", () => {
    expect(wrapText("Push Strength Day", 10, byLength)).toEqual(["Push", "Strength", "Day"]);
  });

  it("keeps a too-long word on its own line without looping", () => {
    expect(wrapText("Hyperextension", 6, byLength)).toEqual(["Hyperextension"]);
  });

  it("truncates with an ellipsis at maxLines", () => {
    expect(wrapText("Push Strength Day", 10, byLength, 2)).toEqual(["Push", "Strength…"]);
  });

  it("returns a single line when it fits", () => {
    expect(wrapText("Push Day", 20, byLength)).toEqual(["Push Day"]);
  });
});

describe("hexWithAlpha", () => {
  it("converts hex to rgba", () => {
    expect(hexWithAlpha("#C8502E", 0.5)).toBe("rgba(200, 80, 46, 0.5)");
    expect(hexWithAlpha("#F6E7D5", 1)).toBe("rgba(246, 231, 213, 1)");
  });
});
