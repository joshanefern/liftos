import { CTAButton } from "@/components/GoldButton";
import { LiveMuscleMap, colorForIntensity } from "@/components/logging/LiveMuscleMap";
import { RestTimerRing } from "@/components/logging/RestTimerRing";
import { SetInputRow, formatWeightForDisplay } from "@/components/logging/SetInputRow";
import { useEnterAdvance } from "@/components/logging/useEnterAdvance";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "@/components/ui/use-toast";
import { useUser } from "@/context/UserContext";
import type { WorkoutExercise } from "@/data/liftosMock";
import { useRestTimer } from "@/hooks/useRestTimer";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useWorkoutLogs, type WorkoutLog } from "@/hooks/useWorkoutLogs";
import { lookupMuscles, type Muscle } from "@/lib/muscleMap";
import { formatPlateMath, plateBreakdown } from "@/lib/plateMath";
import { suggestProgression, type ProgressionSuggestion } from "@/lib/progression";
import { detectSessionPRs, type PREvent } from "@/lib/prs";
import { isMetricUnits } from "@/lib/review/inputFormatters";
import { BAR_WEIGHT, generateWarmupSets, type WeightUnit } from "@/lib/warmup";
import type { ActiveSession } from "@/pages/ActiveWorkout";
import { cn } from "@/lib/utils";
import { Capacitor } from "@capacitor/core";
import {
  Check,
  ChevronDown,
  Dumbbell,
  Plus,
  SkipForward,
  Timer,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const ACTIVE_WORKOUT_STORAGE_KEY = "liftos_active_workout_session";
const REST_SECONDS = 120;

// ── Types ───────────────────────────────────────────────────────────────────

type LoggedSet = {
  id: string;
  /** User-entered value; "" renders the hint as a tap-to-fill placeholder. */
  reps: string;
  weight: string;
  completed: boolean;
  /** Prescription from the template (hint source, never mutated). */
  targetReps: number | null;
  targetWeight: number | null;
  /** Generated ramp set — excluded from totals, volume, PRs, and muscle heat. */
  isWarmup?: boolean;
};

type LoggedExercise = Omit<WorkoutExercise, "sets"> & { sets: LoggedSet[] };

type SessionSummary = {
  durationSeconds: number;
  volume: number;
  completedSets: number;
  totalSets: number;
  exercisesCount: number;
  prs: { name: string; weight: number; reps: number; isFirst: boolean }[];
  intensities: Partial<Record<Muscle, number>>;
  trainedCount: number;
};

// ── Helpers ─────────────────────────────────────────────────────────────────

const cloneExercises = (exercises: WorkoutExercise[]): LoggedExercise[] =>
  exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => ({
      id: set.id,
      reps: "",
      weight: "",
      completed: false,
      targetReps: set.reps ?? null,
      targetWeight: set.weight ?? null,
      ...(set.isWarmup ? { isWarmup: true } : {}),
    })),
  }));

