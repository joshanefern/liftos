import { supabase } from "@/lib/supabase";
import type { VoiceIntent } from "@/lib/voiceApply";
import { foldUnilateralSets } from "@/lib/voiceUnilateral";

/* ── Interpreter client. The voice-log edge function sees ONLY the
   transcript, the session's exercise names (+ tracking) and units —
   nothing else leaves the device. ── */

export type SessionExerciseRef = { name: string; tracking: "reps" | "time" };

export const interpretUtterance = async (
  transcript: string,
  exercises: SessionExerciseRef[],
  units: string,
): Promise<VoiceIntent> => {
  const { data, error } = await supabase.functions.invoke("voice-log", {
    body: { transcript, exercises, units },
  });
  if (error) throw error;
  const intent = data as VoiceIntent;
  if (!intent || !["sets", "note", "both", "unclear"].includes(intent.kind)) {
    return { kind: "unclear", note: null, actions: [], confidence: 0 };
  }
  // "Each arm" is one set, not two — deterministic guard over the model.
  return foldUnilateralSets(intent, transcript);
};

/* ── Dictated workout plans (the builder's mic). The interpreter's "plan"
   mode returns exercises with sets/reps/weight/minutes; every number is
   bounded here before it touches a draft row. ── */

export type DictatedExercise = {
  name: string;
  kind: "lift" | "cardio";
  sets: number;
  reps: number | null;
  weight: number | null;
  seconds: number | null;
  minutes: number | null;
};

export type DictatedPlan = {
  name: string | null;
  exercises: DictatedExercise[];
  confidence: number;
};

const bounded = (v: unknown, max: number): number | null => {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return Math.min(Math.round(v * 10) / 10, max);
};

export const sanitizePlan = (raw: unknown): DictatedPlan => {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const list = Array.isArray(obj.exercises) ? obj.exercises : [];
  const exercises: DictatedExercise[] = [];
  for (const item of list.slice(0, 20)) {
    const e = (item ?? {}) as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim().slice(0, 60) : "";
    if (!name) continue;
    exercises.push({
      name,
      kind: e.kind === "cardio" ? "cardio" : "lift",
      sets: Math.max(1, Math.min(Math.round(Number(e.sets) || 3), 12)),
      reps: bounded(e.reps, 200) === null ? null : Math.round(bounded(e.reps, 200) as number),
      weight: bounded(e.weight, 2000),
      seconds: bounded(e.seconds, 3600) === null ? null : Math.round(bounded(e.seconds, 3600) as number),
      minutes: bounded(e.minutes, 600) === null ? null : Math.round(bounded(e.minutes, 600) as number),
    });
  }
  return {
    name: typeof obj.name === "string" && obj.name.trim() ? obj.name.trim().slice(0, 60) : null,
    exercises,
    confidence:
      typeof obj.confidence === "number" ? Math.max(0, Math.min(1, obj.confidence)) : 0.5,
  };
};

export const interpretPlan = async (transcript: string, units: string): Promise<DictatedPlan> => {
  const { data, error } = await supabase.functions.invoke("voice-log", {
    body: { transcript, units, mode: "plan", exercises: [] },
  });
  if (error) throw error;
  return sanitizePlan(data);
};
