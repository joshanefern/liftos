import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CTAButton } from "@/components/GoldButton";
import type { WorkoutExercise } from "@/data/liftosMock";
import { starterPrograms, type StarterProgram } from "@/data/starterPrograms";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import {
  buildSessionFromStarter,
  buildSessionFromTemplate,
  persistActiveSession,
} from "@/lib/startSession";
import { toast } from "@/components/ui/use-toast";
import { Check, ChevronDown, Dumbbell, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

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

const createExerciseDraftFromTemplate = (exercise: WorkoutExercise): ExerciseDraft => {
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

type StarterProgramRowProps = {
  program: StarterProgram;
  saved: boolean;
  saving: boolean;
  saveDisabled: boolean;
  onSave: () => void;
  onStart: () => void;
};

/* One hairline index row per starter program — label left, quiet actions right. */
const StarterProgramRow = ({ program, saved, saving, saveDisabled, onSave, onStart }: StarterProgramRowProps) => (
  <div className="flex items-center justify-between gap-3 border-b border-border py-3">
    <div className="w-0 flex-1">
      <p className="truncate text-sm font-semibold text-fg">{program.name}</p>
      <p className="caption truncate">
        {program.split} · {program.duration} min · {program.difficulty}
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onSave}
        disabled={saveDisabled}
        className="inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-xs font-medium text-fg-muted transition hover:bg-secondary hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-default disabled:opacity-60"
      >
        {saved ? (
          <>
            <Check size={12} />
            Saved
          </>
        ) : saving ? (
          "Saving…"
        ) : (
          <>
            <Plus size={12} />
            Save
          </>
        )}
      </button>
      <button
        type="button"
        onClick={onStart}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-fg transition hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring/40"
      >
        Start
      </button>
    </div>
  </div>
);

const Workouts = () => {
  const navigate = useNavigate();
  const { templates, loading, save, remove } = useWorkoutTemplates();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [workoutName, setWorkoutName] = useState("");
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);
  const [starterOpen, setStarterOpen] = useState(false);
  const [savingProgramId, setSavingProgramId] = useState<string | null>(null);
  const [savedProgramIds, setSavedProgramIds] = useState<Set<string>>(new Set());

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
    return () => { document.body.style.overflow = previousOverflow; };
  }, [builderOpen]);

  const openBuilder = () => {
    setEditingWorkoutId(null);
    setWorkoutName("");
    setExercises([]);
    setBuilderOpen(true);
  };

  const editWorkout = (template: { id: string; name: string; exercises: WorkoutExercise[] }) => {
    setEditingWorkoutId(template.id);
    setWorkoutName(template.name);
    setExercises(template.exercises.map(createExerciseDraftFromTemplate));
    setBuilderOpen(true);
  };

  const removeWorkout = async (id: string) => {
    try {
      await remove(id);
    } catch {
      toast({ title: "Could not delete workout", variant: "destructive" });
    }
  };

  const startWorkout = (template: { id?: string; name: string; exercises: WorkoutExercise[] }) => {
    persistActiveSession(buildSessionFromTemplate(template));
    navigate("/workouts/active");
  };

  // Starter programs start without a templateId — see buildSessionFromStarter.
  const startProgram = (program: StarterProgram) => {
    persistActiveSession(buildSessionFromStarter(program));
    navigate("/workouts/active");
  };

  const saveProgramAsTemplate = async (program: StarterProgram) => {
    if (savingProgramId !== null || savedProgramIds.has(program.id)) return;
    setSavingProgramId(program.id);
    try {
      await save({ id: null, name: program.name, exercises: program.exercises });
      setSavedProgramIds((current) => new Set(current).add(program.id));
      toast({ title: `Saved "${program.name}" to your workouts` });
    } catch {
      toast({ title: "Could not save program", variant: "destructive" });
    } finally {
      setSavingProgramId(null);
    }
  };

  const addExercise = () => {
    setExercises((current) => [...current, createExerciseDraft()]);
  };

  const updateExercise = <K extends keyof ExerciseDraft>(id: string, key: K, value: ExerciseDraft[K]) => {
    setExercises((current) =>
      current.map((exercise) => (exercise.id === id ? { ...exercise, [key]: value } : exercise)),
    );
  };

  const saveWorkout = async () => {
    if (!canSave || saving) return;
    setSaving(true);

    const exercisesToSave: WorkoutExercise[] = completedExercises.map((exercise) => {
      const targetSets = toInteger(exercise.sets, 1);
      const targetReps = toInteger(exercise.reps, 0);
      const targetWeight = toDecimal(exercise.weight);

      return {
        id: exercise.id,
        name: exercise.name.trim(),
        category: workoutName.trim(),
        target: exercise.decideLater
          ? "Decide sets, reps, and weight while logging"
          : `${targetSets} sets × ${targetReps} reps at ${targetWeight || "bodyweight/TBD"} lb`,
        sets: Array.from({ length: exercise.decideLater ? 1 : targetSets }, (_, index) => ({
          id: `${exercise.id}-set-${index + 1}`,
          reps: exercise.decideLater ? 0 : targetReps,
          weight: exercise.decideLater ? 0 : targetWeight,
        })),
      };
    });

    try {
      await save({ id: editingWorkoutId, name: workoutName.trim(), exercises: exercisesToSave });
      setEditingWorkoutId(null);
      setBuilderOpen(false);
    } catch {
      toast({ title: "Could not save workout", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
      {/* ── Eyebrow header — context left, quiet count right ── */}
      <header className="mb-8 flex items-baseline justify-between gap-4 animate-reveal-up">
        <h1 className="eyebrow">Workout Library</h1>
        {!loading && templates.length > 0 && (
          <p className="mono text-xs tabular-nums text-fg-muted">{templates.length} saved</p>
        )}
      </header>

      {/* ── One supporting line (empty state only) + the single CTA ── */}
      <div className="mb-10 animate-reveal-up">
        {!loading && templates.length === 0 && (
          <p className="body-sm mb-4 max-w-md">
            No saved workouts yet — build your own or run a starter session below.
          </p>
        )}
        <CTAButton onClick={openBuilder}>
          <Plus size={16} />
          New workout
        </CTAButton>
      </div>

      {loading ? (
        <section aria-hidden="true" className="border-t border-border animate-reveal-up">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 border-b border-border py-3">
              <div className="h-9 w-44 max-w-[60%] animate-pulse rounded-lg bg-card" />
              <div className="h-9 w-20 animate-pulse rounded-full bg-card" />
            </div>
          ))}
        </section>
      ) : templates.length > 0 ? (
        <>
        <section className="animate-reveal-up">
          <div className="rule-heavy pb-3 pt-4">
            <p className="eyebrow">Your workouts</p>
          </div>
          <div className="border-t border-border">
            {templates.map((template) => {
              const totalSets = template.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
              return (
                <div
                  key={template.id}
                  className="flex items-center justify-between gap-3 border-b border-border py-3"
                >
                  {/* Row tap opens the template's detail (edit) — data lives there */}
                  <button
                    type="button"
                    onClick={() => editWorkout(template)}
                    aria-label={`Edit ${template.name}`}
                    className="min-h-11 w-0 flex-1 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <p className="truncate text-sm font-semibold text-fg">{template.name}</p>
                    <p className="caption truncate">
                      {template.exercises.length} exercise{template.exercises.length === 1 ? "" : "s"} · {totalSets}{" "}
                      sets
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      aria-label={`Delete ${template.name}`}
                      onClick={() => removeWorkout(template.id)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-fg-muted transition hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => startWorkout(template)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm font-medium text-fg transition hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      Start
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Starter programs — compact rail once the user has their own templates */}
        <section className="mt-10 animate-reveal-up">
          <div className="rule-heavy">
            <button
              type="button"
              onClick={() => setStarterOpen((open) => !open)}
              aria-expanded={starterOpen}
              className="flex w-full items-center justify-between gap-4 py-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <div>
                <p className="eyebrow">Starter programs</p>
                <p className="caption mt-1">Curated sessions you can run today.</p>
              </div>
              <ChevronDown
                size={16}
                className={`shrink-0 text-fg-muted transition-transform ${starterOpen ? "rotate-180" : ""}`}
              />
            </button>
          </div>
          {starterOpen && (
            <div className="border-t border-border md:grid md:grid-cols-2 md:gap-x-10">
              {starterPrograms.map((program) => (
                <StarterProgramRow
                  key={program.id}
                  program={program}
                  saved={savedProgramIds.has(program.id)}
                  saving={savingProgramId === program.id}
                  saveDisabled={savingProgramId !== null || savedProgramIds.has(program.id)}
                  onSave={() => saveProgramAsTemplate(program)}
                  onStart={() => startProgram(program)}
                />
              ))}
            </div>
          )}
        </section>
        </>
      ) : (
        /* Starter programs — the screen's content while the library is empty */
        <section className="animate-reveal-up">
          <div className="rule-heavy pb-3 pt-4">
            <p className="eyebrow">Starter programs</p>
            <p className="caption mt-1">Curated sessions you can run today.</p>
          </div>
          <div className="border-t border-border md:grid md:grid-cols-2 md:gap-x-10">
            {starterPrograms.map((program) => (
              <StarterProgramRow
                key={program.id}
                program={program}
                saved={savedProgramIds.has(program.id)}
                saving={savingProgramId === program.id}
                saveDisabled={savingProgramId !== null || savedProgramIds.has(program.id)}
                onSave={() => saveProgramAsTemplate(program)}
                onStart={() => startProgram(program)}
              />
            ))}
          </div>
        </section>
      )}

      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="grid h-[min(88dvh,780px)] max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[780px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[14px] border border-border bg-background p-0 sm:w-[calc(100vw-2rem)]">
          <div className="border-b border-border px-5 pb-4 pt-6 md:px-6">
            <DialogHeader className="pr-9">
              <div className="flex items-start gap-3">
                <div className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-border bg-card sm:flex">
                  <Dumbbell className="h-[18px] w-[18px] translate-x-[0.5px] translate-y-[0.5px] text-primary" strokeWidth={1.9} />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg md:text-xl">{editingWorkoutId ? "Edit Workout" : "Create Workout"}</DialogTitle>
                  <DialogDescription className="mt-1.5 max-w-xl text-sm leading-relaxed text-fg-soft max-sm:line-clamp-2">
                    {editingWorkoutId
                      ? "Update the workout details, revise exercises, or remove anything you no longer want in the template."
                      : "Add the workout details and exercises you want to track. Leave targets flexible when you want to decide during the session."}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-md">
              {[
                ["Exercises", exercises.length],
                ["Sets", plannedSets],
                ["Volume", `${plannedVolume.toLocaleString()} lb`],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0 rounded-lg border border-border px-2.5 py-2">
                  <p className="truncate text-[10px] uppercase tracking-[0.12em] text-fg-muted">{label}</p>
                  <p className="stat-md mt-1 truncate">{value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-4 md:px-6">
            <div className="space-y-5">
              <section>
                <div>
                  <p className="eyebrow mb-1.5">Workout Info</p>
                  <h3 className="text-sm font-semibold text-fg">Name your routine</h3>
                </div>
                <label className="mt-3 block min-w-0">
                  <span className="mb-1.5 block text-xs text-fg-muted">Workout name</span>
                  <input
                    value={workoutName}
                    onChange={(event) => setWorkoutName(event.target.value)}
                    placeholder="Arm Day, Leg Day, Push A..."
                    className="h-12 w-full rounded-lg border border-border bg-card px-3 text-sm text-fg outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
                  />
                </label>
              </section>

              <section className="space-y-3 border-t border-border pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow mb-1.5">Exercises</p>
                    <h3 className="text-sm font-semibold text-fg">Build the workout</h3>
                  </div>
                  <span className="rounded-full border border-border px-2.5 py-1 text-xs text-fg-muted">
                    {exercises.length} added
                  </span>
                </div>

                <div className="space-y-3">
                  {exercises.length === 0 ? (
                    <div className="rounded-[14px] border border-dashed border-border p-6 text-center">
                      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[0.875rem] border border-border bg-card">
                        <Dumbbell className="h-4 w-4 translate-x-[0.5px] translate-y-[0.5px] text-primary" strokeWidth={1.9} />
                      </div>
                      <p className="text-sm font-semibold text-fg">No exercises added yet.</p>
                      <p className="body-md mx-auto mt-2 max-w-sm">
                        Use the Add exercise button below to start building this workout.
                      </p>
                    </div>
                  ) : (
                    <>
                      {exercises.map((exercise, index) => (
                        <article key={exercise.id} className="rounded-[14px] border border-border bg-card p-4">
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.75rem] border border-border text-xs font-semibold text-fg">
                                {index + 1}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-fg">Exercise {index + 1}</p>
                                <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                                  Leave targets blank or decide during the session.
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              aria-label="Remove exercise"
                              onClick={() => setExercises((current) => current.filter((item) => item.id !== exercise.id))}
                              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.875rem] text-fg-muted transition hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          <div className="grid gap-3">
                            <label className="block min-w-0">
                              <span className="mb-1.5 block text-xs text-fg-muted">Exercise name</span>
                              <input
                                value={exercise.name}
                                onChange={(event) => updateExercise(exercise.id, "name", event.target.value)}
                                placeholder="Bench press, leg press, hammer curl..."
                                className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-fg outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25"
                              />
                            </label>

                            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                              <label className="block min-w-0">
                                <span className="mb-1.5 block text-xs text-fg-muted">Sets</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={exercise.sets}
                                  disabled={exercise.decideLater}
                                  onChange={(event) => updateExercise(exercise.id, "sets", integerInput(event.target.value))}
                                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-fg outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-40"
                                />
                              </label>
                              <label className="block min-w-0">
                                <span className="mb-1.5 block text-xs text-fg-muted">Reps</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  value={exercise.reps}
                                  disabled={exercise.decideLater}
                                  onChange={(event) => updateExercise(exercise.id, "reps", integerInput(event.target.value))}
                                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-fg outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-40"
                                />
                              </label>
                              <label className="block min-w-0">
                                <span className="mb-1.5 block text-xs text-fg-muted">Weight</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={exercise.weight}
                                  disabled={exercise.decideLater}
                                  onChange={(event) => updateExercise(exercise.id, "weight", decimalInput(event.target.value))}
                                  className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-fg outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-40"
                                />
                              </label>
                            </div>

                            <button
                              type="button"
                              onClick={() => updateExercise(exercise.id, "decideLater", !exercise.decideLater)}
                              className={`inline-flex min-h-11 w-full items-center justify-center rounded-full border px-4 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-ring/40 sm:w-fit ${
                                exercise.decideLater
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border text-fg-muted hover:bg-secondary hover:text-fg"
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

          <div className="border-t border-border px-5 py-4 md:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={addExercise}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm font-medium text-fg transition hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring/40"
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
                  className="inline-flex items-center justify-center rounded-full border border-border px-4 py-3 text-sm text-fg-muted transition hover:bg-secondary hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring/40"
                >
                  Cancel
                </button>
                <CTAButton onClick={saveWorkout} disabled={!canSave || saving}>
                  <Check size={15} />
                  {saving ? "Saving…" : editingWorkoutId ? "Save changes" : "Done"}
                </CTAButton>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Workouts;
