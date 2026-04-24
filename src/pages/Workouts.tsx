import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkoutTemplate } from "@/data/liftosMock";
import { Check, Dumbbell, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ExerciseDraft = {
  id: string;
  name: string;
  sets: string;
  reps: string;
  weight: string;
  decideLater: boolean;
};

const createExerciseDraft = (overrides?: Partial<ExerciseDraft>): ExerciseDraft => ({
  id: `exercise-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: "",
  sets: "3",
  reps: "10",
  weight: "",
  decideLater: false,
  ...overrides,
});

const integerInput = (value: string) => value.replace(/\D/g, "");

const decimalInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [whole, ...decimals] = cleaned.split(".");

  return decimals.length > 0 ? `${whole}.${decimals.join("")}` : whole;
};

const toInteger = (value: string, fallback: number) => Number.parseInt(value, 10) || fallback;

const toDecimal = (value: string) => Number.parseFloat(value) || 0;

const createExerciseDraftFromTemplate = (exercise: WorkoutTemplate["exercises"][number]): ExerciseDraft => {
  const sets = exercise.sets.length;
  const reps = exercise.sets[0]?.reps ?? 0;
  const weight = exercise.sets[0]?.weight ?? 0;
  const decideLater = sets === 1 && reps === 0 && weight === 0;

  return createExerciseDraft({
    id: exercise.id,
    name: exercise.name,
    sets: decideLater ? "3" : String(sets),
    reps: decideLater ? "" : String(reps),
    weight: decideLater || weight === 0 ? "" : String(weight),
    decideLater,
  });
};

const Workouts = () => {
  const [builderOpen, setBuilderOpen] = useState(false);
  const [savedWorkouts, setSavedWorkouts] = useState<WorkoutTemplate[]>([]);
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [workoutName, setWorkoutName] = useState("");
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);

  const completedExercises = useMemo(
    () => exercises.filter((exercise) => exercise.name.trim()),
    [exercises],
  );
  const plannedSets = useMemo(
    () => exercises.reduce((sum, exercise) => sum + (exercise.decideLater ? 0 : toInteger(exercise.sets, 0)), 0),
    [exercises],
  );
  const plannedVolume = useMemo(
    () =>
      exercises.reduce((sum, exercise) => {
        if (exercise.decideLater) return sum;

        return sum + toInteger(exercise.sets, 0) * toInteger(exercise.reps, 0) * toDecimal(exercise.weight);
      }, 0),
    [exercises],
  );
  const canSave = workoutName.trim().length > 0 && completedExercises.length > 0;

  useEffect(() => {
    if (!builderOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [builderOpen]);

  const openBuilder = () => {
    setEditingWorkoutId(null);
    setWorkoutName("");
    setExercises([]);
    setBuilderOpen(true);
  };

  const editWorkout = (workout: WorkoutTemplate) => {
    setEditingWorkoutId(workout.id);
    setWorkoutName(workout.name);
    setExercises(workout.exercises.map(createExerciseDraftFromTemplate));
    setBuilderOpen(true);
  };

  const removeWorkout = (workoutId: string) => {
    setSavedWorkouts((current) => current.filter((workout) => workout.id !== workoutId));
  };

  const addExercise = () => {
    setExercises((current) => [...current, createExerciseDraft()]);
  };

  const updateExercise = <K extends keyof ExerciseDraft>(id: string, key: K, value: ExerciseDraft[K]) => {
    setExercises((current) =>
      current.map((exercise) => (exercise.id === id ? { ...exercise, [key]: value } : exercise)),
    );
  };

  const saveWorkout = () => {
    if (!canSave) return;

    const nextWorkout: WorkoutTemplate = {
      id: editingWorkoutId ?? `custom-${Date.now()}`,
      name: workoutName.trim(),
      split: "Custom",
      focus: "Custom workout created from the workout builder.",
      duration: 45,
      difficulty: "Moderate",
      exercises: completedExercises.map((exercise) => {
        const targetSets = toInteger(exercise.sets, 1);
        const targetReps = toInteger(exercise.reps, 0);
        const targetWeight = toDecimal(exercise.weight);

        return {
          id: exercise.id,
          name: exercise.name.trim(),
          category: "Custom",
          target: exercise.decideLater
            ? "Decide sets, reps, and weight while logging"
            : `${targetSets} sets x ${targetReps} reps at ${targetWeight || "bodyweight/TBD"} lb`,
          sets: Array.from({ length: exercise.decideLater ? 1 : targetSets }, (_, index) => ({
            id: `${exercise.id}-set-${index + 1}`,
            reps: exercise.decideLater ? 0 : targetReps,
            weight: exercise.decideLater ? 0 : targetWeight,
          })),
        };
      }),
    };

    window.localStorage.setItem("liftos_active_workout_template", JSON.stringify(nextWorkout));
    setSavedWorkouts((current) => {
      if (!editingWorkoutId) return [nextWorkout, ...current];

      return current.map((workout) => (workout.id === editingWorkoutId ? nextWorkout : workout));
    });
    setEditingWorkoutId(null);
    setBuilderOpen(false);
  };

  return (
    <div className="min-h-screen max-w-7xl p-6 md:p-10 lg:p-12">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between animate-reveal-up">
        <div>
          <p className="label-xs mb-2">Workout Library</p>
          <h1 className="heading-lg">Routines and templates</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
            Manage reusable splits, refine exercise structure, and jump straight into a low-friction logging flow.
          </p>
        </div>
        <button
          type="button"
          onClick={openBuilder}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-semibold text-background transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-gold/60"
        >
          <Dumbbell size={17} />
          New workout
        </button>
      </div>

      {savedWorkouts.length > 0 ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 animate-reveal-up">
          {savedWorkouts.map((workout) => {
            const totalSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
            return (
              <article key={workout.id} className="rounded-xl surface-2 border border-border/20 p-5">
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-base font-semibold">{workout.name}</p>
                    <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">Custom workout</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Edit ${workout.name}`}
                      onClick={() => editWorkout(workout)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/20 bg-background/30 text-[hsl(var(--text-secondary))] transition hover:border-gold hover:text-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${workout.name}`}
                      onClick={() => removeWorkout(workout.id)}
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/20 bg-background/30 text-[hsl(var(--text-secondary))] transition hover:border-destructive/40 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-[hsl(var(--text-secondary))]">
                  {workout.exercises.length} exercise{workout.exercises.length === 1 ? "" : "s"} <span>&bull;</span>{" "}
                  {totalSets} total sets
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {workout.exercises.slice(0, 3).map((exercise) => (
                    <span key={exercise.id} className="rounded-md surface-3 px-2.5 py-1 text-xs text-[hsl(var(--text-secondary))]">
                      {exercise.name}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="relative min-h-[340px] overflow-hidden py-12 animate-reveal-up">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Layers size={180} className="text-[hsl(var(--text-tertiary))]/[0.06]" strokeWidth={1} />
          </div>
          <div className="relative flex min-h-[340px] flex-col items-center justify-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border/20 bg-background/30">
              <Dumbbell size={20} className="text-gold" />
            </div>
            <h2 className="mt-5 text-lg font-semibold">No workouts yet</h2>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
              Create your first routine to start building reusable templates.
            </p>
          </div>
        </section>
      )}

      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="grid h-[min(88dvh,780px)] max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[780px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-xl border-border/30 bg-[hsl(var(--surface-2))] p-0 shadow-2xl sm:w-[calc(100vw-2rem)]">
          <div className="border-b border-border/20 bg-[linear-gradient(135deg,hsl(var(--surface-3))_0%,hsl(var(--surface-2))_48%,hsl(var(--background))_100%)] px-5 py-5 md:px-6">
            <DialogHeader className="pr-9">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10">
                  <Dumbbell size={19} className="text-gold" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg md:text-xl">{editingWorkoutId ? "Edit Workout" : "Create Workout"}</DialogTitle>
                  <DialogDescription className="mt-2 max-w-xl text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
                    {editingWorkoutId
                      ? "Update the workout details, revise exercises, or remove anything you no longer want in the template."
                      : "Add the workout details and exercises you want to track. Leave targets flexible when you want to decide during the session."}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="mt-5 grid grid-cols-3 gap-2 pr-9 sm:max-w-md">
              {[
                ["Exercises", exercises.length],
                ["Sets", plannedSets],
                ["Volume", `${plannedVolume.toLocaleString()} lb`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border/20 bg-background/35 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-widest text-[hsl(var(--text-tertiary))]">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-background/20 px-5 py-5 md:px-6">
            <div className="space-y-6">
              <section>
                <div>
                  <p className="label-xs mb-2">Workout Info</p>
                  <h3 className="text-sm font-semibold">Name your routine</h3>
                </div>
                <label className="mt-4 block min-w-0">
                  <span className="mb-2 block text-xs text-[hsl(var(--text-tertiary))]">Workout name</span>
                  <input
                    value={workoutName}
                    onChange={(event) => setWorkoutName(event.target.value)}
                    placeholder="Arm Day, Leg Day, Push A..."
                    className="h-12 w-full rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20"
                  />
                </label>
              </section>

              <section className="space-y-3 border-t border-border/20 pt-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="label-xs mb-2">Exercises</p>
                    <h3 className="text-sm font-semibold">Build the workout</h3>
                  </div>
                  <span className="rounded-md border border-border/20 bg-background/35 px-2.5 py-1 text-xs text-[hsl(var(--text-secondary))]">
                    {exercises.length} added
                  </span>
                </div>

                <div className="space-y-3">
                  {exercises.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/40 bg-background/35 p-6 text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-border/20 bg-[hsl(var(--surface-3))]">
                        <Dumbbell size={18} className="text-gold" />
                      </div>
                      <p className="text-sm font-semibold">No exercises added yet.</p>
                      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
                        Use the Add exercise button below to start building this workout.
                      </p>
                    </div>
                  ) : (
                    <>
                      {exercises.map((exercise, index) => (
                        <article key={exercise.id} className="rounded-xl border border-border/20 bg-background/45 p-4 shadow-sm">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/20 bg-[hsl(var(--surface-3))] text-xs font-semibold text-gold">
                                {index + 1}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">Exercise {index + 1}</p>
                                <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--text-tertiary))]">
                                  Leave targets blank or decide during the session.
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              aria-label="Remove exercise"
                              onClick={() => setExercises((current) => current.filter((item) => item.id !== exercise.id))}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[hsl(var(--text-tertiary))] transition hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>

                          <div className="grid gap-4">
                            <label className="block min-w-0">
                              <span className="mb-2 block text-xs text-[hsl(var(--text-tertiary))]">Exercise name</span>
                              <input
                                value={exercise.name}
                                onChange={(event) => updateExercise(exercise.id, "name", event.target.value)}
                                placeholder="Bench press, leg press, hammer curl..."
                                className="h-11 w-full rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20"
                              />
                            </label>

                            <div className="grid gap-3 sm:grid-cols-3">
                              <label className="block min-w-0">
                                <span className="mb-2 block text-xs text-[hsl(var(--text-tertiary))]">Sets</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={exercise.sets}
                                  disabled={exercise.decideLater}
                                  onChange={(event) => updateExercise(exercise.id, "sets", integerInput(event.target.value))}
                                  className="h-11 w-full rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
                                />
                              </label>
                              <label className="block min-w-0">
                                <span className="mb-2 block text-xs text-[hsl(var(--text-tertiary))]">Reps</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={exercise.reps}
                                  disabled={exercise.decideLater}
                                  onChange={(event) => updateExercise(exercise.id, "reps", integerInput(event.target.value))}
                                  className="h-11 w-full rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
                                />
                              </label>
                              <label className="block min-w-0">
                                <span className="mb-2 block text-xs text-[hsl(var(--text-tertiary))]">Weight</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={exercise.weight}
                                  disabled={exercise.decideLater}
                                  onChange={(event) => updateExercise(exercise.id, "weight", decimalInput(event.target.value))}
                                  className="h-11 w-full rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none transition focus:border-gold focus:ring-2 focus:ring-gold/20 disabled:cursor-not-allowed disabled:opacity-40"
                                />
                              </label>
                            </div>

                            <button
                              type="button"
                              onClick={() => updateExercise(exercise.id, "decideLater", !exercise.decideLater)}
                              className={`inline-flex w-full items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold/40 sm:w-fit ${
                                exercise.decideLater
                                  ? "border-gold bg-gold text-background"
                                  : "border-border/20 text-[hsl(var(--text-secondary))] hover:border-gold hover:text-foreground"
                              }`}
                            >
                              Decide later
                            </button>
                          </div>
                        </article>
                      ))}
                    </>
                  )}
                </div>
              </section>
            </div>
          </div>

          <div className="border-t border-border/20 bg-[hsl(var(--surface-2))] px-5 py-4 md:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={addExercise}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gold/35 bg-gold/10 px-4 py-3 text-sm font-semibold text-gold transition hover:bg-gold hover:text-background focus:outline-none focus:ring-2 focus:ring-gold/50"
              >
                <Plus size={16} />
                Add exercise
              </button>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setBuilderOpen(false);
                    setEditingWorkoutId(null);
                  }}
                  className="inline-flex items-center justify-center rounded-lg border border-border/20 px-4 py-3 text-sm text-[hsl(var(--text-secondary))] transition hover:border-gold hover:text-foreground focus:outline-none focus:ring-2 focus:ring-gold/40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveWorkout}
                  disabled={!canSave}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-semibold text-background transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-gold/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Check size={16} />
                  {editingWorkoutId ? "Save changes" : "Done"}
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Workouts;
