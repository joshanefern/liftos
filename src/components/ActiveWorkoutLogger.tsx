import { DailySummaryCard } from "@/components/SummaryCards";
import { GoldButton } from "@/components/GoldButton";
import { WorkoutExercise, WorkoutTemplate, dailySummary } from "@/data/liftosMock";
import { Check, Clock3, Dumbbell, Plus, Timer, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

const ACTIVE_WORKOUT_STORAGE_KEY = "liftos_active_workout_session";

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

  const updateExerciseComplete = (exerciseId: string, completed: boolean) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) => ({ ...set, completed })),
            }
          : exercise,
      ),
    );
  };

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

  if (finished) {
    return (
      <div className="relative min-h-screen max-w-6xl p-6 md:p-10 lg:p-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(184,147,66,0.07),transparent_60%)]" />
        <div className="relative mb-8 animate-reveal-up">
          <p className="label-xs mb-2">Workout Complete</p>
          <h1 className="heading-lg">Strong session logged</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/50">
            Your mocked session summary is ready. In the real product this would persist after the backend is connected.
          </p>
        </div>

        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
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
          <div className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6">
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
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
                <div key={label} className="flex items-center justify-between rounded-[1rem] bg-white/[0.03] p-3 text-sm">
                  <span className="text-foreground/30">{label}</span>
                  <span className="font-semibold mono">{value}</span>
                </div>
              ))}
            </div>
            <GoldButton
              to="/dashboard"
              onClick={() => window.localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY)}
              fullWidth
              className="mt-5"
            >
              View dashboard
            </GoldButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen max-w-7xl p-6 md:p-10 lg:p-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(184,147,66,0.07),transparent_60%)]" />
      <div className="relative mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between animate-reveal-up">
        <div>
          <p className="label-xs mb-2">Active Workout</p>
          <h1 className="heading-lg">{template.name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/50">
            Fast logging with editable sets, completion state, exercise notes, and a practical rest timer surface.
          </p>
        </div>
        <GoldButton onClick={() => setFinished(true)}>
          <Check size={16} />
          Finish workout
        </GoldButton>
      </div>

      <div className="relative grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          {exercises.map((exercise, exerciseIndex) => (
            <article
              key={exercise.id}
              className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-4 md:p-5 animate-reveal-up"
              style={{ animationDelay: `${exerciseIndex * 60 + 100}ms` }}
            >
              <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <Dumbbell className="h-4 w-4 shrink-0 translate-x-[0.5px] translate-y-[0.5px] text-gold" strokeWidth={1.9} />
                    <span className="text-xs text-foreground/30">{exercise.category}</span>
                  </div>
                  <h2 className="text-base font-semibold">{exercise.name}</h2>
                  <p className="mt-1 text-xs text-foreground/30">{exercise.target}</p>
                </div>
                <div className="flex flex-col items-start gap-3 sm:items-end">
                  {exercise.notes && <p className="max-w-sm text-xs leading-relaxed text-foreground/50">{exercise.notes}</p>}
                  <button
                    type="button"
                    onClick={() => updateExerciseComplete(exercise.id, !exercise.sets.every((set) => set.completed))}
                    className={`inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-gold/40 ${
                      exercise.sets.every((set) => set.completed)
                        ? "border border-gold/50 bg-gold/10 text-gold"
                        : "border border-white/8 text-foreground/50 hover:border-gold/30 hover:text-foreground"
                    }`}
                  >
                    <Check size={14} />
                    {exercise.sets.every((set) => set.completed) ? "Completed" : "Done"}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-[44px_1fr_1fr] gap-2 px-2 text-[11px] uppercase tracking-widest text-foreground/30">
                  <span>Set</span>
                  <span>Reps</span>
                  <span>Weight</span>
                </div>
                {exercise.sets.map((set, setIndex) => (
                  <div key={set.id} className="grid grid-cols-[44px_1fr_1fr] items-center gap-2">
                    <span className="text-sm text-foreground/30">{setIndex + 1}</span>
                    <input
                      type="number"
                      value={set.reps}
                      onChange={(event) => updateSet(exercise.id, set.id, "reps", Number(event.target.value))}
                      className="h-11 rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 text-sm outline-none focus:border-gold/50"
                    />
                    <input
                      type="number"
                      value={set.weight}
                      onChange={(event) => updateSet(exercise.id, set.id, "weight", Number(event.target.value))}
                      className="h-11 rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 text-sm outline-none focus:border-gold/50"
                    />
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={() => addSet(exercise.id)}
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/8 px-3 py-2 text-xs text-foreground/50 transition hover:border-gold/30 hover:text-foreground"
              >
                <Plus size={14} />
                Add set
              </button>
            </article>
          ))}
        </section>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <div className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5">
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
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
                  <span className="text-foreground/30">{label}</span>
                  <span className="font-semibold mono">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5">
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-gold">
                <Timer size={16} />
                <span className="label-xs !text-gold">Rest timer</span>
              </div>
              <span className="mono text-lg font-semibold">01:28</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.03]">
              <div className="h-full w-[58%] rounded-full bg-[linear-gradient(90deg,rgba(215,181,99,1),rgba(184,147,66,1))]" />
            </div>
            <p className="mt-3 text-xs text-foreground/30">Suggested rest: 2:30 after heavy pressing sets.</p>
          </div>

          <label className="block rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5">
            <span className="label-xs mb-3 block">Session notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={6}
              className="w-full resize-none rounded-[1rem] border border-white/8 bg-white/[0.03] p-3 text-sm outline-none focus:border-gold/50"
            />
          </label>
        </aside>
      </div>
    </div>
  );
};

export default ActiveWorkoutLogger;
