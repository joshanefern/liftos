import { CTAButton } from "@/components/GoldButton";
import { ShareButton } from "@/components/ShareButton";
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
import { RollingNumber } from "@/components/motion/RollingNumber";
import { getMuscleActivation } from "@/lib/muscleMap";
import { localDayParam } from "@/lib/workoutStats";
import { useRestTimer } from "@/hooks/useRestTimer";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useWorkoutLogs, type WorkoutLog } from "@/hooks/useWorkoutLogs";
import {
  formatHold,
  formatHoldInput,
  parseHoldSeconds,
  trackingFor,
  type EffortTracking,
} from "@/lib/exerciseTracking";
import { successHaptic, tapHaptic } from "@/lib/haptics";
import { formatPlateMath, plateBreakdown } from "@/lib/plateMath";
import { detectSessionPRs, type PREvent } from "@/lib/prs";
import { isMetricUnits } from "@/lib/review/inputFormatters";
import type { WeightUnit } from "@/lib/warmup";
import type { ActiveSession } from "@/pages/ActiveWorkout";
import { cn } from "@/lib/utils";
import { Capacitor } from "@capacitor/core";
import {
  Check,
  ChevronDown,
  Plus,
  SkipForward,
  Timer,
  Trophy,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const ACTIVE_WORKOUT_STORAGE_KEY = "liftos_active_workout_session";
/** Names where flipping to time-tracking is a plausible want — the header
    tap-to-flip only exists for these, so "Squat" never grows a mystery tap. */
const TIMED_TOGGLE_HINT = /plank|hold|hang|carry|wall.?sit|bridge|l.?sit|iso|static|farmer/i;
/** Live logger progress (completed sets, typed values, notes) — the seed key
    alone only stores the untouched template, so without this every logged
    set evaporated on navigation and the Dashboard's "Resume workout" banner
    was a lie. Keyed to the seed's startedAt so a different session never
    inherits it. */
const ACTIVE_WORKOUT_PROGRESS_KEY = "liftos_active_workout_progress";
const REST_SECONDS = 120;

// ── Types ───────────────────────────────────────────────────────────────────

type LoggedSet = {
  id: string;
  /** User-entered effort value — rep count, or hold text ("1:30") when the
      exercise tracks time; "" renders the hint as a tap-to-fill placeholder. */
  reps: string;
  weight: string;
  completed: boolean;
  /** Prescription from the template (hint source, never mutated). */
  targetReps: number | null;
  targetTime: number | null;
  targetWeight: number | null;
  /** Generated ramp set — excluded from totals, volume, PRs, and muscle heat. */
  isWarmup?: boolean;
};

type LoggedExercise = Omit<WorkoutExercise, "sets"> & { sets: LoggedSet[] };

type SessionPR =
  | { name: string; kind: "weight"; weight: number; reps: number; isFirst: boolean }
  | { name: string; kind: "hold"; duration: number; weight: number; isFirst: boolean };

type SessionSummary = {
  durationSeconds: number;
  volume: number;
  completedSets: number;
  totalSets: number;
  exercisesCount: number;
  prs: SessionPR[];
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
      targetTime: set.duration_seconds ?? null,
      targetWeight: set.weight ?? null,
      ...(set.isWarmup ? { isWarmup: true } : {}),
    })),
  }));

type PersistedProgress = {
  startedAt: string;
  exercises: LoggedExercise[];
  notes: string;
};

