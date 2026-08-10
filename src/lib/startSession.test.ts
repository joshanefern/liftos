import { beforeEach, describe, expect, it } from "vitest";
import type { StarterProgram } from "@/data/starterPrograms";
import {
  ACTIVE_WORKOUT_STORAGE_KEY,
  buildSessionFromStarter,
  buildSessionFromTemplate,
  persistActiveSession,
} from "./startSession";

const exercises = [
  {
    id: "bench",
    name: "Barbell Bench Press",
    category: "Chest",
    target: "3 × 8",
    sets: [{ id: "bench-1", reps: 8, weight: 135 }],
  },
];

const program: StarterProgram = {
  id: "s-full",
  name: "Full Body",
  split: "Full Body",
  focus: "f",
  duration: 45,
  difficulty: "Moderate",
  equipment: "gym",
  description: "d",
  exercises,
};

describe("buildSessionFromTemplate", () => {
  it("carries the template id, name, exercises, and an ISO start time", () => {
    const session = buildSessionFromTemplate({ id: "t-1", name: "Push A", exercises });
    expect(session.templateId).toBe("t-1");
    expect(session.name).toBe("Push A");
    expect(session.exercises).toBe(exercises);
    expect(Number.isFinite(Date.parse(session.startedAt))).toBe(true);
  });

  it("leaves templateId undefined for id-less starts", () => {
    const session = buildSessionFromTemplate({ name: "Ad hoc", exercises });
    expect(session.templateId).toBeUndefined();
  });
});

describe("buildSessionFromStarter", () => {
  it("strips program metadata and never sets a templateId", () => {
    const session = buildSessionFromStarter(program);
    expect(session.templateId).toBeUndefined();
    expect(session.name).toBe("Full Body");
    expect(session.exercises).toBe(exercises);
    expect(session).not.toHaveProperty("split");
    expect(session).not.toHaveProperty("description");
  });
});

describe("persistActiveSession", () => {
  beforeEach(() => window.localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY));

  it("writes the session to the active-workout key", () => {
    persistActiveSession(buildSessionFromTemplate({ id: "t-1", name: "Push A", exercises }));
    const raw = window.localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(parsed.templateId).toBe("t-1");
    expect(parsed.name).toBe("Push A");
    expect(parsed.exercises).toHaveLength(1);
  });

  it("JSON.stringify drops an undefined templateId so starter sessions stay clean", () => {
    persistActiveSession(buildSessionFromStarter(program));
    const parsed = JSON.parse(window.localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY) as string);
    expect("templateId" in parsed).toBe(false);
    expect(parsed.name).toBe("Full Body");
  });
});
