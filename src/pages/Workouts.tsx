import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CTAButton } from "@/components/GoldButton";
import { PendingReviewsCard } from "@/components/review/PendingReviewsCard";
import type { WorkoutExercise } from "@/data/liftosMock";
import { starterPrograms, type StarterProgram } from "@/data/starterPrograms";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import {
  ACTIVE_WORKOUT_STORAGE_KEY,
  buildSessionFromStarter,
  buildSessionFromTemplate,
  persistActiveSession,
} from "@/lib/startSession";
import { toast } from "@/components/ui/use-toast";
import { useReadiness } from "@/hooks/useReadiness";
import { trimSessionForRecovery } from "@/lib/recovery";
import { Check, ChevronDown, ChevronsRight, Dumbbell, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

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
  // Targets are opt-in: blank reps/weight = decide while training, so the
  // fastest path is name → Save.
  reps: "",
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
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/45 px-4 text-sm font-semibold text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        Start
      </button>
    </div>
  </div>
);

const Workouts = () => {
  const navigate = useNavigate();
  const { templates, loading, save, remove } = useWorkoutTemplates();
  const readiness = useReadiness();
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
    // One empty row ready to type into — no "add your first exercise" detour.
    setExercises([createExerciseDraft()]);
    setBuilderOpen(true);
  };

  // The + tab (and sidebar "New workout") land here as /workouts?new=1 —
  // open the builder and strip the param so back/refresh don't re-open it.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      openBuilder();
      setSearchParams({}, { replace: true });
    }
     
  }, [searchParams, setSearchParams]);

  // A session in progress — the way back in now that logging lives under
  // Workouts. Read per render: navigation re-mounts this page, and finishing
  // or discarding a session clears the key before returning here.
  const activeSeed = useMemo(() => {
    try {
      const raw = window.localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as { name?: string };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-check on every route entry
  }, [searchParams]);

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

  // The run-down trim applies on EVERY start path — the readiness sentence
  // and the coach both promise it unconditionally, so a library start must
  // behave exactly like the dashboard CTA.
  const persistWithRecovery = (session: ReturnType<typeof buildSessionFromTemplate>) => {
    persistActiveSession(
      readiness?.state === "run_down" ? trimSessionForRecovery(session) : session,
    );
  };

  const startWorkout = (template: { id?: string; name: string; exercises: WorkoutExercise[] }) => {
    persistWithRecovery(buildSessionFromTemplate(template));
    navigate("/workouts/active");
  };

  // Starter programs start without a templateId — see buildSessionFromStarter.
  const startProgram = (program: StarterProgram) => {
    persistWithRecovery(buildSessionFromStarter(program));
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
      // Blank targets = decide during the session. No toggle, no ceremony.
      const decideLater = exercise.reps.trim() === "" && exercise.weight.trim() === "";
      const targetSets = toInteger(exercise.sets, 3);
      const targetReps = toInteger(exercise.reps, 0);
      const targetWeight = toDecimal(exercise.weight);

      return {
        id: exercise.id,
        name: exercise.name.trim(),
        category: workoutName.trim(),
        target: decideLater
          ? ""
          : `${targetSets} × ${targetReps}${targetWeight > 0 ? ` @ ${targetWeight}` : ""}`,
        sets: Array.from({ length: decideLater ? toInteger(exercise.sets, 1) : targetSets }, (_, index) => ({
          id: `${exercise.id}-set-${index + 1}`,
          reps: decideLater ? 0 : targetReps,
          weight: decideLater ? 0 : targetWeight,
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

      {/* A running session always has a visible way back in */}
      {activeSeed && (
        <Link
          to="/workouts/active"
          className="mb-6 flex min-h-[52px] items-center justify-between gap-4 rounded-[13px] border border-primary/40 bg-primary/10 px-4 py-3.5 animate-reveal-up transition-transform duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span className="flex items-center gap-2.5 text-sm font-semibold text-fg">
            <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Resume session{activeSeed.name ? ` · ${activeSeed.name}` : ""}
          </span>
          <ChevronsRight size={16} className="shrink-0 text-primary" />
        </Link>
      )}

      {/* The tab badge counts pending reviews — they must live where the
          badge points. */}
      <PendingReviewsCard className="mb-8 animate-reveal-up" />

      {/* ── One supporting line (empty state only) + the single CTA ── */}
      <div className="mb-10 animate-reveal-up">
        {!loading && templates.length === 0 && (
          <p className="body-sm mb-4 max-w-md">
            No saved workouts yet — build your own or run a starter session below.
          </p>
        )}
        <CTAButton onClick={openBuilder} variant="accent">
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
            <p className="eyebrow !text-primary">Your workouts</p>
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
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/45 px-4 text-sm font-semibold text-primary transition hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/40"
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
                <p className="eyebrow !text-primary">Starter programs</p>
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
            <p className="eyebrow !text-primary">Starter programs</p>
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

      {/* ── Builder — a name, exercise rows, one button. Blank targets mean
          "decide while training"; nothing here needs explaining. ── */}
      <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
        <DialogContent className="grid h-[min(85dvh,680px)] max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[560px] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[18px] border border-border bg-background p-0 sm:w-[calc(100vw-2rem)]">
          <div className="px-5 pb-1 pt-6 md:px-6">
            <DialogHeader className="pr-9">
              <DialogTitle className="text-lg">
                {editingWorkoutId ? "Edit workout" : "New workout"}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Name the workout and list its exercises. Leave reps and weight
                blank to decide while training.
              </DialogDescription>
            </DialogHeader>
            <input
              autoFocus
              value={workoutName}
              onChange={(event) => setWorkoutName(event.target.value)}
              placeholder="Workout name — Push Day, Legs…"
              aria-label="Workout name"
              className="mt-3 h-12 w-full rounded-lg border border-border bg-card px-3 text-[15px] font-medium text-fg outline-none transition placeholder:font-normal focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 md:px-6">
            <div className="space-y-4">
              {exercises.map((exercise, index) => (
                <div key={exercise.id} className="rule-hairline pt-3 first:border-t-0 first:pt-0">
                  <div className="flex items-center gap-2">
                    <input
                      value={exercise.name}
                      onChange={(event) => updateExercise(exercise.id, "name", event.target.value)}
                      placeholder={index === 0 ? "Exercise — Bench Press, Squat…" : "Exercise"}
                      aria-label={`Exercise ${index + 1} name`}
                      className="h-11 w-full min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm font-medium text-fg outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    />
                    {exercises.length > 1 && (
                      <button
                        type="button"
                        aria-label="Remove exercise"
                        onClick={() => setExercises((current) => current.filter((item) => item.id !== exercise.id))}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.875rem] text-fg-muted transition hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {(
                      [
                        ["sets", "Sets", "3", "numeric", integerInput],
                        ["reps", "Reps", "—", "numeric", integerInput],
                        ["weight", "Weight", "—", "decimal", decimalInput],
                      ] as const
                    ).map(([key, label, hint, mode, sanitize]) => (
                      <label key={key} className="block min-w-0">
                        <span className="mb-1 block text-[10px] uppercase tracking-widest text-fg-muted">
                          {label}
                        </span>
                        <input
                          type="text"
                          inputMode={mode}
                          value={exercise[key]}
                          placeholder={hint}
                          onChange={(event) => updateExercise(exercise.id, key, sanitize(event.target.value))}
                          className="h-11 w-full rounded-lg border border-border bg-card px-3 text-center text-sm tabular-nums text-fg outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={addExercise}
                className="flex min-h-11 w-full items-center gap-2 rule-hairline pt-3 text-sm font-medium text-fg-muted transition hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <Plus size={15} />
                Add exercise
              </button>
              <p className="caption !text-fg-faint">
                Leave reps and weight blank to decide while training.
              </p>
            </div>
          </div>

          <div className="border-t border-border px-5 py-4 md:px-6">
            <CTAButton onClick={saveWorkout} disabled={!canSave || saving} fullWidth>
              <Check size={15} />
              {saving ? "Saving…" : "Save workout"}
            </CTAButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Workouts;
