import { GoldButton } from "@/components/GoldButton";
import type { WorkoutExercise } from "@/data/liftosMock";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import type { ActiveSession } from "@/pages/ActiveWorkout";
import { toast } from "@/components/ui/use-toast";
import { Check, CheckCircle2, Clock3, Dumbbell, Plus, Sparkles, Timer, Trophy } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const ACTIVE_WORKOUT_STORAGE_KEY = "liftos_active_workout_session";

const cloneExercises = (exercises: WorkoutExercise[]) =>
  exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => ({ ...set, completed: false })),
  }));

const formatTime = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};

const ActiveWorkoutLogger = ({ session }: { session: ActiveSession }) => {
  const navigate = useNavigate();
  const { save } = useWorkoutLogs();
  const [exercises, setExercises] = useState(() => cloneExercises(session.exercises));
  const [notes, setNotes] = useState("");
  const [finished, setFinished] = useState(false);
  const [saving, setSaving] = useState(false);
  const startedAt = useRef(new Date(session.startedAt));

  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - startedAt.current.getTime()) / 1000),
  );

  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [finished]);

  const stats = useMemo(() => {
    const sets = exercises.flatMap((exercise) => exercise.sets);
    const completedSets = sets.filter((set) => set.completed);
    const volume = completedSets.reduce((sum, set) => sum + set.reps * set.weight, 0);
    return {
      exercises: exercises.length,
      completedSets: completedSets.length,
      totalSets: sets.length,
      volume,
    };
  }, [exercises]);

  const updateExerciseComplete = (exerciseId: string, completed: boolean) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? { ...exercise, sets: exercise.sets.map((set) => ({ ...set, completed })) }
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
                  completed: false,
                },
              ],
            }
          : exercise,
      ),
    );
  };

  const handleFinish = async () => {
    if (saving) return;
    setSaving(true);
    const durationMinutes = Math.max(1, Math.round(elapsed / 60));
    try {
      await save({
        template_id: session.templateId ?? null,
        name: session.name,
        exercises,
        notes: notes.trim() || null,
        started_at: startedAt.current.toISOString(),
        finished_at: new Date().toISOString(),
        duration_minutes: durationMinutes,
        total_sets: stats.totalSets,
        completed_sets: stats.completedSets,
        total_volume: stats.volume,
      });
      setFinished(true);
    } catch {
      toast({ title: "Could not save workout", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (finished) {
    const durationMin = Math.max(1, Math.round(elapsed / 60));
    return (
      <div className="relative min-h-screen w-full max-w-6xl mx-auto p-6 md:p-10 lg:p-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(184,147,66,0.07),transparent_60%)]" />
        <div className="relative mb-8 animate-reveal-up">
          <p className="label-xs mb-2">Workout Complete</p>
          <h1 className="heading-lg">Strong session logged</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/50">
            Your workout has been saved. All your pages will now reflect this session.
          </p>
        </div>

        <div className="relative grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          {/* Summary card */}
          <section className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6">
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(125,211,252,0.18),transparent)]" />
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="label-xs mb-2">Daily Summary</p>
                <h2 className="heading-md">{session.name}</h2>
              </div>
              <CheckCircle2 size={20} className="text-sky-300" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Exercises", value: stats.exercises },
                { label: "Sets", value: stats.completedSets },
                { label: "Volume", value: `${stats.volume.toLocaleString()} lb` },
              ].map((item) => (
                <div key={item.label} className="rounded-[1rem] bg-white/[0.03] p-3">
                  <p className="text-sm font-semibold mono">{item.value}</p>
                  <p className="mt-1 text-[11px] text-foreground/30">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-[1rem] border border-sky-300/15 bg-sky-300/[0.04] p-4">
              <div className="mb-2 flex items-center gap-2 text-sky-300">
                <Sparkles size={14} />
                <span className="text-xs font-medium uppercase tracking-widest">Insight</span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/50">
                You moved {stats.volume.toLocaleString()} lb across {stats.completedSets} completed sets in {durationMin} minutes.
              </p>
              <p className="mt-3 text-sm leading-relaxed text-foreground/50">
                Consider targeting a different muscle group next session, or take a rest day if needed.
              </p>
            </div>
          </section>

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
                ["Duration", `${durationMin} min`],
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
    <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(184,147,66,0.07),transparent_60%)]" />
      <div className="relative mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between animate-reveal-up">
        <div>
          <p className="label-xs mb-2">Active Workout</p>
          <h1 className="heading-lg">{session.name}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/50">
            Log your sets and reps as you go. Tap Done on each exercise when finished.
          </p>
        </div>
        <GoldButton onClick={handleFinish} disabled={saving}>
          <Check size={16} />
          {saving ? "Saving…" : "Finish workout"}
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
                <div className="grid grid-cols-[44px_1fr_1fr_44px] gap-2 px-2 text-[11px] uppercase tracking-widest text-foreground/30">
                  <span>Set</span>
                  <span>Reps</span>
                  <span>Weight</span>
                  <span></span>
                </div>
                {exercise.sets.map((set, setIndex) => (
                  <div key={set.id} className="grid grid-cols-[44px_1fr_1fr_44px] items-center gap-2">
                    <span className={`text-sm ${set.completed ? "text-gold" : "text-foreground/30"}`}>{setIndex + 1}</span>
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
                    <button
                      type="button"
                      onClick={() => updateSet(exercise.id, set.id, "completed", !set.completed)}
                      className={`flex h-9 w-9 items-center justify-center rounded-[0.75rem] border transition ${
                        set.completed
                          ? "border-gold/50 bg-gold/10 text-gold"
                          : "border-white/8 text-foreground/20 hover:border-gold/30 hover:text-foreground"
                      }`}
                    >
                      <Check size={13} />
                    </button>
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
                ["Elapsed", formatTime(elapsed)],
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
                <span className="label-xs !text-gold">Progress</span>
              </div>
              <span className="mono text-lg font-semibold">
                {stats.totalSets > 0 ? Math.round((stats.completedSets / stats.totalSets) * 100) : 0}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.03]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,rgba(215,181,99,1),rgba(184,147,66,1))] transition-all duration-300"
                style={{ width: `${stats.totalSets > 0 ? (stats.completedSets / stats.totalSets) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-foreground/30">
              {stats.completedSets} of {stats.totalSets} sets completed
            </p>
          </div>

          <label className="block rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5">
            <span className="label-xs mb-3 block">Session notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="How did this session feel?"
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
