import { describe, expect, it } from "vitest";
import { buildCoachContext, type TodaySuggestion } from "./coach";
import type { Suggestion } from "./suggestion";

describe("buildCoachContext — today_suggestion", () => {
  it("defaults to null when the caller has no engine pick", () => {
    const context = buildCoachContext([], null);
    expect(context.today_suggestion).toBeNull();
  });

  it("carries the pick's kind, title, and reason", () => {
    const pick: TodaySuggestion = {
      kind: "template",
      title: "Pull Day",
      reason: "Lats hasn't been trained in 6 days.",
    };
    const context = buildCoachContext([], null, [], pick);
    expect(context.today_suggestion).toEqual(pick);
  });

  it("strips client-only Suggestion fields (id, ctaLabel, muscles) from the prompt payload", () => {
    const full: Suggestion = {
      kind: "starter",
      id: "sp-full-body",
      title: "Full Body Foundation",
      ctaLabel: "Start Full Body Foundation",
      reason: "No blank pages — this one trains everything.",
      muscles: ["chest", "quadriceps"],
    };
    const context = buildCoachContext([], null, [], full);
    expect(context.today_suggestion).toEqual({
      kind: "starter",
      title: "Full Body Foundation",
      reason: "No blank pages — this one trains everything.",
    });
  });
});