/** Restore in-flight progress for THIS seeded session, if any survives. */
const restoreProgress = (startedAt: string): PersistedProgress | null => {
  try {
    const raw = window.localStorage.getItem(ACTIVE_WORKOUT_PROGRESS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedProgress;
    if (parsed.startedAt !== startedAt || !Array.isArray(parsed.exercises)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const clearActiveWorkoutStorage = (): void => {
  window.localStorage.removeItem(ACTIVE_WORKOUT_STORAGE_KEY);
  window.localStorage.removeItem(ACTIVE_WORKOUT_PROGRESS_KEY);
};

const formatClock = (totalSeconds: number): string => {
  const s = Math.max(0, totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
};

/** Session PRs vs saved history: heavier top weight (rep lifts), longer top
    hold (timed lifts), or first-ever log of a lift. */
const computePrs = (
  exercises: LoggedExercise[],
  history: WorkoutLog[],
): SessionSummary["prs"] => {
  const bestWeightByName = new Map<string, number>();
  const bestHoldByName = new Map<string, number>();
  for (const log of history) {
    for (const exercise of log.exercises) {
      const key = exercise.name.trim().toLowerCase();
      for (const set of exercise.sets) {
        if (set.isWarmup || !set.completed) continue;
        if (set.weight && set.weight > 0) {
          bestWeightByName.set(key, Math.max(bestWeightByName.get(key) ?? 0, set.weight));
        }
        // Cardio durations are not holds.
        if (exercise.kind !== "cardio" && set.duration_seconds && set.duration_seconds > 0) {
          bestHoldByName.set(key, Math.max(bestHoldByName.get(key) ?? 0, set.duration_seconds));
        }
      }
    }
  }

  const prs: SessionSummary["prs"] = [];
  for (const exercise of exercises) {
    const key = exercise.name.trim().toLowerCase();
    if (trackingFor(exercise) === "time") {
      let best: { duration: number; weight: number } | null = null;
      for (const set of exercise.sets) {
        if (set.isWarmup || !set.completed) continue;
        const duration = parseHoldSeconds(set.reps) ?? 0;
        if (duration > 0 && (best === null || duration > best.duration)) {
          best = { duration, weight: Number(set.weight) || 0 };
        }
      }
      if (!best) continue;
      const prior = bestHoldByName.get(key);
      if (prior === undefined) {
        prs.push({ name: exercise.name, kind: "hold", ...best, isFirst: true });
      } else if (best.duration > prior) {
        prs.push({ name: exercise.name, kind: "hold", ...best, isFirst: false });
      }
      continue;
    }

    let best: { weight: number; reps: number } | null = null;
    for (const set of exercise.sets) {
      if (set.isWarmup || !set.completed) continue;
      const weight = Number(set.weight) || 0;
      if (weight > 0 && (best === null || weight > best.weight)) {
        best = { weight, reps: Number(set.reps) || 0 };
      }
    }
    if (!best) continue;
    const prior = bestWeightByName.get(key);
    if (prior === undefined) {
      prs.push({ name: exercise.name, kind: "weight", ...best, isFirst: true });
    } else if (best.weight > prior) {
      prs.push({ name: exercise.name, kind: "weight", ...best, isFirst: false });
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

  const [exercises, setExercises] = useState<LoggedExercise[]>(
    () => restoreProgress(session.startedAt)?.exercises ?? cloneExercises(session.exercises),
  );
  const [notes, setNotes] = useState(
    () => restoreProgress(session.startedAt)?.notes ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [prCelebration, setPrCelebration] = useState<PREvent[] | null>(null);
  // The saved log feeds the recap's share card (first-party replacement for
  // the retired Strava write-back — Strava's API went subscriber-only).
  const [savedLog, setSavedLog] = useState<WorkoutLog | null>(null);
  // Muscle activation for THIS session only — the share card's bar list.
  const sessionActivations = useMemo(
    () => (savedLog ? [getMuscleActivation([savedLog], 36_500)] : []),
    [savedLog],
  );

  // Every edit lands in localStorage so navigating away (tab bar stays
  // visible mid-workout) and coming back through the resume banner restores
  // the session exactly. Skipped once the recap is up — the session is over.
  useEffect(() => {
    if (summary) return;
    try {
      window.localStorage.setItem(
        ACTIVE_WORKOUT_PROGRESS_KEY,
        JSON.stringify({
          startedAt: session.startedAt,
          exercises,
          notes,
        } satisfies PersistedProgress),
      );
    } catch {
      /* storage full/unavailable — resume just falls back to the bare seed */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercises, notes, session.startedAt, summary]);
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

  // ── Live PR moment — a small banner the second a record set is saved.
  //    Research: instant PR feedback is the emotional core of progress, and
  //    "motivating without being obnoxious" means banner, never modal. ──
  const [liveBanner, setLiveBanner] = useState<string | null>(null);
  const liveBannerTimeout = useRef<number | null>(null);
  // History bests per exercise name (weight lifts and holds), computed once —
  // beaten values are tracked in-session so one record fires one banner.
  const historyBests = useMemo(() => {
    const weightBest = new Map<string, number>();
    const holdBest = new Map<string, number>();
    for (const log of logs) {
      for (const exercise of log.exercises) {
        const key = exercise.name.trim().toLowerCase();
        for (const set of exercise.sets) {
          if (set.isWarmup || !set.completed) continue;
          if (set.weight && set.weight > 0) {
            weightBest.set(key, Math.max(weightBest.get(key) ?? 0, set.weight));
          }
          if (exercise.kind !== "cardio" && set.duration_seconds && set.duration_seconds > 0) {
            holdBest.set(key, Math.max(holdBest.get(key) ?? 0, set.duration_seconds));
          }
        }
      }
    }
    return { weightBest, holdBest };
  }, [logs]);
  const liveBestRef = useRef(new Map<string, number>());

  const celebrateIfRecord = (
    exercise: LoggedExercise,
    weightText: string,
    effortText: string,
  ) => {
    const key = exercise.name.trim().toLowerCase();
    const timed = trackingFor(exercise) === "time";
    const value = timed ? (parseHoldSeconds(effortText) ?? 0) : Number(weightText) || 0;
    if (value <= 0) return;
    // A weight without reps is a failed/untracked lift — no record (matches
    // the PR engine's eligibility rule).
    if (!timed && !(Number(effortText) >= 1)) return;
    const prior = timed
      ? historyBests.holdBest.get(key)
      : historyBests.weightBest.get(key);
    // First-ever logs get their moment at the finish screen, not mid-set.
    if (prior === undefined) return;
    const sessionBest = liveBestRef.current.get(`${timed ? "t" : "w"}:${key}`) ?? 0;
    if (value <= prior || value <= sessionBest) return;
    liveBestRef.current.set(`${timed ? "t" : "w"}:${key}`, value);
    setLiveBanner(
      timed
        ? `Longest ${exercise.name.toLowerCase()} ever — ${formatHold(value)}`
        : `Heaviest ${exercise.name.toLowerCase()} ever — ${formatWeightForDisplay(value)} ${units}`,
    );
    if (liveBannerTimeout.current !== null) window.clearTimeout(liveBannerTimeout.current);
    liveBannerTimeout.current = window.setTimeout(() => setLiveBanner(null), 4000);
  };
  useEffect(
    () => () => {
      if (liveBannerTimeout.current !== null) window.clearTimeout(liveBannerTimeout.current);
    },
    [],
  );

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
    const map = new Map<
      string,
      { reps: number | null; weight: number | null; duration: number | null }
    >();
    for (const log of logs) {
      // logs arrive newest-first; keep the first (most recent) match per name
      for (const exercise of log.exercises) {
        const key = exercise.name.trim().toLowerCase();
        if (map.has(key)) continue;
        const done = exercise.sets.filter((s) => s.completed);
        const last = done[done.length - 1];
        if (!last) continue;
        map.set(key, {
          reps: last.reps ?? null,
          weight: last.weight ?? null,
          duration: last.duration_seconds ?? null,
        });
      }
    }
    return map;
  }, [logs]);

  /** The effort column's entered value in numeric form (reps, or hold seconds). */
  const effortValue = (raw: string, tracking: EffortTracking): number | null => {
    if (raw.trim() === "") return null;
    if (tracking === "time") return parseHoldSeconds(raw);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const hintFor = (
    exercise: LoggedExercise,
    index: number,
    field: "reps" | "weight",
  ): number | null => {
    const tracking = trackingFor(exercise);
    const set = exercise.sets[index];
    const targetOf = (s: LoggedSet): number | null =>
      field === "weight" ? s.targetWeight : tracking === "time" ? s.targetTime : s.targetReps;
    // Warm-up rows always hint from their own generated prescription.
    if (set.isWarmup) {
      const target = targetOf(set);
      return target !== null && target > 0 ? target : null;
    }
    for (let i = index - 1; i >= 0; i--) {
      if (exercise.sets[i].isWarmup) continue; // ramp values are not working hints
      const raw = exercise.sets[i][field];
      const n =
        field === "weight" ? (Number(raw) > 0 ? Number(raw) : null) : effortValue(raw, tracking);
      if (raw.trim() !== "" && n !== null) return n;
    }
    const target = targetOf(set);
    if (target !== null && target > 0) return target;
    const hist = historyFor.get(exercise.name.trim().toLowerCase());
    const h =
      field === "weight" ? hist?.weight : tracking === "time" ? hist?.duration : hist?.reps;
    return h != null && h > 0 ? h : null;
  };

  /** Format an effort hint the way it should land in the input. */
  const commitEffortHint = (hint: number, tracking: EffortTracking): string =>
    tracking === "time" ? formatHoldInput(hint) : String(hint);

  // Double-progression hints from the last session containing each exercise.
  // ── Derived stats (working sets only — warm-ups never count) ──

  const stats = useMemo(() => {
    let completedSets = 0;
    let totalSets = 0;
    let volume = 0;
    for (const exercise of exercises) {
      // Timed sets have no rep count — holds contribute zero lifted volume.
      const timed = trackingFor(exercise) === "time";
      for (const set of exercise.sets) {
        if (set.isWarmup) continue;
        totalSets++;
        if (set.completed) {
          completedSets++;
          if (!timed) volume += (Number(set.reps) || 0) * (Number(set.weight) || 0);
        }
      }
    }
    return { exercises: exercises.length, completedSets, totalSets, volume };
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
      const tracking = trackingFor(exercise);
      if (reps.trim() === "") {
        const hint = hintFor(exercise, index, "reps");
        if (hint !== null) reps = commitEffortHint(hint, tracking);
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

    if (becomingDone) {
      onSetCompleted(exercise.name, set.isWarmup === true);
      if (!set.isWarmup) {
        tapHaptic();
        celebrateIfRecord(exercise, weight, reps);
      }
    }
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

    const tracking = trackingFor(exercise);
    const timed = tracking === "time";
    const hist = historyFor.get(exercise.name.trim().toLowerCase());
    const histEffort = timed ? hist?.duration : hist?.reps;
    let prevReps: string | null = null;
    let prevWeight: string | null = null;
    const filled = exercise.sets.map((set) => {
      const targetEffort = timed ? set.targetTime : set.targetReps;
      // Warm-ups fill from their own ramp prescription and stay out of the
      // working-set cascade in both directions.
      if (set.isWarmup) {
        const reps =
          set.reps.trim() === "" && targetEffort !== null && targetEffort > 0
            ? commitEffortHint(targetEffort, tracking)
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
        else if (targetEffort !== null && targetEffort > 0)
          reps = commitEffortHint(targetEffort, tracking);
        else if (histEffort != null && histEffort > 0)
          reps = commitEffortHint(histEffort, tracking);
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
                  targetTime: exercise.sets.at(-1)?.targetTime ?? null,
                  targetWeight: exercise.sets.at(-1)?.targetWeight ?? null,
                },
              ],
            }
          : exercise,
      ),
    );
  };

  /** Reps ↔ time for one exercise — entered values stay put, the columns
      just reinterpret ("60" logged as reps becomes a 60s hold). */
  const setTracking = (exerciseId: string, tracking: EffortTracking) => {
    setExercises((current) =>
      current.map((exercise) =>
        exercise.id === exerciseId ? { ...exercise, tracking } : exercise,
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

    const exercisesForSave: WorkoutExercise[] = exercises.map((exercise) => {
      const tracking = trackingFor(exercise);
      return {
        id: exercise.id,
        name: exercise.name,
        kind: exercise.kind,
        tracking,
        category: exercise.category,
        target: exercise.target,
        notes: exercise.notes,
        sets: exercise.sets.map((set) => ({
          id: set.id,
          reps: tracking === "time" ? 0 : Number(set.reps) || 0,
          weight: Number(set.weight) || 0,
          ...(tracking === "time"
            ? { duration_seconds: parseHoldSeconds(set.reps) ?? 0 }
            : {}),
          completed: set.completed,
          ...(set.isWarmup ? { isWarmup: true } : {}),
        })),
      };
    });

    // PRs must compare against history *before* this session lands in logs.
    const prs = computePrs(exercises, logs);
    const prEvents = detectSessionPRs(logs, {
      name: session.name,
      exercises: exercisesForSave.map((e) => ({ name: e.name, kind: e.kind, sets: e.sets })),
    });

    try {
      const saved = await save({
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
      // The workout is history now — clear the live-session keys HERE, not
      // on the recap's exit buttons, so a surviving seed can never haunt the
      // Dashboard as a phantom "Resume workout" banner.
      clearActiveWorkoutStorage();
      if (saved) setSavedLog(saved);
      restTimer.skip();
      setSummary({
        durationSeconds,
        volume: stats.volume,
        completedSets: stats.completedSets,
        totalSets: stats.totalSets,
        exercisesCount: exercises.length,
        prs,
      });
      // One long success haptic at the session boundary — the recap moment.
      successHaptic();
      if (prEvents.length > 0) setPrCelebration(prEvents);
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
    clearActiveWorkoutStorage();
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
          <p className="body-md mt-3 max-w-2xl">Logged and saved.</p>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          {/* Numbers + PRs */}
          <div className="flex flex-col gap-6">
            <section
              className="relative overflow-hidden rounded-lg border border-border bg-card p-5 md:p-6 animate-reveal-up"
              style={{ animationDelay: "240ms" }}
            >
              <p className="eyebrow mb-4">Session totals</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: "Duration",
                    value: <>{formatClock(summary.durationSeconds)}</>,
                  },
                  {
                    label: "Lifted",
                    // Count-up choreography — the recap's signature moment.
                    value: (
                      <>
                        <RollingNumber countUp value={summary.volume.toLocaleString()} />{" "}
                        {units}
                      </>
                    ),
                  },
                  {
                    label: "Sets",
                    value: (
                      <>
                        <RollingNumber countUp countUpMs={500} value={summary.completedSets} />/
                        {summary.totalSets}
                      </>
                    ),
                  },
                  { label: "Exercises", value: <>{summary.exercisesCount}</> },
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
                        {pr.kind === "hold"
                          ? pr.weight > 0
                            ? `${formatHold(pr.duration)} at ${formatWeightForDisplay(pr.weight)} ${units}`
                            : `${formatHold(pr.duration)} hold`
                          : `${formatWeightForDisplay(pr.weight)} ${units} × ${pr.reps}`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="body-md text-fg-muted">
                  No new records today — showing up is the record that compounds.
                </p>
              )}
              {/* Share — the recap's outbound moment. A native share card
                  (numbers + muscle bars) into whatever the user actually posts
                  to; no third-party API in the loop. */}
              {savedLog && (
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="caption">Send this session anywhere</span>
                  <ShareButton
                    log={savedLog}
                    prCount={summary.prs.length}
                    activations={sessionActivations}
                  />
                </div>
              )}
              <CTAButton
                to="/dashboard"
                onClick={clearActiveWorkoutStorage}
                fullWidth
                className={savedLog ? "mt-3" : "mt-6"}
              >
                View dashboard
              </CTAButton>
              {savedLog && (
                <p className="mt-3 text-center text-[12px] text-fg-muted">
                  This summary lives on your{" "}
                  <Link
                    to={`/calendar?day=${localDayParam(savedLog.finished_at)}`}
                    className="font-semibold text-primary"
                  >
                    calendar
                  </Link>
                  {" "}— open it any time.
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    );
  }

  // ── Active logging screen ──

  return (
    <div className="scoreboard-reveal relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
      {/* Solid canvas: no grain, no blur — battery + arm's-length legibility. */}
      <div aria-hidden className="fixed inset-0 z-[-1] bg-background" />

      {/* Live PR banner — quiet celebration the moment a record set lands */}
      {liveBanner && (
        <div className="pointer-events-none fixed inset-x-4 top-[calc(var(--safe-top)+0.75rem)] z-40 flex justify-center">
          <div
            role="status"
            className="flex items-center gap-2 rounded-full border border-primary/40 bg-card px-4 py-2.5 shadow-lg animate-reveal-up"
          >
            <Trophy size={13} className="shrink-0 text-primary" />
            <p className="text-sm font-semibold text-primary">{liveBanner}</p>
          </div>
        </div>
      )}

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
          <h1 className="stat-scoreboard whitespace-nowrap text-[84px] leading-none text-fg md:text-[96px]">
            <RollingNumber value={formatClock(elapsed)} />
          </h1>
          <div className="flex shrink-0 items-center gap-5">
            {/* Quiet exit for abandoned sessions — always confirms first */}
            <button
              type="button"
              onClick={() => setDiscardOpen(true)}
              className="relative rounded-md text-xs font-medium text-fg-muted transition after:absolute after:-inset-x-2 after:-inset-y-3.5 after:content-[''] hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
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
          {exercises.map((exercise, exerciseIndex) => {
            const allDone =
              exercise.sets.length > 0 && exercise.sets.every((set) => set.completed);
            const tracking = trackingFor(exercise);
            const isWeighted = exercise.kind !== "cardio" && exercise.kind !== "bodyweight";
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
                {/* Header = the exercise name and one Done button. Nothing
                    advisory lives up here any more (owner: "way too much
                    info") — the category chip, prescription line, coaching
                    hint, pinned note and warm-up ramp are gone; the reps⇄time
                    flip survives as a long-press-free tap on the name for
                    the few exercises that need it (planks). */}
                <div className="mb-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      tracking === "time" || TIMED_TOGGLE_HINT.test(exercise.name)
                        ? setTracking(exercise.id, tracking === "time" ? "reps" : "time")
                        : undefined
                    }
                    className="min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
                  >
                    <h2 className="truncate text-[17px] font-semibold capitalize leading-snug text-fg">
                      {exercise.name}
                    </h2>
                    {tracking === "time" && (
                      <p className="caption mt-0.5 !text-fg-muted">timed · tap to switch to reps</p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllSetsDone(exercise.id, !allDone)}
                    className={cn(
                      "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition after:absolute after:-inset-1 after:content-[''] focus:outline-none focus:ring-2 focus:ring-ring/40",
                      allDone
                        ? "border border-foreground bg-foreground text-background"
                        : "border border-border text-fg-muted hover:border-fg-soft hover:text-fg",
                    )}
                  >
                    <Check size={14} />
                    {allDone ? "Done" : "All done"}
                  </button>
                </div>

                <div className="space-y-1">
                  {exercise.sets.map((set, setIndex) => (
                    <SetInputRow
                      key={set.id}
                      idx={ordinals[setIndex]}
                      showLabels={setIndex === 0}
                      scoreboard
                      effort={tracking}
                      reps={set.reps}
                      weight={set.weight}
                      done={set.completed}
                      unitsLabel={units}
                      repsHint={hintFor(exercise, setIndex, "reps")}
                      weightHint={hintFor(exercise, setIndex, "weight")}
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

          {/* Session notes — phones/tablets never see the desktop sidebar,
              so the notes field lives at the end of the flow here. */}
          <label className="block rounded-lg border border-border bg-card p-4 md:p-5 xl:hidden">
            <span className="eyebrow mb-3 block">Session notes</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="How did this session feel?"
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-secondary/50 p-3 text-sm outline-none transition focus:border-primary/60"
            />
          </label>
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
        {/* Portals render outside ForceDarkScope — the `dark` class keeps
            the sheet on the scoreboard palette instead of a white slab. */}
        <AlertDialogContent className="dark w-[calc(100%-2.5rem)] max-w-sm rounded-[18px] border-border bg-card p-6 text-fg">
          <AlertDialogHeader className="space-y-2 text-left sm:text-left">
            <AlertDialogTitle className="text-[20px] font-semibold tracking-[-0.01em] text-fg">
              {stats.completedSets === 0 ? "Nothing logged yet" : "Discard this session?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-5 text-fg-soft">
              {stats.completedSets === 0
                ? "No sets checked off, so there's nothing to save."
                : `${stats.completedSets} completed ${
                    stats.completedSets === 1 ? "set" : "sets"
                  } will be lost.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-5 flex-col gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogCancel className="mt-0 h-12 w-full rounded-full border-0 bg-foreground text-[14.5px] font-semibold text-background hover:bg-foreground/90">
              Keep logging
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              className="h-12 w-full rounded-full border border-border bg-transparent text-[14.5px] font-semibold text-destructive hover:bg-destructive/10"
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
  e1rm: "Est. best single",
  reps: "Rep record",
  duration: "Longest hold",
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
    case "duration":
      return {
        digits: formatHold(pr.value),
        suffix:
          pr.weight && pr.weight > 0
            ? `at ${formatWeightForDisplay(pr.weight)} ${units}`
            : "hold",
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
    case "duration":
      return `Previous: ${formatHold(pr.previousValue)}`;
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

export default ActiveWorkoutLogger;
