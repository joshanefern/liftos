import type { WorkoutExercise } from "@/data/liftosMock";
import type { StarterProgram } from "@/data/starterPrograms";

/* ── Session seeding — the one way a workout becomes the active session.
     Extracted from Workouts.tsx so the Dashboard's suggestion CTA starts
     sessions through the exact same path as the library's Start buttons. ── */

export const ACTIVE_WORKOUT_STORAGE_KEY = "liftos_active_workout_session";

/** Shape ActiveWorkout reads back from localStorage (see ActiveSession there). */
export type ActiveSessionSeed = {
  name: string;
  exercises: WorkoutExercise[];
  templateId?: string;
  startedAt: string;
};

export const buildSessionFromTemplate = (template: {
  id?: string;
  name: string;
  exercises: WorkoutExercise[];
}): ActiveSessionSeed => ({
  name: template.name,
  exercises: template.exercises,
  templateId: template.id,
  startedAt: new Date().toISOString(),
});

// Starter programs are curated app data, not Supabase template rows — start
// them without a templateId so the finished log never points at a template
// id that doesn't exist. This also strips split/focus/description fields.
export const buildSessionFromStarter = (program: StarterProgram): ActiveSessionSeed =>
  buildSessionFromTemplate({ name: program.name, exercises: program.exercises });

export const persistActiveSession = (session: ActiveSessionSeed): void => {
  window.localStorage.setItem(
    ACTIVE_WORKOUT_STORAGE_KEY,
    // JSON.stringify drops an undefined templateId, so id-less starts stay clean.
    JSON.stringify(session),
  );
};
