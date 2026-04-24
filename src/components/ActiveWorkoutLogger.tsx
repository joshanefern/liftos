import { DailySummaryCard } from "@/components/SummaryCards";
import { WorkoutExercise, WorkoutTemplate, dailySummary } from "@/data/liftosMock";
import { Check, Clock3, Dumbbell, Plus, Timer, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

const cloneExercises = (exercises: WorkoutExercise[]) =>
  exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => ({ ...set })),
  }));

const ActiveWorkoutLogger = ({ template }: { template: WorkoutTemplate }) => {
  const [exercises, setExercises] = useState(() => cloneExercises(template.exercises));
  const [notes, setNotes] = useState("Bench felt stable. Keep elbows tucked on heavy reps.");
  const [finished, setFinished] = useState(false);

  const stats = useMemo(() => {
    const sets = exercises.flatMap((exercise) => exercise.sets);
    const completedSets = sets.filter((set) => set.completed);
    const volume = completedSets.reduce((sum, set) => sum + set.reps * set.weight, 0);
    return {
      exercises: exercises.length,
      completedSets: completedSets.length,
      totalSets: sets.length,
      volume,
      duration: 61,
    };
  }, [exercises]);

  const updateSet = (
    exerciseId: string,
    setId: string,
    field: "reps" | "weight" | "completed",
    value: number | boolean,
  ) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) => (set.id === setId ? { ...set, [field]: value } : set)),
            }
          : exercise,
      ),
    );
  };

  const addSet = (exerciseId: string) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: [
                ...exercise.sets,
                {
                  id: `set-${Date.now()}`,
                  reps: exercise.sets.at(-1)?.reps ?? 10,
                  weight: exercise.sets.at(-1)?.weight ?? 50,
                },
              ],
            }
          : exercise,
      ),
    );
  };

  const addExercise = () => {
    setExercises((current) => [
      ...current,
      {
        id: `exercise-${Date.now()}`,
        name: "Cable Triceps Pressdown",
        category: "Triceps",
        target: "Pump work",
        sets: [{ id: `set-${Date.now()}`, reps: 12, weight: 55 }],
      },
    ]);
  };

  if (finished) {
    return (
      <div className="min-h-screen max-w-6xl p-6 md:p-10 lg:p-12">
        <div className="mb-8 animate-reveal-up">
          <p className="label-xs mb-2">Workout Complete</p>
          <h1 className="heading-lg">Strong session logged</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
            Your mocked session summary is ready. In the real product this would persist after the backend is connected.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <DailySummaryCard
            summary={{
              ...dailySummary,
              workoutName: template.name,
              totalExercises: stats.exercises,
              totalSets: stats.completedSets,
              totalVolume: stats.volume,
              duration: stats.duration,
            }}
          />
          <div className="rounded-xl surface-2 border border-border/20 p-5 md:p-6">
            <div className="mb-5 flex items-center gap-3">
              <Trophy size={20} className="text-gold" />
              <h2 className="heading-md">Session totals</h2>
            </div>
            <div className="space-y-3">
              {[
                ["Exercises", stats.exercises],
                ["Completed sets", `${stats.completedSets}/${stats.totalSets}`],
                ["Volume", `${stats.volume.toLocaleString()} lb`],
                ["Duration", `${stats.duration} min`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-lg surface-3 p-3 text-sm">
                  <span className="text-[hsl(var(--text-tertiary))]">{label}</span>
                  <span className="font-semibold mono">{value}</span>
                </div>
              ))}
            </div>
            <Link
              to="/dashboard"
              className="mt-5 inline-flex w-full items-center justify-center rounded-lg bg-gold px-4 py-3 text-sm font-semibold text-background transition hover:brightness-110"
            >
              View dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen max-w-7xl p-6 md:p-10 lg:p-12">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between animate-reveal-up">
        <div>
          <p className="label-xs mb-2">Active Workout</p>
          <h1 className="heading-lg">{template.name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
            Fast logging with editable sets, completion state, exercise notes, and a practical rest timer surface.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFinished(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-semibold text-background transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-gold/60"
        >
          <Check size={17} />
          Finish workout
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          {exercises.map((exercise, exerciseIndex) => (
            <article
              key={exercise.id}
              className="rounded-xl surface-2 border border-border/20 p-4 md:p-5 animate-reveal-up"
              style={{ animationDelay: `${exerciseIndex * 60 + 100}ms` }}
            >
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Dumbbell size={16} className="text-gold" />
                    <span className="text-xs text-[hsl(var(--text-tertiary))]">{exercise.category}</span>
                  </div>
                  <h2 className="text-base font-semibold">{exercise.name}</h2>
                  <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">{exercise.target}</p>
                </div>
                {exercise.notes && <p className="max-w-sm text-xs leading-relaxed text-[hsl(var(--text-secondary))]">{exercise.notes}</p>}
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-[44px_1fr_1fr_76px] gap-2 px-2 text-[11px] uppercase tracking-widest text-[hsl(var(--text-tertiary))]">
                  <span>Set</span>
                  <span>Reps</span>
                  <span>Weight</span>
                  <span className="text-right">Done</span>
                </div>
                {exercise.sets.map((set, setIndex) => (
                  <div key={set.id} className="grid grid-cols-[44px_1fr_1fr_76px] items-center gap-2">
                    <span className="text-sm text-[hsl(var(--text-tertiary))]">{setIndex + 1}</span>
                    <input
                      type="number"
                      value={set.reps}
                      onChange={(event) => updateSet(exercise.id, set.id, "reps", Number(event.target.value))}
                      className="h-11 rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none focus:border-gold"
                    />
                    <input
                      type="number"
                      value={set.weight}
                      onChange={(event) => updateSet(exercise.id, set.id, "weight", Number(event.target.value))}
                      className="h-11 rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none focus:border-gold"
                    />
                    <button
                      type="button"
                      aria-label={`Mark set ${setIndex + 1} complete`}
                      onClick={() => updateSet(exercise.id, set.id, "completed", !set.completed)}
                      className={`ml-auto inline-flex h-11 w-11 items-center justify-center rounded-lg border transition ${
                        set.completed
                          ? "border-gold bg-gold text-background"
                          : "border-border/20 text-[hsl(var(--text-tertiary))] hover:border-gold hover:text-gold"
                      }`}
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addSet(exercise.id)}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-border/20 px-3 py-2 text-xs text-[hsl(var(--text-secondary))] transition hover:border-gold hover:text-foreground"
              >
                <Plus size={14} />
                Add set
              </button>
            </article>
          ))}

          <button
            type="button"
            onClick={addExercise}
            className="inline-flex items-center gap-2 rounded-lg border border-border/20 px-4 py-3 text-sm text-[hsl(var(--text-secondary))] transition hover:border-gold hover:text-foreground"
          >
            <Plus size={16} />
            Add exercise
          </button>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-xl surface-2 border border-border/20 p-5">
            <div className="mb-4 flex items-center gap-2 text-gold">
              <Clock3 size={16} />
              <span className="label-xs !text-gold">Live totals</span>
            </div>
            <div className="space-y-3">
              {[
                ["Completed", `${stats.completedSets}/${stats.totalSets} sets`],
                ["Volume", `${stats.volume.toLocaleString()} lb`],
                ["Elapsed", "42:18"],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-[hsl(var(--text-tertiary))]">{label}</span>
                  <span className="font-semibold mono">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl surface-2 border border-border/20 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-gold">
                <Timer size={16} />
                <span className="label-xs !text-gold">Rest timer</span>
              </div>
              <span className="mono text-lg font-semibold">01:28</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full surface-3">
              <div className="h-full w-[58%] rounded-full bg-gold" />
            </div>
            <p className="mt-3 text-xs text-[hsl(var(--text-tertiary))]">Suggested rest: 2:30 after heavy pressing sets.</p>
          </div>

          <label className="block rounded-xl surface-2 border border-border/20 p-5">
            <span className="label-xs mb-3 block">Session notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={6}
              className="w-full resize-none rounded-lg border border-border/20 surface-3 p-3 text-sm outline-none focus:border-gold"
            />
          </label>
        </aside>
      </div>
    </div>
  );
};

export default ActiveWorkoutLogger;
