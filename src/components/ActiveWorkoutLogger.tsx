import { CTAButton } from "@/components/GoldButton";
import { ShareButton } from "@/components/ShareButton";
import { RestTimerRing } from "@/components/logging/RestTimerRing";
import { VoiceLogControl } from "@/components/logging/VoiceLogControl";
import { CardioVitalsSheet } from "@/components/logging/CardioVitalsSheet";
import ExerciseNameSuggestions from "@/components/ExerciseNameSuggestions";
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
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { toast } from "@/components/ui/use-toast";
import { useUser } from "@/context/UserContext";
import type { WorkoutExercise } from "@/data/liftosMock";
import { RollingNumber } from "@/components/motion/RollingNumber";
import { getMuscleActivation } from "@/lib/muscleMap";
import { localDayParam } from "@/lib/workoutStats";
import type { VoiceApplyResult } from "@/lib/voiceApply";
import { useRestTimer } from "@/hooks/useRestTimer";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useWorkoutLogs, type WorkoutLog } from "@/hooks/useWorkoutLogs";
import { TEMPLATE_LIMIT_ERROR, useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import {
  exerciseListChanged,
  sessionToTemplateExercises,
} from "@/lib/sessionToTemplate";
import {
  formatCardioInput,
  formatHold,
  formatHoldInput,
  parseCardioSeconds,
  parseHoldSeconds,
  trackingFor,
  type EffortTracking,
  inferKind,
} from "@/lib/exerciseTracking";
import { successHaptic, tapHaptic } from "@/lib/haptics";
import { formatPlateMath, plateBreakdown } from "@/lib/plateMath";
import { detectSessionPRs, type PREvent } from "@/lib/prs";
import { isMetricUnits } from "@/lib/review/inputFormatters";
import type { WeightUnit } from "@/lib/warmup";
import type { ActiveSession } from "@/pages/ActiveWorkout";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  HeartPulse,
  MoreHorizontal,
  Plus,
  SkipForward,
  Timer,
  Trash2,
  Trophy,
  Weight,
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
/** How many recently-completed set ids voice corrections can reach back to. */
const RECENT_SET_CAP = 20;
/** Scroll lands first; the focus (and its keyboard) follows after this. */
const KEYBOARD_FOCUS_DELAY_MS = 60;

/** Tells MobileTabBar whether a session is LIVE on this route — it hides
    only then, so the recap and the "no session" screen keep their bottom
    navigation. The bar listens for the same event name. */
const announceSession = (active: boolean): void => {
  window.dispatchEvent(new CustomEvent("liftos-session", { detail: { active } }));
};

/** Jump to a field: scroll FIRST, instantly, then focus. The native shell
    repairs iOS's keyboard pan by recording the scroll offset at
    keyboardWillShow and restoring it at hide — focusing first meant it
    recorded the pre-scroll offset and snapped the page back the moment
    the keyboard closed. The delay lets the scroll settle before the
    keyboard notification fires, so the post-scroll offset is what's kept. */
const jumpToInput = (anchor: HTMLElement | null, input: HTMLInputElement | null): void => {
  (anchor ?? input)?.scrollIntoView({ behavior: "instant", block: "center" });
  if (!input) return;
  window.setTimeout(() => input.focus({ preventScroll: true }), KEYBOARD_FOCUS_DELAY_MS);
};

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
  | { name: string; kind: "hold"; duration: number; weight: number; isFirst: boolean }
  // Bodyweight rep records (push-ups, pull-ups) — weight stays 0 for the
  // shared weight-first sort. Keeps the recap consistent with the live
  // PR banner, which has always celebrated these.
  | { name: string; kind: "reps"; reps: number; weight: number; isFirst: boolean };

/** The set the "Now" block is pointed at: the first open WORKING set of the
    first exercise that still has one. Warm-ups are never "now" — they sit
    outside the set count, and a skipped ramp must not pin the block to an
    exercise the lifter has already moved past. */
type CurrentSet = {
  exercise: LoggedExercise;
  set: LoggedSet;
  setIndex: number;
  /** 1-based among working sets. */
  ordinal: number;
  workingTotal: number;
};

const findCurrentSet = (exercises: LoggedExercise[]): CurrentSet | null => {
  for (const exercise of exercises) {
    let workingTotal = 0;
    let found: { set: LoggedSet; setIndex: number; ordinal: number } | null = null;
    for (let i = 0; i < exercise.sets.length; i++) {
      const set = exercise.sets[i];
      if (set.isWarmup) continue;
      workingTotal++;
      if (found === null && !set.completed) found = { set, setIndex: i, ordinal: workingTotal };
    }
    if (found !== null) return { exercise, ...found, workingTotal };
  }
  return null;
};

type SessionSummary = {
  durationSeconds: number;
  volume: number;
  completedSets: number;
  totalSets: number;
  exercisesCount: number;
  prs: SessionPR[];
  /** The account's very first log — everything is a baseline, not a record. */
  firstWorkout: boolean;
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
  const bestBodyRepsByName = new Map<string, number>();
  for (const log of history) {
    for (const exercise of log.exercises) {
      const key = exercise.name.trim().toLowerCase();
      for (const set of exercise.sets) {
        if (set.isWarmup || !set.completed) continue;
        if (set.weight && set.weight > 0) {
          bestWeightByName.set(key, Math.max(bestWeightByName.get(key) ?? 0, set.weight));
        } else if (exercise.kind !== "cardio" && typeof set.reps === "number" && set.reps >= 1) {
          // Bodyweight tier — rep records for push-ups and friends.
          bestBodyRepsByName.set(key, Math.max(bestBodyRepsByName.get(key) ?? 0, set.reps));
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
    // Cardio rides are neither holds nor lifts — no "longest stairmaster".
    if (exercise.kind === "cardio") continue;
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
    let bestBodyReps = 0;
    for (const set of exercise.sets) {
      if (set.isWarmup || !set.completed) continue;
      const weight = Number(set.weight) || 0;
      const reps = Number(set.reps) || 0;
      if (weight > 0 && (best === null || weight > best.weight)) {
        best = { weight, reps };
      } else if (weight === 0 && reps > bestBodyReps) {
        bestBodyReps = reps;
      }
    }
    if (best) {
      const prior = bestWeightByName.get(key);
      if (prior === undefined) {
        prs.push({ name: exercise.name, kind: "weight", ...best, isFirst: true });
      } else if (best.weight > prior) {
        prs.push({ name: exercise.name, kind: "weight", ...best, isFirst: false });
      }
      continue;
    }
    // Bodyweight-only exercise: rep records, mirroring the live banner.
    if (bestBodyReps < 1) continue;
    const priorReps = bestBodyRepsByName.get(key);
    if (priorReps === undefined) {
      prs.push({ name: exercise.name, kind: "reps", reps: bestBodyReps, weight: 0, isFirst: true });
    } else if (bestBodyReps > priorReps) {
      prs.push({ name: exercise.name, kind: "reps", reps: bestBodyReps, weight: 0, isFirst: false });
    }
  }
  return prs.sort((a, b) => b.weight - a.weight);
};

// ── Component ───────────────────────────────────────────────────────────────

const ActiveWorkoutLogger = ({ session }: { session: ActiveSession }) => {
  const { save, logs, loadFailed: logsLoadFailed } = useWorkoutLogs();
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

  // ── Voice logging: apply results from the hold-to-talk control and keep
  // one level of undo (state + notes snapshot from just before the apply).
  const voiceUndoRef = useRef<{ exercises: LoggedExercise[]; notes: string } | null>(null);
  // Snapshot sources that dodge the async closure: edits made while the
  // voice call was in flight must survive an Undo.
  const notesRef = useRef(notes);
  notesRef.current = notes;

  // Set ids in the order they were completed, MOST RECENT FIRST, by every
  // path (row tick, exercise Done, Complete set, voice). "That was 12" /
  // "scratch that" rewrite the LAST logged set, and rows carry no
  // timestamps — this list is how lib/voiceApply knows which one. A ref:
  // every writer also sets exercises, so the render that follows sees it.
  const recentSetIdsRef = useRef<string[]>([]);
  const noteSetsCompleted = (idsInOrder: string[]): void => {
    if (idsInOrder.length === 0) return;
    const fresh = [...idsInOrder].reverse();
    const rest = recentSetIdsRef.current.filter((id) => !fresh.includes(id));
    recentSetIdsRef.current = [...fresh, ...rest].slice(0, RECENT_SET_CAP);
  };
  // What voice sees: only rows still completed — an undo or an un-tick
  // drops a row without disturbing the order of the rest.
  const recentSetIds = useMemo(() => {
    const completed = new Set(
      exercises.flatMap((e) => e.sets.filter((s) => s.completed).map((s) => s.id)),
    );
    return recentSetIdsRef.current.filter((id) => completed.has(id));
  }, [exercises]);

  const handleVoiceApply = (result: VoiceApplyResult): void => {
    const completed = new Set(
      result.exercises.flatMap((e) => e.sets.filter((s) => s.completed).map((s) => s.id)),
    );
    noteSetsCompleted(result.touched.map((t) => t.setId).filter((id) => completed.has(id)));
    setExercises((current) => {
      voiceUndoRef.current = { exercises: current, notes: notesRef.current };
      return result.exercises as LoggedExercise[];
    });
    if (result.note) {
      setNotes((current) => (current.trim() ? `${current}\n${result.note}` : result.note!));
    }
  };

  const handleVoiceUndo = (): void => {
    const snapshot = voiceUndoRef.current;
    if (!snapshot) return;
    voiceUndoRef.current = null;
    setExercises(snapshot.exercises);
    setNotes(snapshot.notes);
  };

  // DOM handles for "take me there" jumps: the receipt's Edit lands on the
  // touched row, the toolbar's + lands on the add-exercise field.
  const exerciseCardRefs = useRef<Record<string, HTMLElement | null>>({});
  const repsInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const addExerciseInputRef = useRef<HTMLInputElement | null>(null);

  /** Receipt → Edit: scroll the first touched exercise into view and put
      the cursor in that set's reps cell. The first summary line's exercise
      name is the fallback target when nothing was touched (a note). */
  const handleVoiceEdit = (result: VoiceApplyResult): void => {
    // Edit takes over from voice: the snapshot behind Undo is stale the
    // moment the lifter types, so no later fire may restore it.
    voiceUndoRef.current = null;
    const touched = result.touched[0];
    let exerciseId = touched?.exerciseId ?? null;
    if (!exerciseId) {
      const firstLine = result.summary[0] ?? "";
      const name = firstLine.split(" · ")[0].trim().toLowerCase();
      exerciseId =
        exercises.find((e) => e.name.trim().toLowerCase() === name)?.id ?? null;
    }
    if (!exerciseId) return;
    const card = exerciseCardRefs.current[exerciseId] ?? null;
    const input = touched ? (repsInputRefs.current[touched.setId] ?? null) : null;
    jumpToInput(card, input);
  };

  const focusAddExercise = (): void => {
    const el = addExerciseInputRef.current;
    if (!el) return;
    jumpToInput(el, el);
  };

  // The tab bar hides only while this session is live: mount = live;
  // finish, discard and unmount = over (the recap keeps its navigation).
  useEffect(() => {
    announceSession(true);
    return () => announceSession(false);
  }, []);

  // ── Save what was actually done as a workout (create-vs-start split).
  // Quick starts have no templateId → "Save as workout"; template sessions
  // whose exercise LIST drifted (the planks case) can update the saved
  // workout or be saved as a new one — or neither, by just leaving.
  const { save: saveTemplate } = useWorkoutTemplates();
  const [templateSaveState, setTemplateSaveState] = useState<
    "idle" | "saving" | "saved"
  >("idle");
  const seedNames = useMemo(
    () => session.exercises.map((e) => e.name),
    [session.exercises],
  );

  const handleSaveAsTemplate = async (mode: "new" | "update"): Promise<void> => {
    if (templateSaveState !== "idle") return;
    const templateExercises = sessionToTemplateExercises(exercises);
    if (templateExercises.length === 0) return;
    setTemplateSaveState("saving");
    try {
      await saveTemplate({
        id: mode === "update" ? (session.templateId ?? null) : null,
        name: session.name,
        exercises: templateExercises,
      });
      setTemplateSaveState("saved");
      toast({
        title: mode === "update" ? `Updated "${session.name}"` : `Saved "${session.name}" to your workouts`,
      });
    } catch (err) {
      setTemplateSaveState("idle");
      toast(
        err instanceof Error && err.message === TEMPLATE_LIMIT_ERROR
          ? { title: "Workout limit reached", description: "You have 7 saved workouts — the max. Delete one in Workouts to make room." }
          : { title: "Could not save workout", variant: "destructive" },
      );
    }
  };

  // Manual add-exercise (blank quick starts, or the planks case by hand).
  const [newExerciseName, setNewExerciseName] = useState("");
  const [newExerciseFocused, setNewExerciseFocused] = useState(false);
  // Cardio card → live vitals sheet (heart rate + calories via Health).
  const [vitalsFor, setVitalsFor] = useState<string | null>(null);
  // Cardio card → inline "added weight" (vest / pack) editor; the value
  // lives on the exercise, not the set — distance owns the set's slot.
  const [vestEditing, setVestEditing] = useState<string | null>(null);
  const setAddedWeight = (id: string, raw: string): void => {
    const n = Number(raw);
    setExercises((current) =>
      current.map((e) =>
        e.id === id
          ? { ...e, addedWeight: Number.isFinite(n) && n > 0 ? Math.min(n, 500) : undefined }
          : e,
      ),
    );
  };
  const addExercise = (): void => {
    const name = newExerciseName.trim();
    if (!name) return;
    setExercises((current) => [
      ...current,
      {
        id: `exercise-${Date.now()}`,
        name,
        kind: inferKind(name),
        category: "",
        target: "",
        sets: [
          {
            id: `set-${Date.now()}`,
            reps: "",
            weight: "",
            completed: false,
            targetReps: null,
            targetTime: null,
            targetWeight: null,
          },
        ],
      },
    ]);
    setNewExerciseName("");
  };

  // Every edit lands in localStorage so Minimize (or the app being killed)
  // and coming back through the Home resume banner restores the session
  // exactly. Skipped once the recap is up — the session is over.
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
  }, [exercises, notes, session.startedAt, summary]);
  // Plate math sheet: weight sticks around while the drawer animates closed.
  const [plateWeight, setPlateWeight] = useState<number | null>(null);
  const [plateOpen, setPlateOpen] = useState(false);
  // Discard confirmation — reached through the header's ⋯ sheet, or by
  // Finish when nothing was completed (an empty log has no value to save).
  const [discardOpen, setDiscardOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** Sheet → dialog. The sheet must finish closing first: opening a Radix
      dialog while vaul is still animating leaves the body pointer-locked. */
  const discardFromMenu = (): void => {
    setMenuOpen(false);
    window.setTimeout(() => setDiscardOpen(true), 520);
  };
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
    // Cardio never fires hold-record banners (mirrors historyBests exclusion).
    if (exercise.kind === "cardio") return;
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

  /** Effort discriminator for a row: cardio thinks in minutes ("30" = 30:00),
      holds in seconds ("30" = 0:30) — parsing them alike corrupted hints. */
  type EffortMode = "reps" | "time" | "cardio";
  const effortModeFor = (exercise: LoggedExercise): EffortMode =>
    exercise.kind === "cardio" ? "cardio" : trackingFor(exercise);

  /** The effort column's entered value in numeric form (reps, or seconds). */
  const effortValue = (raw: string, mode: EffortMode): number | null => {
    if (raw.trim() === "") return null;
    if (mode === "cardio") return parseCardioSeconds(raw);
    if (mode === "time") return parseHoldSeconds(raw);
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
        field === "weight"
          ? (Number(raw) > 0 ? Number(raw) : null)
          : effortValue(raw, effortModeFor(exercise));
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
  const commitEffortHint = (hint: number, mode: EffortMode): string =>
    mode === "cardio"
      ? formatCardioInput(hint)
      : mode === "time"
        ? formatHoldInput(hint)
        : String(hint);

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

  // ── "Now" — the one set to do next ──

  const current = useMemo(() => findCurrentSet(exercises), [exercises]);

  /** One line under the Now heading: what this lift looked like last time,
      or the plan, or an honest "first time". */
  const previousLine = (exercise: LoggedExercise, set: LoggedSet): string => {
    const mode = effortModeFor(exercise);
    const hist = historyFor.get(exercise.name.trim().toLowerCase());
    if (hist) {
      if (mode === "reps") {
        if (hist.weight != null && hist.weight > 0 && hist.reps != null && hist.reps > 0) {
          return `Last session: ${formatWeightForDisplay(hist.weight)} ${units} × ${hist.reps}`;
        }
        if (hist.reps != null && hist.reps > 0) return `Last session: ${hist.reps} reps`;
      } else if (hist.duration != null && hist.duration > 0) {
        const loaded =
          mode === "time" && hist.weight != null && hist.weight > 0
            ? ` at ${formatWeightForDisplay(hist.weight)} ${units}`
            : "";
        return `Last session: ${formatHold(hist.duration)}${loaded}`;
      }
    }
    const targetEffort = mode === "reps" ? set.targetReps : set.targetTime;
    if (targetEffort != null && targetEffort > 0) {
      if (mode !== "reps") return `Plan: ${formatHold(targetEffort)}`;
      return set.targetWeight != null && set.targetWeight > 0
        ? `Plan: ${formatWeightForDisplay(set.targetWeight)} ${units} × ${targetEffort}`
        : `Plan: ${targetEffort} reps`;
    }
    return "First time — whatever you do sets the bar";
  };

  // ── Focus auto-advance (reps → weight → next set, across exercises) ──

  const allSetIds = exercises.flatMap((exercise) => exercise.sets.map((set) => set.id));
  const { registerRepsRef, registerWeightRef, focusWeight, focusNextReps } =
    useEnterAdvance(allSetIds);
  /** List rows register with the advance hook AND the jump map. */
  const registerListRepsRef = (id: string) => (el: HTMLInputElement | null) => {
    repsInputRefs.current[id] = el;
    registerRepsRef(id)(el);
  };
  // The Now block's own cells — kept off the advance hook so the list's
  // registrations stay canonical; Enter travels within the block instead.
  const nowRepsRef = useRef<HTMLInputElement | null>(null);
  const nowWeightRef = useRef<HTMLInputElement | null>(null);

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
      const mode = effortModeFor(exercise);
      if (reps.trim() === "") {
        const hint = hintFor(exercise, index, "reps");
        if (hint !== null) reps = commitEffortHint(hint, mode);
      }
      if (weight.trim() === "") {
        const hint = hintFor(exercise, index, "weight");
        if (hint !== null) weight = formatWeightForDisplay(hint);
      }
      noteSetsCompleted([setId]);
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

  /** The Now block's primary action — exactly the row's done control. */
  const completeCurrentSet = (): void => {
    if (!current) return;
    toggleSetDone(current.exercise.id, current.set.id);
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
    const mode = effortModeFor(exercise);
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
            ? commitEffortHint(targetEffort, mode)
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
          reps = commitEffortHint(targetEffort, mode);
        else if (histEffort != null && histEffort > 0)
          reps = commitEffortHint(histEffort, mode);
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

    // Rows flipping to done here complete in list order — the last one is
    // the most recent.
    noteSetsCompleted(exercise.sets.filter((set) => !set.completed).map((set) => set.id));
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
        ...(exercise.kind === "cardio" && exercise.addedWeight
          ? { addedWeight: exercise.addedWeight }
          : {}),
        sets: exercise.sets.map((set) => {
          // Cardio rows repurpose the weight field as DISTANCE (mi/km) —
          // save it as meters, never as a phantom 3.1 lb set.
          const cardio = exercise.kind === "cardio";
          const distance = cardio ? parseFloat(set.weight) : NaN;
          return {
            id: set.id,
            reps: tracking === "time" ? 0 : Number(set.reps) || 0,
            weight: cardio ? 0 : Number(set.weight) || 0,
            ...(tracking === "time"
              ? {
                  // Cardio reads bare digits as minutes; holds read seconds.
                  duration_seconds:
                    (cardio ? parseCardioSeconds(set.reps) : parseHoldSeconds(set.reps)) ?? 0,
                }
              : {}),
            ...(cardio && Number.isFinite(distance) && distance > 0
              ? { distance_m: Math.round(distance * (isMetric ? 1000 : 1609.34)) }
              : {}),
            completed: set.completed,
            ...(set.isWarmup ? { isWarmup: true } : {}),
          };
        }),
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
        firstWorkout: logs.length === 0 && !logsLoadFailed,
      });
      // The recap is not a live session — the tab bar comes back under it.
      announceSession(false);
      // One long success haptic at the session boundary — the recap moment.
      successHaptic();
      // The celebration overlay is for BEATEN records only. First-ever logs
      // are baselines — a new split day would otherwise flood the overlay
      // with one "record" per unfamiliar lift (they get one quiet recap
      // line instead).
      const beaten = prEvents.filter((event) => !event.isFirst);
      if (beaten.length > 0) setPrCelebration(beaten);
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
    announceSession(false);
    toast({ title: "Session discarded" });
    navigate("/dashboard");
  };

  // ── Session-end reveal ──

  if (summary) {
    const improvedPrs = summary.prs.filter((pr) => !pr.isFirst);
    const firstLogCount = summary.prs.length - improvedPrs.length;
    return (
      <div className="relative min-h-screen w-full max-w-6xl mx-auto p-6 pb-[calc(4rem+var(--safe-bottom)+2rem)] md:p-10 md:pb-[calc(4rem+var(--safe-bottom)+2.5rem)] lg:p-12 lg:pb-[calc(4rem+var(--safe-bottom)+3rem)]">
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
                <p className="eyebrow !text-primary">
                  {summary.firstWorkout ? "Baseline set" : "Personal records"}
                </p>
              </div>
              {summary.firstWorkout ? (
                /* First workout ever: every number is a starting line, not a
                   wall of "records" — one sentence, not a list. */
                <p className="body-md text-fg-soft">
                  Every number you just logged is your starting line. Beat any
                  of them next session for your first record.
                </p>
              ) : improvedPrs.length > 0 || firstLogCount > 0 ? (
                <div className="divide-y divide-border">
                  {improvedPrs.map((pr, i) => (
                    <div
                      key={pr.name}
                      className="flex items-center justify-between gap-3 py-3 animate-reveal-up"
                      style={{ animationDelay: `${500 + i * 80}ms` }}
                    >
                      <span className="body-md min-w-0 truncate !text-fg">{pr.name}</span>
                      <span className="mono shrink-0 text-sm font-semibold text-primary">
                        {pr.kind === "hold"
                          ? pr.weight > 0
                            ? `${formatHold(pr.duration)} at ${formatWeightForDisplay(pr.weight)} ${units}`
                            : `${formatHold(pr.duration)} hold`
                          : pr.kind === "reps"
                            ? `${pr.reps} reps`
                            : `${formatWeightForDisplay(pr.weight)} ${units} × ${pr.reps}`}
                      </span>
                    </div>
                  ))}
                  {/* New lifts collapse to one quiet line — a first log is a
                      baseline, and eight of them are not eight records. */}
                  {firstLogCount > 0 && (
                    <p className="py-3 text-[13px] leading-5 text-fg-muted">
                      {firstLogCount} lift{firstLogCount === 1 ? "" : "s"} logged for
                      the first time — baseline{firstLogCount === 1 ? "" : "s"} set.
                    </p>
                  )}
                </div>
              ) : (
                <p className="body-md text-fg-muted">
                  No new records today — showing up is the record that compounds.
                </p>
              )}
              {/* The session note the lifter spoke or typed — the recap is
                  where it pays off. */}
              {savedLog?.notes && (
                <div className="mt-5 rounded-[12px] bg-foreground/[0.04] px-4 py-3">
                  <p className="eyebrow !text-[10px]">Session notes</p>
                  <p className="mt-1 whitespace-pre-line text-sm leading-5 text-fg-soft">
                    {savedLog.notes}
                  </p>
                </div>
              )}

              {/* Keep what you actually did. Quick starts save as a new
                  workout; drifted template sessions choose update vs new —
                  or neither (the log lives on the calendar regardless). */}
              {savedLog && sessionToTemplateExercises(exercises).length > 0 && (
                templateSaveState === "saved" ? (
                  <p className="mt-4 text-center text-[12px] font-semibold text-primary">
                    Saved to your workouts ✓
                  </p>
                ) : !session.templateId ? (
                  <button
                    type="button"
                    disabled={templateSaveState === "saving"}
                    onClick={() => void handleSaveAsTemplate("new")}
                    className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-primary text-[13.5px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                  >
                    {templateSaveState === "saving" ? "Saving…" : "Save as workout"}
                  </button>
                ) : exerciseListChanged(seedNames, exercises) ? (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      disabled={templateSaveState === "saving"}
                      onClick={() => void handleSaveAsTemplate("update")}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                    >
                      Update “{session.name}”
                    </button>
                    <button
                      type="button"
                      disabled={templateSaveState === "saving"}
                      onClick={() => void handleSaveAsTemplate("new")}
                      className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-primary px-3 text-[13px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
                    >
                      Save as new
                    </button>
                  </div>
                ) : null
              )}

              {/* Share — the recap's outbound moment. A native share card
                  (numbers + muscle bars) into whatever the user actually posts
                  to; no third-party API in the loop. */}
              {savedLog && (
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="caption">Send this session anywhere</span>
                  <ShareButton
                    log={savedLog}
                    prCount={summary.firstWorkout ? 0 : summary.prs.length}
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
    <div className="scoreboard-reveal relative min-h-screen w-full max-w-7xl mx-auto p-6 pb-[calc(4rem+var(--safe-bottom)+5rem)] md:p-10 md:pb-[calc(4rem+var(--safe-bottom)+5rem)] lg:p-12 lg:pb-[calc(4rem+var(--safe-bottom)+5rem)]">
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

      {/* Header: session name with the clock as a small detail beside it,
          Finish as a quiet secondary control, everything else behind ⋯.
          The big number this screen is about is the NEXT SET, below. */}
      <header className="relative mb-5 animate-reveal-up">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="eyebrow flex items-center gap-2">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary"
              />
              Active session
            </p>
            <div className="mt-1 flex min-w-0 items-baseline gap-2.5">
              <h1 className="min-w-0 truncate text-[17px] font-semibold leading-snug tracking-tight text-fg">
                {session.name}
              </h1>
              <span
                role="timer"
                aria-label={`Elapsed ${formatClock(elapsed)}`}
                className="mono shrink-0 text-[13px] font-medium tabular-nums text-fg-muted"
              >
                <RollingNumber value={formatClock(elapsed)} />
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => void handleFinish()}
              disabled={saving}
              className="relative inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold text-fg transition after:absolute after:-inset-1 after:content-[''] hover:border-fg-soft active:scale-[0.97] disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <Check size={14} />
              {saving ? "Saving…" : "Finish"}
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="More session options"
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-fg-muted transition after:absolute after:-inset-1 after:content-[''] hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        </div>
        <p className="body-sm mt-2">
          {stats.completedSets} of {stats.totalSets} sets done
          {stats.volume > 0 && (
            <>
              {" "}
              · {stats.volume.toLocaleString()} {units} moved
            </>
          )}
        </p>
      </header>

      {/* NOW — the one set to do next, with its cells and one primary
          button. The full list below stays for people who work from it. */}
      {exercises.length > 0 && (
        <section
          className="relative mb-6 overflow-hidden rounded-[18px] border border-primary/35 bg-card p-4 animate-reveal-up md:p-5"
          style={{ animationDelay: "60ms" }}
        >
          {current ? (
            <>
              <p className="eyebrow !text-primary">Now</p>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <h2 className="min-w-0 truncate text-[20px] font-semibold capitalize leading-tight tracking-tight text-fg">
                  {current.exercise.name}
                </h2>
                <span className="mono shrink-0 text-[12px] font-medium text-fg-muted">
                  Set {current.ordinal} of {current.workingTotal}
                </span>
              </div>
              <p className="caption mt-1">{previousLine(current.exercise, current.set)}</p>
              <div className="mt-3">
                <SetInputRow
                  key={current.set.id}
                  idx={current.ordinal - 1}
                  showLabels
                  scoreboard
                  hideDone
                  effort={
                    current.exercise.kind === "cardio" ? "cardio" : trackingFor(current.exercise)
                  }
                  reps={current.set.reps}
                  weight={current.set.weight}
                  done={false}
                  unitsLabel={
                    current.exercise.kind === "cardio" ? (isMetric ? "km" : "mi") : units
                  }
                  repsHint={hintFor(current.exercise, current.setIndex, "reps")}
                  weightHint={hintFor(current.exercise, current.setIndex, "weight")}
                  registerRepsRef={(el) => {
                    nowRepsRef.current = el;
                  }}
                  registerWeightRef={(el) => {
                    nowWeightRef.current = el;
                  }}
                  onRepsChange={(v) =>
                    updateSetField(current.exercise.id, current.set.id, "reps", v)
                  }
                  onWeightChange={(v) =>
                    updateSetField(current.exercise.id, current.set.id, "weight", v)
                  }
                  onRepsEnter={() => nowWeightRef.current?.focus()}
                  onDoneTap={completeCurrentSet}
                  onWeightEnter={() => {
                    completeCurrentSet();
                    // The block re-points to the next set on commit; keep
                    // the keyboard flow going from its reps cell.
                    requestAnimationFrame(() => nowRepsRef.current?.focus());
                  }}
                  onWeightValueTap={
                    current.exercise.kind !== "cardio" && current.exercise.kind !== "bodyweight"
                      ? openPlateMath
                      : undefined
                  }
                />
              </div>
              <button
                type="button"
                onClick={completeCurrentSet}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-[14.5px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <Check size={16} strokeWidth={2.5} />
                Complete set
              </button>
            </>
          ) : (
            <>
              <p className="eyebrow !text-primary">Now</p>
              <h2 className="mt-1 text-[20px] font-semibold leading-tight tracking-tight text-fg">
                All sets done
              </h2>
              <p className="caption mt-1">
                Nice work. Finish to save it — or add a set below if you have more in you.
              </p>
              <CTAButton
                onClick={() => void handleFinish()}
                disabled={saving}
                variant="accent"
                fullWidth
                className="mt-3"
              >
                <Check size={16} strokeWidth={2.5} />
                {saving ? "Saving…" : "Finish workout"}
              </CTAButton>
            </>
          )}
        </section>
      )}

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
            const isCurrent = current?.exercise.id === exercise.id;
            return (
              <article
                key={exercise.id}
                ref={(el) => {
                  exerciseCardRefs.current[exercise.id] = el;
                }}
                className={cn(
                  "relative overflow-hidden rounded-lg border bg-card p-4 md:p-5 animate-reveal-up",
                  isCurrent ? "border-primary/35" : "border-border",
                )}
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
                      exercise.kind !== "cardio" &&
                      (tracking === "time" || TIMED_TOGGLE_HINT.test(exercise.name))
                        ? setTracking(exercise.id, tracking === "time" ? "reps" : "time")
                        : undefined
                    }
                    className="min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 rounded-md"
                  >
                    <h2 className="truncate text-[17px] font-semibold capitalize leading-snug text-fg">
                      {exercise.name}
                    </h2>
                    {exercise.kind === "cardio" ? (
                      <p className="caption mt-0.5 !text-fg-muted">cardio · minutes</p>
                    ) : (
                      tracking === "time" && (
                        <p className="caption mt-0.5 !text-fg-muted">timed · tap to switch to reps</p>
                      )
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
                      effort={exercise.kind === "cardio" ? "cardio" : tracking}
                      reps={set.reps}
                      weight={set.weight}
                      done={set.completed}
                      unitsLabel={exercise.kind === "cardio" ? (isMetric ? "km" : "mi") : units}
                      repsHint={hintFor(exercise, setIndex, "reps")}
                      weightHint={hintFor(exercise, setIndex, "weight")}
                      isWarmup={set.isWarmup === true}
                      registerRepsRef={registerListRepsRef(set.id)}
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

                <div className="mt-2.5 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => addSet(exercise.id)}
                    className="relative inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 py-2 text-xs text-fg-muted transition after:absolute after:-inset-1.5 after:content-[''] hover:border-primary/40 hover:text-fg"
                  >
                    <Plus size={14} />
                    {exercise.kind === "cardio" ? "Set" : "Add set"}
                  </button>
                  {/* Cardio extras as compact icon chips: added weight
                      (vest / pack) and live vitals (Pro). The chip grows a
                      value only once a vest weight is set. */}
                  {exercise.kind === "cardio" && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setVestEditing((cur) => (cur === exercise.id ? null : exercise.id))}
                        aria-label={
                          exercise.addedWeight
                            ? `Added weight: ${formatWeightForDisplay(exercise.addedWeight)} ${weightUnit}. Edit`
                            : "Add vest or pack weight"
                        }
                        className={cn(
                          "relative inline-flex h-9 min-w-9 items-center justify-center gap-1 whitespace-nowrap rounded-full border text-xs transition after:absolute after:-inset-1 after:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                          exercise.addedWeight
                            ? "border-foreground/40 px-2.5 font-semibold text-fg"
                            : "border-border text-fg-muted hover:border-primary/40 hover:text-fg",
                        )}
                      >
                        <Weight size={14} />
                        {exercise.addedWeight && (
                          <span className="mono">
                            {formatWeightForDisplay(exercise.addedWeight)} {weightUnit}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setVitalsFor(exercise.id)}
                        aria-label={`Live vitals for ${exercise.name} (Pro)`}
                        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/[0.12] text-primary transition after:absolute after:-inset-1 after:content-[''] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        <HeartPulse size={15} />
                      </button>
                    </div>
                  )}
                </div>
                {exercise.kind === "cardio" && vestEditing === exercise.id && (
                  <div className="mt-2.5 flex items-center gap-2 rounded-[12px] bg-foreground/[0.04] px-3 py-2.5">
                    <span className="text-[12.5px] font-medium text-fg-soft">Added weight</span>
                    <div className="relative ml-auto w-28">
                      <input
                        autoFocus
                        inputMode="decimal"
                        defaultValue={exercise.addedWeight ? formatWeightForDisplay(exercise.addedWeight) : ""}
                        onChange={(e) => setAddedWeight(exercise.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") setVestEditing(null);
                        }}
                        placeholder="0"
                        aria-label="Added weight for cardio (vest or pack)"
                        className="h-10 w-full rounded-lg border border-border bg-background px-3 pr-9 text-center text-[15px] font-semibold tabular-nums text-fg outline-none focus:border-primary/60"
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[10px] uppercase tracking-wider text-fg-muted">
                        {weightUnit}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVestEditing(null)}
                      className="inline-flex min-h-9 items-center rounded-full bg-foreground px-3 text-[12.5px] font-semibold text-background active:scale-[0.97]"
                    >
                      Done
                    </button>
                  </div>
                )}
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

          {/* Log-as-you-go: add any exercise mid-session (quick starts begin
              empty; the planks case by hand). Voice adds these too. */}
          <div className="rounded-lg border border-border bg-card p-4">
            {exercises.length === 0 && (
              <p className="mb-2 text-sm text-fg-soft">
                Nothing planned — add an exercise, or tap the mic and say what
                you did.
              </p>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={addExerciseInputRef}
                value={newExerciseName}
                onChange={(e) => setNewExerciseName(e.target.value)}
                onFocus={() => setNewExerciseFocused(true)}
                onBlur={() => setNewExerciseFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addExercise();
                }}
                placeholder="Add exercise — e.g. Planks"
                aria-label="Add exercise"
                className="h-11 w-full min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm font-medium text-fg outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={addExercise}
                disabled={!newExerciseName.trim()}
                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
            {newExerciseFocused && (
              <ExerciseNameSuggestions
                query={newExerciseName}
                onPick={(name) => setNewExerciseName(name)}
              />
            )}
          </div>
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

      {/* Mobile / tablet: compact rest bar pinned above the session
          toolbar. On tablets the toolbar floats (bottom-6, 4rem tall,
          centered, z-40) — the bar sits in the same slot the receipt uses
          above it, never underneath, so ring + countdown stay visible. */}
      {(restTimer.running || restPulse) && (
        <div className="fixed inset-x-4 z-30 bottom-[calc(4rem+var(--safe-bottom)+0.75rem)] md:inset-x-auto md:right-6 md:bottom-[6.25rem] md:w-96 xl:hidden">
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

      {/* Session toolbar — takes the tab bar's slot for the whole session
          (same 4rem + safe-bottom footprint, so the rest bar and receipt
          math above it hold). Minimize → Home, where the resume banner
          brings you back; + → the add-exercise field; the mic in between.
          Solid canvas, no blur: battery and arm's-length legibility. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background pb-[var(--safe-bottom)] md:inset-x-auto md:bottom-6 md:left-1/2 md:w-[440px] md:-translate-x-1/2 md:rounded-full md:border md:pb-0">
        <div className="flex h-16 items-center gap-2 px-3">
          <button
            type="button"
            onClick={() => {
              tapHaptic();
              navigate("/dashboard");
            }}
            aria-label="Minimize workout"
            className="flex h-full w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] text-fg-muted transition hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ChevronDown size={20} />
            <span className="text-[10px] font-semibold tracking-wide">Minimize</span>
          </button>
          <div className="flex min-w-0 flex-1 justify-center">
            <VoiceLogControl
              exercises={exercises}
              units={units}
              onApply={handleVoiceApply}
              onUndo={handleVoiceUndo}
              onEdit={handleVoiceEdit}
              raised={restTimer.running || restPulse}
              recentSetIds={recentSetIds}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              tapHaptic();
              focusAddExercise();
            }}
            aria-label="Add exercise"
            className="flex h-full w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-[14px] text-fg-muted transition hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <Plus size={20} />
            <span className="text-[10px] font-semibold tracking-wide">Exercise</span>
          </button>
        </div>
      </div>

      {/* ⋯ — the rare actions. Discard lives here, never beside Finish. */}
      <Drawer open={menuOpen} onOpenChange={setMenuOpen}>
        <DrawerContent className="px-5 pb-[calc(var(--safe-bottom)+1.5rem)]">
          <DrawerTitle className="eyebrow mt-3 truncate pr-12 text-[10px] leading-4 tracking-[0.14em]">
            {session.name}
          </DrawerTitle>
          <DrawerDescription className="sr-only">More options for this session.</DrawerDescription>
          <div className="mt-3 space-y-2.5">
            <button
              type="button"
              onClick={discardFromMenu}
              className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[16px] border border-border bg-card px-5 text-left transition-transform duration-150 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span>
                <span className="block text-[15px] font-semibold text-destructive">Discard session</span>
                <span className="mt-0.5 block text-[12px] text-fg-muted">
                  Walk away without saving anything
                </span>
              </span>
              <Trash2 size={18} className="shrink-0 text-destructive" />
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Discard confirmation — Finish with zero completed sets routes here
          too. No "save anyway": an empty log has no value. */}
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent className="w-[calc(100%-2.5rem)] max-w-sm rounded-[18px] border-border bg-card p-6 text-fg">
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

      <CardioVitalsSheet
        open={vitalsFor !== null}
        onOpenChange={(open) => {
          if (!open) setVitalsFor(null);
        }}
        exerciseName={exercises.find((e) => e.id === vitalsFor)?.name ?? ""}
        sinceMs={startedAt.current.getTime()}
        units={weightUnit}
        onUseDistance={(value) => {
          // The Watch's distance lands in the first open DIST cell (the
          // last one when all are filled) — the cardio row stores distance
          // in the weight slot, saved as meters by the finish path.
          if (!vitalsFor) return;
          setExercises((current) =>
            current.map((e) => {
              if (e.id !== vitalsFor || e.sets.length === 0) return e;
              const empty = e.sets.findIndex((set) => set.weight.trim() === "");
              const target = empty >= 0 ? empty : e.sets.length - 1;
              return {
                ...e,
                sets: e.sets.map((set, i) => (i === target ? { ...set, weight: value } : set)),
              };
            }),
          );
          setVitalsFor(null);
          toast({ title: "Distance filled from your watch" });
        }}
      />

      {/* Plate math bottom sheet — opened by tapping a filled weight value.
          pb-0: the sheet body below pads the home indicator itself. */}
      <Drawer
        open={plateOpen}
        onOpenChange={(open) => {
          if (!open) setPlateOpen(false);
        }}
      >
        <DrawerContent className="pb-0">
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