const formatClock = (totalSeconds: number): string => {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

/** Session PRs vs saved history: heavier top weight, or first-ever log of a lift. */
const computePrs = (
  exercises: LoggedExercise[],
  history: WorkoutLog[],
): SessionSummary["prs"] => {
  const bestByName = new Map<string, number>();
  for (const log of history) {
    for (const exercise of log.exercises) {
      const key = exercise.name.trim().toLowerCase();
      for (const set of exercise.sets) {
        if (set.isWarmup || !set.completed || !set.weight || set.weight <= 0) continue;
        bestByName.set(key, Math.max(bestByName.get(key) ?? 0, set.weight));
      }
    }
  }

  const prs: SessionSummary["prs"] = [];
  for (const exercise of exercises) {
    let best: { weight: number; reps: number } | null = null;
    for (const set of exercise.sets) {
      if (set.isWarmup || !set.completed) continue;
      const weight = Number(set.weight) || 0;
      if (weight > 0 && (best === null || weight > best.weight)) {
        best = { weight, reps: Number(set.reps) || 0 };
      }
    }
    if (!best) continue;
    const prior = bestByName.get(exercise.name.trim().toLowerCase());
    if (prior === undefined) {
      prs.push({ name: exercise.name, ...best, isFirst: true });
    } else if (best.weight > prior) {
      prs.push({ name: exercise.name, ...best, isFirst: false });
    }
  }
  return prs.sort((a, b) => b.weight - a.weight);
};

// ── Component ───────────────────────────────────────────────────────────────

const ActiveWorkoutLogger = ({ session }: { session: ActiveSession }) => {
  const { save, logs } = useWorkoutLogs();
  const { profile } = useUser();
  const units = profile?.units ?? "lb";
  const isMetric = isMetricUnits(units);
  const weightUnit: WeightUnit = isMetric ? "kg" : "lb";

  const [exercises, setExercises] = useState<LoggedExercise[]>(() =>
    cloneExercises(session.exercises),
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [prCelebration, setPrCelebration] = useState<PREvent[] | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [musclePulseKey, setMusclePulseKey] = useState(0);
  // Plate math sheet: weight sticks around while the drawer animates closed.
  const [plateWeight, setPlateWeight] = useState<number | null>(null);
  const [plateOpen, setPlateOpen] = useState(false);
  // Discard confirmation — opened by the quiet header button, or by Finish
  // when nothing was completed (an empty log has no value to save).
  const [discardOpen, setDiscardOpen] = useState(false);
  const navigate = useNavigate();
  const startedAt = useRef(new Date(session.startedAt));

  // Screen stays on for the whole session — no fumbling mid-set.
  useWakeLock();

  // Elapsed derives from wall clock every tick, so a throttled background tab
  // can't drift it.
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - startedAt.current.getTime()) / 1000)),
  );
  const finished = summary !== null;
  useEffect(() => {
    if (finished) return;
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startedAt.current.getTime()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [finished]);

  // Rest countdown with a brief terracotta pulse + haptic when it hits zero.
  const [restPulse, setRestPulse] = useState(false);
  const restPulseTimeout = useRef<number | null>(null);
  const restTimer = useRestTimer(REST_SECONDS, () => {
    setRestPulse(true);
    if (restPulseTimeout.current !== null) window.clearTimeout(restPulseTimeout.current);
    restPulseTimeout.current = window.setTimeout(() => setRestPulse(false), 1600);
  });
  useEffect(
    () => () => {
      if (restPulseTimeout.current !== null) window.clearTimeout(restPulseTimeout.current);
    },
    [],
  );

  // Most recent completed values per exercise name across saved history —
  // the deepest hint layer under "previous set in this session" and "target".
  const historyFor = useMemo(() => {
    const map = new Map<string, { reps: number | null; weight: number | null }>();
    for (const log of logs) {
      // logs arrive newest-first; keep the first (most recent) match per name
      for (const exercise of log.exercises) {
        const key = exercise.name.trim().toLowerCase();
        if (map.has(key)) continue;
        const done = exercise.sets.filter((s) => s.completed);
        const last = done[done.length - 1];
        if (!last) continue;
        map.set(key, { reps: last.reps ?? null, weight: last.weight ?? null });
      }
    }
    return map;
  }, [logs]);

  const hintFor = (
    exercise: LoggedExercise,
    index: number,
    field: "reps" | "weight",
  ): number | null => {
    const set = exercise.sets[index];
    // Warm-up rows always hint from their own generated prescription.
    if (set.isWarmup) {
      const target = field === "reps" ? set.targetReps : set.targetWeight;
      return target !== null && target > 0 ? target : null;
    }
    for (let i = index - 1; i >= 0; i--) {
      if (exercise.sets[i].isWarmup) continue; // ramp values are not working hints
      const raw = exercise.sets[i][field];
      if (raw.trim() !== "") {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    const target = field === "reps" ? set.targetReps : set.targetWeight;
    if (target !== null && target > 0) return target;
    const hist = historyFor.get(exercise.name.trim().toLowerCase());
    const h = field === "reps" ? hist?.reps : hist?.weight;
    return h != null && h > 0 ? h : null;
  };

  // Double-progression hints from the last session containing each exercise.
  // Keyed on session.exercises (names are fixed for the session), so this
  // doesn't recompute on every keystroke.
  const progressionHints = useMemo(() => {
    const map = new Map<string, ProgressionSuggestion>();
    for (const exercise of session.exercises) {
      const key = exercise.name.trim().toLowerCase();
      if (map.has(key)) continue;
      const suggestion = suggestProgression(logs, exercise.name, { unit: weightUnit });
      if (suggestion) map.set(key, suggestion);
    }
    return map;
  }, [logs, session.exercises, weightUnit]);

  // ── Derived stats (working sets only — warm-ups never count) ──

  const stats = useMemo(() => {
    let completedSets = 0;
    let totalSets = 0;
    let volume = 0;
    for (const exercise of exercises) {
      for (const set of exercise.sets) {
        if (set.isWarmup) continue;
        totalSets++;
        if (set.completed) {
          completedSets++;
          volume += (Number(set.reps) || 0) * (Number(set.weight) || 0);
        }
      }
    }
    return { exercises: exercises.length, completedSets, totalSets, volume };
  }, [exercises]);

  // Live muscle heat: completed sets → per-muscle score (primary 1, secondary
  // 0.5 per set) → 0..1 intensity, saturating at 6 hard sets. Fully local via
  // lookupMuscles — recomputed on every set completion.
  const muscleData = useMemo(() => {
    const scores = new Map<Muscle, number>();
    for (const exercise of exercises) {
      const completedCount = exercise.sets.filter((s) => s.completed && !s.isWarmup).length;
      if (completedCount === 0) continue;
      const mapping = lookupMuscles(exercise.name);
      if (!mapping) continue;
      for (const m of mapping.primary) scores.set(m, (scores.get(m) ?? 0) + completedCount);
      for (const m of mapping.secondary)
        scores.set(m, (scores.get(m) ?? 0) + completedCount * 0.5);
    }
    const intensities: Partial<Record<Muscle, number>> = {};
    for (const [muscle, score] of scores) intensities[muscle] = Math.min(1, score / 6);
    return { intensities, trainedCount: scores.size };
  }, [exercises]);

  // ── Focus auto-advance (reps → weight → next set, across exercises) ──

  const allSetIds = exercises.flatMap((exercise) => exercise.sets.map((set) => set.id));
  const { registerRepsRef, registerWeightRef, focusWeight, focusNextReps } =
    useEnterAdvance(allSetIds);

  // ── Mutations ──

  const updateSetField = (exerciseId: string, setId: string, field: "reps" | "weight", value: string) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.id === setId ? { ...set, [field]: value } : set,
              ),
            }
          : exercise,
      ),
    );
  };

  const onSetCompleted = (exerciseName: string, isWarmup = false) => {
    restTimer.start();
    // Warm-ups don't feed the heat map, so no pulse — just the rest countdown.
    if (!isWarmup && lookupMuscles(exerciseName)) setMusclePulseKey((k) => k + 1);
  };

  /** Toggle one set. Marking done commits hint values so the log stays honest. */
  const toggleSetDone = (exerciseId: string, setId: string) => {
    const exercise = exercises.find((e) => e.id === exerciseId);
    const index = exercise?.sets.findIndex((s) => s.id === setId) ?? -1;
    if (!exercise || index < 0) return;
    const set = exercise.sets[index];
    const becomingDone = !set.completed;

    let reps = set.reps;
    let weight = set.weight;
    if (becomingDone) {
      if (reps.trim() === "") {
        const hint = hintFor(exercise, index, "reps");
        if (hint !== null) reps = String(hint);
      }
      if (weight.trim() === "") {
        const hint = hintFor(exercise, index, "weight");
        if (hint !== null) weight = formatWeightForDisplay(hint);
      }
    }

    setExercises((current) =>
      current.map((e) =>
        e.id === exerciseId
          ? {
              ...e,
              sets: e.sets.map((s) =>
                s.id === setId ? { ...s, completed: becomingDone, reps, weight } : s,
              ),
            }
          : e,
      ),
    );

    if (becomingDone) onSetCompleted(exercise.name, set.isWarmup === true);
  };

  /** Exercise-level Done: complete (or reopen) every set, filling hints in order. */
  const setAllSetsDone = (exerciseId: string, done: boolean) => {
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;

    if (!done) {
      setExercises((current) =>
        current.map((e) =>
          e.id === exerciseId
            ? { ...e, sets: e.sets.map((s) => ({ ...s, completed: false })) }
            : e,
        ),
      );
      return;
    }

    const hist = historyFor.get(exercise.name.trim().toLowerCase());
    let prevReps: string | null = null;
    let prevWeight: string | null = null;
    const filled = exercise.sets.map((set) => {
      // Warm-ups fill from their own ramp prescription and stay out of the
      // working-set cascade in both directions.
      if (set.isWarmup) {
        const reps =
          set.reps.trim() === "" && set.targetReps !== null && set.targetReps > 0
            ? String(set.targetReps)
            : set.reps;
        const weight =
          set.weight.trim() === "" && set.targetWeight !== null && set.targetWeight > 0
            ? formatWeightForDisplay(set.targetWeight)
            : set.weight;
        return { ...set, reps, weight, completed: true };
      }
      let reps = set.reps;
      let weight = set.weight;
      if (reps.trim() === "") {
        if (prevReps !== null) reps = prevReps;
        else if (set.targetReps !== null && set.targetReps > 0) reps = String(set.targetReps);
        else if (hist?.reps != null && hist.reps > 0) reps = String(hist.reps);
      }
      if (weight.trim() === "") {
        if (prevWeight !== null) weight = prevWeight;
        else if (set.targetWeight !== null && set.targetWeight > 0)
          weight = formatWeightForDisplay(set.targetWeight);
        else if (hist?.weight != null && hist.weight > 0)
          weight = formatWeightForDisplay(hist.weight);
      }
      if (reps.trim() !== "") prevReps = reps;
      if (weight.trim() !== "") prevWeight = weight;
      return { ...set, reps, weight, completed: true };
    });

    setExercises((current) =>
      current.map((e) => (e.id === exerciseId ? { ...e, sets: filled } : e)),
    );
    onSetCompleted(exercise.name);
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
                  reps: "",
                  weight: "",
                  completed: false,
                  targetReps: exercise.sets.at(-1)?.targetReps ?? null,
                  targetWeight: exercise.sets.at(-1)?.targetWeight ?? null,
                },
              ],
            }
          : exercise,
      ),
    );
  };

  /** First working set's entered weight, falling back through the hint chain. */
  const workingWeightFor = (exercise: LoggedExercise): number | null => {
    const index = exercise.sets.findIndex((set) => !set.isWarmup);
    if (index < 0) return null;
    const entered = Number(exercise.sets[index].weight);
    if (Number.isFinite(entered) && entered > 0) return entered;
    return hintFor(exercise, index, "weight");
  };

  const addWarmupRamp = (exerciseId: string) => {
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise || exercise.sets.some((set) => set.isWarmup)) return;
    const workingWeight = workingWeightFor(exercise);
    if (workingWeight === null) return;
    const ramp = generateWarmupSets(workingWeight, { unit: weightUnit });
    if (ramp.length === 0) return;
    const warmups: LoggedSet[] = ramp.map((set) => ({
      id: set.id,
      reps: "",
      weight: "",
      completed: false,
      targetReps: set.reps ?? null,
      targetWeight: set.weight ?? null,
      isWarmup: true,
    }));
    setExercises((current) =>
      current.map((e) =>
        e.id === exerciseId ? { ...e, sets: [...warmups, ...e.sets] } : e,
      ),
    );
  };

  const openPlateMath = (weight: number) => {
    setPlateWeight(weight);
    setPlateOpen(true);
  };

  // ── Finish / discard ──

  const handleFinish = async () => {
    if (saving) return;
    // Zero completed sets means there's nothing worth keeping — saving would
    // drop an empty log into history, calendar dots, and week stats. Confirm
    // a discard instead; there is deliberately no "save anyway".
    if (stats.completedSets === 0) {
      setDiscardOpen(true);
      return;
    }
    setSaving(true);
    const durationSeconds = Math.max(
      1,
      Math.floor((Date.now() - startedAt.current.getTime()) / 1000),
    );
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

    const exercisesForSave: WorkoutExercise[] = exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      kind: exercise.kind,
      category: exercise.category,
      target: exercise.target,
      notes: exercise.notes,
      sets: exercise.sets.map((set) => ({
        id: set.id,
        reps: Number(set.reps) || 0,
        weight: Number(set.weight) || 0,
        completed: set.completed,
        ...(set.isWarmup ? { isWarmup: true } : {}),
      })),
    }));

    // PRs must compare against history *before* this session lands in logs.
    const prs = computePrs(exercises, logs);
    const prEvents = detectSessionPRs(logs, {
      name: session.name,
      exercises: exercisesForSave.map((e) => ({ name: e.name, sets: e.sets })),
    });

    try {
      await save({
        template_id: session.templateId ?? null,
        name: session.name,
        exercises: exercisesForSave,
        notes: notes.trim() || null,
        started_at: startedAt.current.toISOString(),
        finished_at: new Date().toISOString(),
        duration_minutes: durationMinutes,
        total_sets: stats.totalSets,
        completed_sets: stats.completedSets,
        total_volume: stats.volume,
        source: "manual",
        captured_session_id: null,
      });
      restTimer.skip();
      setSummary({
        durationSeconds,
        volume: stats.volume,
        completedSets: stats.completedSets,
        totalSets: stats.totalSets,
        exercisesCount: exercises.length,
        prs,
        intensities: muscleData.intensities,
        trainedCount: muscleData.trainedCount,
      });
      // Celebrate only after the save landed — never block or risk the log.
      if (prEvents.length > 0) {
        setPrCelebration(prEvents);
        if (Capacitor.isNativePlatform()) {
          import("@capacitor/haptics")
            .then(({ Haptics, NotificationType }) =>
              Haptics.notification({ type: NotificationType.Success }),
            )
            .catch(() => {
              /* haptics unavailable — the overlay is celebration enough */
            });
        }
      }
    } catch {
      toast({ title: "Could not save workout", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  /** Abandon the session: same teardown as a successful finish, minus the
      save. Navigating away unmounts the component, which releases the wake
      lock and clears the elapsed/rest intervals via their effect cleanups. */
  const handleDiscard = () => {
    setDiscardOpen(false);
    restTimer.skip();
    window.localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
    toast({ title: "Session discarded" });
    navigate("/dashboard");
  };

  // ── Session-end reveal ──

  if (summary) {
    return (
      <div className="relative min-h-screen w-full max-w-6xl mx-auto p-6 md:p-10 lg:p-12">
        <div aria-hidden className="fixed inset-0 z-[-1] bg-background" />

        {/* PR celebration sits over the summary; Done reveals the normal path */}
        {prCelebration && (
          <PRCelebrationOverlay
            events={prCelebration}
            units={units}
            onDone={() => setPrCelebration(null)}
          />
        )}

        <div className="relative mb-8 animate-reveal-up">
          <p className="eyebrow mb-2 !text-primary">Workout complete</p>
          <h1 className="heading-lg">{session.name}</h1>
          <p className="body-md mt-3 max-w-2xl">
            Logged and saved. Here's what you lit up.
          </p>
        </div>

        <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Final muscle map — the reward */}
          <section
            className="relative overflow-hidden rounded-lg border border-border bg-card p-5 md:p-6 animate-reveal-up"
            style={{ animationDelay: "120ms" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <p className="eyebrow !text-primary">Muscles trained</p>
              <span className="mono text-sm font-semibold text-primary">
                {summary.trainedCount}
              </span>
            </div>
            {summary.trainedCount > 0 ? (
              <>
                <LiveMuscleMap
                  intensities={summary.intensities}
                  bodyHeight={250}
                  showGenderToggle={false}
                />
                <IntensityLegend className="mt-4" />
              </>
            ) : (
              <p className="body-md py-10 text-center text-fg-muted">
                No mapped muscles this time — name your exercises to light the map.
              </p>
            )}
          </section>

          {/* Numbers + PRs */}
          <div className="flex flex-col gap-6">
            <section
              className="relative overflow-hidden rounded-lg border border-border bg-card p-5 md:p-6 animate-reveal-up"
              style={{ animationDelay: "240ms" }}
            >
              <p className="eyebrow mb-4">Session totals</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Duration", value: formatClock(summary.durationSeconds) },
                  { label: "Volume", value: `${summary.volume.toLocaleString()} ${units}` },
                  { label: "Sets", value: `${summary.completedSets}/${summary.totalSets}` },
                  { label: "Exercises", value: String(summary.exercisesCount) },
                ].map((item, i) => (
                  <div
                    key={item.label}
                    className="rounded-md surface-2 p-4 animate-reveal-up"
                    style={{ animationDelay: `${320 + i * 70}ms` }}
                  >
                    <p className="mono text-lg font-semibold text-fg">{item.value}</p>
                    <p className="eyebrow mt-1.5 !text-[10px]">{item.label}</p>
                  </div>
                ))}
              </div>
            </section>

            <section
              className="relative overflow-hidden rounded-lg border border-border bg-card p-5 md:p-6 animate-reveal-up"
              style={{ animationDelay: "420ms" }}
            >
              <div className="mb-4 flex items-center gap-2">
                <Trophy size={14} className="text-primary" />
                <p className="eyebrow !text-primary">Personal records</p>
              </div>
              {summary.prs.length > 0 ? (
                <div className="divide-y divide-border">
                  {summary.prs.map((pr, i) => (
                    <div
                      key={pr.name}
                      className="flex items-center justify-between gap-3 py-3 animate-reveal-up"
                      style={{ animationDelay: `${500 + i * 80}ms` }}
                    >
                      <span className="body-md min-w-0 truncate !text-fg">
                        {pr.name}
                        {pr.isFirst && (
                          <span className="caption ml-2 !text-primary/70">first log</span>
                        )}
                      </span>
                      <span className="mono shrink-0 text-sm font-semibold text-primary">
                        {formatWeightForDisplay(pr.weight)} {units} × {pr.reps}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="body-md text-fg-muted">
                  No new records today — showing up is the record that compounds.
                </p>
              )}
              <CTAButton
                to="/dashboard"
                onClick={() => window.localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY)}
                fullWidth
                className="mt-6"
              >
                View dashboard
              </CTAButton>
            </section>
          </div>
        </div>
      </div>
    );
  }

  // ── Active logging screen ──

  return (
    <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
      {/* Solid canvas: no grain, no blur — battery + arm's-length legibility. */}
      <div aria-hidden className="fixed inset-0 z-[-1] bg-background" />

      {/* THE NUMBER: elapsed time. One eyebrow above, one CTA beside, one line under. */}
      <header className="relative mb-8 animate-reveal-up md:mb-10">
        <p className="eyebrow flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary"
          />
          <span className="min-w-0 truncate">Active session · {session.name}</span>
        </p>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
          <h1 className="stat-hero whitespace-nowrap !text-6xl md:!text-7xl">
            {formatClock(elapsed)}
          </h1>
          <div className="flex shrink-0 items-center gap-5">
            {/* Quiet exit for abandoned sessions — always confirms first */}
            <button
              type="button"
              onClick={() => setDiscardOpen(true)}
              className="relative rounded-md text-xs font-medium text-fg-muted transition after:absolute after:-inset-2 after:content-[''] hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
            >
              Discard
            </button>
            <CTAButton onClick={handleFinish} disabled={saving} className="shrink-0">
              <Check size={16} />
              {saving ? "Saving…" : "Finish"}
            </CTAButton>
          </div>
        </div>
        <p className="body-sm mt-3">
          {stats.completedSets} of {stats.totalSets} sets done
          {stats.volume > 0 && (
            <>
              {" "}
              · {stats.volume.toLocaleString()} {units} moved
            </>
          )}
        </p>
      </header>

      <div className="relative grid gap-6 xl:grid-cols-[1fr_340px]">
        <section className="space-y-3">
          {/* Muscle activity — quiet hairline index row, expands in place */}
          <div className="border-y border-border">
            <button
              type="button"
              onClick={() => setMapOpen((open) => !open)}
              aria-expanded={mapOpen}
              className="flex min-h-[44px] w-full items-center justify-between gap-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="text-sm font-semibold text-fg">Muscle activity</span>
              <span className="flex items-center gap-2 text-fg-muted">
                <span className="caption tabular-nums">{muscleData.trainedCount} lit</span>
                <ChevronDown
                  size={16}
                  className={cn("transition-transform duration-200", mapOpen && "rotate-180")}
                />
              </span>
            </button>
            {mapOpen && (
              <div className="pb-4 pt-1">
                <LiveMuscleMap
                  intensities={muscleData.intensities}
                  pulseKey={musclePulseKey}
                  bodyHeight={210}
                />
                <IntensityLegend className="mt-3" />
              </div>
            )}
          </div>

          {exercises.map((exercise, exerciseIndex) => {
            const allDone =
              exercise.sets.length > 0 && exercise.sets.every((set) => set.completed);
            const progressionHint =
              progressionHints.get(exercise.name.trim().toLowerCase()) ?? null;
            const isWeighted = exercise.kind !== "cardio" && exercise.kind !== "bodyweight";
            const hasWarmups = exercise.sets.some((set) => set.isWarmup);
            const workingWeight = isWeighted ? workingWeightFor(exercise) : null;
            const canAddWarmup =
              isWeighted &&
              !hasWarmups &&
              workingWeight !== null &&
              workingWeight > BAR_WEIGHT[weightUnit];
            // Working sets number 1..n; warm-up rows show a W chip instead.
            let workingOrdinal = 0;
            const ordinals = exercise.sets.map((set) =>
              set.isWarmup ? 0 : workingOrdinal++,
            );
            return (
              <article
                key={exercise.id}
                className="relative overflow-hidden rounded-lg border border-border bg-card p-4 md:p-5 animate-reveal-up"
                style={{ animationDelay: `${exerciseIndex * 60 + 100}ms` }}
              >
                <div className="mb-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <Dumbbell
                        className="h-3.5 w-3.5 shrink-0 translate-x-[0.5px] translate-y-[0.5px] text-primary"
                        strokeWidth={1.9}
                      />
                      <span className="caption !text-fg-muted">{exercise.category}</span>
                    </div>
                    <h2 className="text-base font-semibold leading-snug">{exercise.name}</h2>
                    <p className="caption mt-0.5 !text-fg-muted">{exercise.target}</p>
                    {progressionHint && (
                      <p className="caption mt-1 flex items-center gap-1.5">
                        {progressionHint.kind === "add_weight" && (
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                          />
                        )}
                        <span className="min-w-0">{progressionHint.message}</span>
                      </p>
                    )}
                    {exercise.notes && (
                      <p className="caption mt-1 max-w-sm leading-relaxed">{exercise.notes}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAllSetsDone(exercise.id, !allDone)}
                    className={cn(
                      "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition after:absolute after:-inset-1 after:content-[''] focus:outline-none focus:ring-2 focus:ring-primary/40",
                      allDone
                        ? "border border-primary/50 bg-primary/10 text-primary"
                        : "border border-border text-fg-muted hover:border-primary/40 hover:text-fg",
                    )}
                  >
                    <Check size={14} />
                    {allDone ? "Completed" : "Done"}
                  </button>
                </div>

                {canAddWarmup && (
                  <button
                    type="button"
                    onClick={() => addWarmupRamp(exercise.id)}
                    className="mb-2 flex min-h-[36px] w-full items-center gap-1.5 rule-hairline pt-2 text-xs text-fg-muted transition hover:text-fg"
                  >
                    <Plus size={13} />
                    Add warm-up ramp
                  </button>
                )}

                {exerciseIndex === 0 && (
                  <p className="caption mb-2 !text-fg-faint">
                    Tap a faded number to accept it, or type your own — then hit the check.
                  </p>
                )}

                <div className="space-y-1">
                  {exercise.sets.map((set, setIndex) => (
                    <SetInputRow
                      key={set.id}
                      idx={ordinals[setIndex]}
                      showLabels={setIndex === 0}
                      reps={set.reps}
                      weight={set.weight}
                      done={set.completed}
                      unitsLabel={units}
                      repsHint={hintFor(exercise, setIndex, "reps")}
                      weightHint={hintFor(exercise, setIndex, "weight")}
                      isMetric={isMetric}
                      isWarmup={set.isWarmup === true}
                      registerRepsRef={registerRepsRef(set.id)}
                      registerWeightRef={registerWeightRef(set.id)}
                      onRepsChange={(v) => updateSetField(exercise.id, set.id, "reps", v)}
                      onWeightChange={(v) => updateSetField(exercise.id, set.id, "weight", v)}
                      onRepsEnter={() => focusWeight(set.id)}
                      onDoneTap={() => toggleSetDone(exercise.id, set.id)}
                      onWeightEnter={() => {
                        const wasCompleted = set.completed;
                        toggleSetDone(exercise.id, set.id);
                        if (!wasCompleted) focusNextReps(set.id);
                      }}
                      onWeightValueTap={isWeighted ? openPlateMath : undefined}
                    />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addSet(exercise.id)}
                  className="relative mt-2.5 inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-xs text-fg-muted transition after:absolute after:-inset-1.5 after:content-[''] hover:border-primary/40 hover:text-fg"
                >
                  <Plus size={14} />
                  Add set
                </button>
              </article>
            );
          })}
        </section>

        {/* Desktop sidebar */}
        <aside className="hidden space-y-4 xl:sticky xl:top-6 xl:block xl:self-start">
          {/* Rest timer */}
          <div className="relative overflow-hidden rounded-lg border border-border bg-card p-5">
            <div className="mb-4 flex items-center gap-2">
              <Timer size={15} className="text-primary" />
              <span className="eyebrow !text-primary">Rest</span>
            </div>
            {restTimer.running || restPulse ? (
              <div className="flex flex-col items-center gap-4">
                <RestTimerRing
                  remaining={restTimer.remaining}
                  progress={restTimer.progress}
                  size={112}
                  strokeWidth={6}
                  pulse={restPulse}
                />
                {restPulse && !restTimer.running ? (
                  <p className="caption !text-primary">Rest complete — lift.</p>
                ) : (
                  <RestControls
                    onExtend={() => restTimer.extend(30)}
                    onSkip={restTimer.skip}
                  />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <RestTimerRing remaining={REST_SECONDS} progress={0} size={56} strokeWidth={4} className="opacity-40" />
                <p className="caption leading-relaxed">
                  Completing a set starts a 2:00 rest countdown.
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <label className="block rounded-lg border border-border bg-card p-5">
            <span className="eyebrow mb-3 block">Session notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="How did this session feel?"
              rows={5}
              className="w-full resize-none rounded-md border border-border bg-secondary/50 p-3 text-sm outline-none transition focus:border-primary/60"
            />
          </label>
        </aside>
      </div>

      {/* Mobile / tablet: compact rest bar pinned above the tab bar */}
      {(restTimer.running || restPulse) && (
        <div className="fixed inset-x-4 z-30 bottom-[calc(4rem+var(--safe-bottom)+0.75rem)] md:inset-x-auto md:right-6 md:bottom-6 md:w-96 xl:hidden">
          <div
            className={cn(
              "flex items-center gap-4 rounded-lg border bg-card px-4 py-3 shadow-lg transition-colors",
              restPulse ? "border-primary/60" : "border-border",
            )}
          >
            <RestTimerRing
              remaining={restTimer.remaining}
              progress={restTimer.progress}
              size={48}
              strokeWidth={4}
              pulse={restPulse}
            />
            <div className="min-w-0 flex-1">
              <p className="eyebrow !text-[10px] !text-primary">Rest</p>
              <p className="caption truncate">
                {restPulse && !restTimer.running
                  ? "Rest complete — lift."
                  : "Next set when the ring closes"}
              </p>
            </div>
            <RestControls
              onExtend={() => restTimer.extend(30)}
              onSkip={restTimer.skip}
              compact
            />
          </div>
        </div>
      )}

      {/* Discard confirmation — Finish with zero completed sets routes here
          too. No "save anyway": an empty log has no value. */}
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg border-border bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {stats.completedSets === 0
                ? "Nothing logged yet"
                : "Discard this session?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {stats.completedSets === 0
                ? "No sets were completed, so there's nothing to save. Discard the session, or keep logging."
                : `${stats.completedSets} completed ${
                    stats.completedSets === 1 ? "set" : "sets"
                  } will be lost — nothing gets saved to your history.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep logging</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Plate math bottom sheet — opened by tapping a filled weight value */}
      <Drawer
        open={plateOpen}
        onOpenChange={(open) => {
          if (!open) setPlateOpen(false);
        }}
      >
        <DrawerContent>
          <DrawerTitle className="sr-only">Plate math</DrawerTitle>
          {plateWeight !== null && (
            <PlateMathSheet
              weight={plateWeight}
              units={units}
              unit={weightUnit}
              onClose={() => setPlateOpen(false)}
            />
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
};

// ── Small pieces ────────────────────────────────────────────────────────────

/** Editorial plate breakdown for the tapped weight — arm's-length numerals. */
const PlateMathSheet = ({
  weight,
  units,
  unit,
  onClose,
}: {
  weight: number;
  units: string;
  unit: WeightUnit;
  onClose: () => void;
}) => {
  const result = plateBreakdown(weight, { unit });
  const belowBar = result.perSide.length === 0 && result.remainder < 0;
  return (
    <div className="mx-auto w-full max-w-md px-6 pb-[calc(1.25rem+var(--safe-bottom))] pt-3">
      <p className="eyebrow">Plate math</p>
      <p className="stat-xl mt-2">
        <b>{formatWeightForDisplay(weight)}</b>{" "}
        <span className="text-xl font-light text-fg-muted">{units}</span>
      </p>

      <div className="rule-hairline mt-4 pt-4">
        <p className="stat-lg">{formatPlateMath(result)}</p>
        <p className="caption mt-1.5">
          {formatWeightForDisplay(result.barWeight)} {units} bar
        </p>
        {belowBar ? (
          <p className="caption mt-1 !text-fg-soft">
            Lighter than the empty bar — lift the bar alone.
          </p>
        ) : (
          result.remainder !== 0 && (
            <p className="caption mt-1 !text-fg-soft">
              {formatWeightForDisplay(Math.abs(result.remainder))} {units} can't be
              loaded with standard plates.
            </p>
          )
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className="mt-4 flex h-12 w-full items-center justify-center rounded-[14px] border border-border text-sm font-medium text-fg transition hover:bg-secondary/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        Close
      </button>
    </div>
  );
};

const PR_KIND_LABELS: Record<PREvent["kind"], string> = {
  weight: "Heaviest lift",
  e1rm: "Est. 1RM",
  reps: "Rep record",
};

const prValueParts = (pr: PREvent, units: string): { digits: string; suffix: string } => {
  switch (pr.kind) {
    case "weight":
      return { digits: formatWeightForDisplay(pr.value), suffix: units };
    case "e1rm":
      // e1RM comes back as a raw float — round only at display.
      return { digits: String(Math.round(pr.value)), suffix: `${units} est.` };
    case "reps":
      return {
        digits: String(pr.value),
        suffix:
          pr.weight && pr.weight > 0
            ? `reps at ${formatWeightForDisplay(pr.weight)} ${units}`
            : "reps",
      };
  }
};

const prPreviousLabel = (pr: PREvent, units: string): string => {
  if (pr.isFirst || pr.previousValue === null) return "First time";
  switch (pr.kind) {
    case "weight":
      return `Previous: ${formatWeightForDisplay(pr.previousValue)} ${units}`;
    case "e1rm":
      return `Previous: ${Math.round(pr.previousValue)} ${units}`;
    case "reps":
      return `Previous: ${pr.previousValue} reps`;
  }
};

/** Full-screen champagne moment after the save lands. Fades only. */
const PRCelebrationOverlay = ({
  events,
  units,
  onDone,
}: {
  events: PREvent[];
  units: string;
  onDone: () => void;
}) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Personal records"
    className="fixed inset-0 z-50 overflow-y-auto bg-background animate-fade-in"
  >
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="rule-heavy pt-5">
        <p className="eyebrow flex items-center gap-2 !text-primary">
          <Trophy size={12} strokeWidth={2.2} />
          Personal record{events.length > 1 ? "s" : ""}
        </p>
      </div>

      <div className="mt-1 divide-y divide-border">
        {events.map((pr, i) => {
          const { digits, suffix } = prValueParts(pr, units);
          return (
            <div
              key={`${pr.exerciseName}-${pr.kind}`}
              className="py-5 animate-fade-in"
              style={{ animationDelay: `${160 + i * 90}ms` }}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="body-sm min-w-0 truncate !text-fg">{pr.exerciseName}</p>
                <p className="eyebrow shrink-0 !text-[10px]">{PR_KIND_LABELS[pr.kind]}</p>
              </div>
              <p className="stat-xl mt-2">
                <b>{digits}</b>{" "}
                <span className="text-lg font-light text-fg-muted">{suffix}</span>
              </p>
              <p className="caption mt-1">{prPreviousLabel(pr, units)}</p>
            </div>
          );
        })}
      </div>

      <div className="rule-hairline pt-6">
        <CTAButton onClick={onDone} fullWidth>
          Done
        </CTAButton>
      </div>
    </div>
  </div>
);

const RestControls = ({
  onExtend,
  onSkip,
  compact = false,
}: {
  onExtend: () => void;
  onSkip: () => void;
  compact?: boolean;
}) => (
  <div className="flex shrink-0 items-center gap-2">
    <button
      type="button"
      onClick={onExtend}
      className={cn(
        "mono rounded-full border border-border bg-secondary font-semibold text-fg-muted transition hover:border-primary/50 hover:text-primary active:bg-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
      )}
    >
      +30s
    </button>
    <button
      type="button"
      onClick={onSkip}
      aria-label="Skip rest"
      className={cn(
        "flex items-center justify-center rounded-full border border-border bg-secondary text-fg-muted transition hover:border-primary/50 hover:text-primary active:bg-primary/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        compact ? "h-8 w-8" : "h-9 w-9",
      )}
    >
      <SkipForward size={compact ? 13 : 15} />
    </button>
  </div>
);

const IntensityLegend = ({ className }: { className?: string }) => (
  <div className={cn("flex items-center justify-center gap-2.5", className)}>
    <span className="caption !text-fg-faint">1 set</span>
    <span
      aria-hidden
      className="h-1.5 w-24 rounded-full"
      style={{
        background: `linear-gradient(90deg, ${colorForIntensity(0)}, ${colorForIntensity(0.5)}, ${colorForIntensity(1)})`,
      }}
    />
    <span className="caption !text-fg-faint">6+ sets</span>
  </div>
);

export default ActiveWorkoutLogger;
