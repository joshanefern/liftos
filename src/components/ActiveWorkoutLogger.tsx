import { CTAButton } from "@/components/GoldButton";
import { ShareButton } from "@/components/ShareButton";
import { VoiceLogControl } from "@/components/logging/VoiceLogControl";
import { CardioVitalsSheet } from "@/components/logging/CardioVitalsSheet";
import { CompletedSetRow } from "@/components/logging/CompletedSetRow";
import { ExerciseList } from "@/components/logging/ExerciseList";
import { RestBlock } from "@/components/logging/RestBlock";
import { RestTimerSheet } from "@/components/logging/RestTimerSheet";
import { SessionBar } from "@/components/logging/SessionBar";
import {
  CLEAR_OF_SESSION_BAR,
  SESSION_PAGE_CLEARANCE,
} from "@/components/logging/sessionBarLayout";
import ExerciseNameSuggestions from "@/components/ExerciseNameSuggestions";
import { SetInputRow, formatWeightForDisplay } from "@/components/logging/SetInputRow";
import { useEnterAdvance } from "@/components/logging/useEnterAdvance";
import { useFoldOnLeave } from "@/components/logging/useFoldOnLeave";
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
import {
  MAX_TEMPLATES,
  TEMPLATE_LIMIT_ERROR,
  useWorkoutTemplates,
} from "@/hooks/useWorkoutTemplates";
import {
  exerciseListChanged,
  sessionToTemplateExercises,
} from "@/lib/sessionToTemplate";
import { templateLimitNotice } from "@/lib/templateLimit";
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
import { FINISH_GUARD_MS, finishGuarded } from "@/lib/finishGuard";
import { selectionHaptic, successHaptic, tapHaptic } from "@/lib/haptics";
import { formatPlateMath, plateBreakdown } from "@/lib/plateMath";
import { detectSessionPRs, type PREvent } from "@/lib/prs";
import { isMetricUnits } from "@/lib/review/inputFormatters";
import {
  loadRestTimerPrefs,
  restTimerSummary,
  saveRestTimerPrefs,
  type RestTimerPrefs,
} from "@/lib/restTimerPrefs";
import {
  currentSetOf,
  openSetIds,
  pinAfterLogging,
  pinFor,
  resolveFocusId,
  restHolds,
  restNextOf,
  restsAfter,
  rowStates,
  setOfLabel,
  setSummary as summarizeSet,
  setsProgress,
  settlePin,
  upNextOf,
  voiceLoggedSet,
  type FocusPin,
  type RestOwner,
} from "@/lib/sessionFocus";
import {
  restoredRecentSetIds,
  restoredRest,
  restoredRestOwner,
  type RestWindow,
} from "@/lib/sessionResume";
import { followsCurrentSet, revealScrollTop, type FollowState } from "@/lib/sessionScroll";
import { removableSetOf, removeSetLabel, withoutSet } from "@/lib/sessionSets";
import { revertVoiceApply, revertVoiceNote } from "@/lib/voiceRevert";
import type { WeightUnit } from "@/lib/warmup";
import type { ActiveSession } from "@/pages/ActiveWorkout";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  Check,
  CheckCheck,
  HeartPulse,
  Minus,
  MoreHorizontal,
  Plus,
  Timer,
  Trash2,
  Trophy,
  Weight,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
/** How many recently-completed set ids voice corrections can reach back to. */
const RECENT_SET_CAP = 20;
/** Scroll lands first; the focus (and its keyboard) follows after this. */
const KEYBOARD_FOCUS_DELAY_MS = 60;
/** Long enough for iOS to finish closing the keyboard. The native shell
    puts the page back at its pre-keyboard offset when the keyboard hides,
    so a scroll issued before that has landed is simply undone. */
const KEYBOARD_CLOSE_MS = 450;
/** How long a jump to the card (an exercise picked, voice Edit) owns the
    scroll position; following the current set waits it out. */
const REVEAL_SETTLE_MS = 700;
/** How long the focus card ignores touches after its layout changed. A
    change puts a different control under a finger that is already coming
    down — a double tap on "Complete set" would land on whatever took its
    place, or on the button again once the page has followed the new set.
    Longer than a double tap, shorter than a deliberate second tap. */
const CARD_SETTLE_MS = 400;
/** How long "Rest complete" stays in the screen-reader live region. */
const REST_ANNOUNCE_MS = 5000;

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
  /** The lifter's manual exercise pick, so a resumed session re-opens on
      the exercise they chose. Absent in progress saved before it existed. */
  focusPin?: FocusPin | null;
  /** Set ids in the order they were logged, most recent first — what a
      spoken "scratch that" means after a resume. */
  recentSetIds?: string[];
  /** The rest that was counting down, as an end time, with the set whose
      logging started it (absent in progress saved before rests had one). */
  rest?: (RestWindow & Partial<RestOwner>) | null;
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

  // Progress saved by an earlier mount of this same session, read once.
  const [restored] = useState(() => restoreProgress(session.startedAt));
  const [exercises, setExercises] = useState<LoggedExercise[]>(
    () => restored?.exercises ?? cloneExercises(session.exercises),
  );
  // The sets as last rendered, for handlers that outlive their render (voice).
  const exercisesRef = useRef(exercises);
  exercisesRef.current = exercises;
  const [notes, setNotes] = useState(() => restored?.notes ?? "");
  // The lifter's manual pick from the exercise list; null = the focus
  // follows the work (lib/sessionFocus decides).
  const [focusPin, setFocusPin] = useState<FocusPin | null>(
    () => restored?.focusPin ?? null,
  );
  // The freshest pin for handlers that outlive their render (voice).
  const focusPinRef = useRef(focusPin);
  focusPinRef.current = focusPin;
  // The one logged set whose cells are open again for fixing. The ref is
  // the latest choice ahead of the render: one tap can open a row and
  // leave another, and the leaving is handled before React re-renders.
  const [editingSetId, setEditingSetIdState] = useState<string | null>(null);
  const editingSetIdRef = useRef<string | null>(null);
  const setEditingSetId = useCallback((id: string | null): void => {
    editingSetIdRef.current = id;
    setEditingSetIdState(id);
  }, []);
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

  // ── Voice logging: apply results from the tap-to-speak control and keep
  // one level of undo. Undo takes back what VOICE changed and nothing the
  // lifter did by hand afterwards (lib/voiceRevert), so it keeps the
  // session before and after the apply rather than one snapshot to restore.
  // Both handlers are called from the render in which the pill was tapped:
  // they read state through functional setters and refs only.
  const voiceUndoRef = useRef<{
    before: LoggedExercise[];
    after: LoggedExercise[];
    note: string | null;
    /** Where the card pointed before the apply, and where the apply left it. */
    pin: FocusPin | null;
    pinAfter: FocusPin | null;
  } | null>(null);

  // Set ids in the order they were completed, MOST RECENT FIRST, by every
  // path (row tick, exercise Done, Complete set, voice). "That was 12" /
  // "scratch that" rewrite the LAST logged set, and rows carry no
  // timestamps — this list is how lib/voiceApply knows which one. A ref:
  // every writer also sets exercises, so the render that follows sees it.
  // It is saved with the progress, so it survives Minimize and a reload.
  const [restoredRecent] = useState(() =>
    restoredRecentSetIds(restored?.recentSetIds, RECENT_SET_CAP),
  );
  const recentSetIdsRef = useRef<string[]>(restoredRecent);
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
    const after = result.exercises as LoggedExercise[];
    const pin = focusPinRef.current;
    const lastLogged = [...result.touched].reverse().find((t) => completed.has(t.setId));
    // The set this log counts as logging, for the rest (lib/sessionFocus
    // voiceLoggedSet) — judged against the session it was applied to. For
    // a log that replaces an earlier one, handleVoiceUndo has just written
    // that session (the earlier log taken back) into the ref.
    const lastNew = voiceLoggedSet(exercisesRef.current, after, result.touched, restForRef.current);
    const pinAfter = lastLogged ? pinAfterLogging(after, pin, lastLogged.exerciseId) : pin;
    setExercises((current) => {
      voiceUndoRef.current = { before: current, after, note: result.note, pin, pinAfter };
      return after;
    });
    if (pinAfter !== pin) setFocusPin(pinAfter);
    if (result.note) {
      setNotes((current) => (current.trim() ? `${current}\n${result.note}` : result.note!));
    }
    // A set logged by voice ends the rest and starts the next one exactly
    // like a set logged by hand.
    if (lastNew) restartRestAfter(after, lastNew.exerciseId, lastNew.setId);
    // A set logged by voice re-lays the card out like one logged by hand —
    // and when it was the workout's last, "Finish workout" has just taken
    // the place of "Complete set" under a finger that may be on its way.
    if (lastLogged) {
      noteCardMoved();
      if (upNextOf(after, pinAfter) === null) holdCardFinish();
    }
  };

  const handleVoiceUndo = (): void => {
    const snapshot = voiceUndoRef.current;
    if (!snapshot) return;
    voiceUndoRef.current = null;
    // Written to the ref as well: a voice log that REPLACES this one is
    // applied in the same breath, before any render, and what it newly
    // logs is judged against the session with this one taken back.
    exercisesRef.current = revertVoiceApply(snapshot.before, snapshot.after, exercisesRef.current);
    setExercises((now) => revertVoiceApply(snapshot.before, snapshot.after, now));
    setNotes((now) => revertVoiceNote(now, snapshot.note));
    // The card goes back to where it pointed — unless the lifter has
    // picked an exercise since, which is the newer choice. The ref again:
    // the replacing log must start from this pin.
    const now = focusPinRef.current;
    const left = snapshot.pinAfter;
    const untouched =
      now === null ||
      (left !== null &&
        now.exerciseId === left.exerciseId &&
        now.hadOpenSets === left.hadOpenSets);
    const pin = untouched ? snapshot.pin : now;
    focusPinRef.current = pin;
    setFocusPin(pin);
  };

  // DOM handles for "take me there" jumps: the focus card, the reps cells
  // it currently has mounted, and the add-exercise field.
  const focusCardRef = useRef<HTMLElement | null>(null);
  const repsInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const addExerciseInputRef = useRef<HTMLInputElement | null>(null);
  // Jumps that must wait for the render that mounts their target: a set id
  // whose reps cell takes the cursor, or (setId null) the card itself.
  const pendingJumpRef = useRef<{ setId: string | null } | null>(null);
  const revealTimeout = useRef<number | null>(null);
  // The current set's row, its "Complete set" and the rest under it — what
  // has to stay clear of the floating bar as the card grows.
  const currentSetWrapRef = useRef<HTMLDivElement | null>(null);
  const followTimeout = useRef<number | null>(null);
  /** When a jump last took the scroll position (see REVEAL_SETTLE_MS). */
  const revealedAtRef = useRef(0);
  /** A field was blurred by the tap that logged a set: its keyboard is on
      the way down, and a scroll issued before it lands is undone. */
  const keyboardClosingRef = useRef(false);
  useEffect(
    () => () => {
      if (revealTimeout.current !== null) window.clearTimeout(revealTimeout.current);
      if (followTimeout.current !== null) window.clearTimeout(followTimeout.current);
    },
    [],
  );

  /** Bring the focus card to the top of the screen — or, when the card is
      too tall for that, as far as keeps its current set clear of the
      session bar (lib/sessionScroll). Measured from the card as it is
      rendered, so it runs AFTER the render that re-pointed the card. If a
      field has the keyboard up, close it first and scroll once it is gone. */
  const revealFocusCard = (): void => {
    revealedAtRef.current = performance.now();
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    if (typing) active.blur();
    const scroll = (): void => {
      const card = focusCardRef.current;
      if (!card) return;
      const set = currentSetWrapRef.current;
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // The margins are the ones the stylesheet gives these two elements
      // (the status bar above, the session bar's footprint below).
      const margin = (el: HTMLElement, side: "scrollMarginTop" | "scrollMarginBottom"): number =>
        parseFloat(window.getComputedStyle(el)[side]) || 0;
      const setBox = set?.getBoundingClientRect();
      window.scrollTo({
        top: revealScrollTop({
          scrollY: window.scrollY,
          viewportHeight: document.documentElement.clientHeight,
          cardTop: card.getBoundingClientRect().top,
          topMargin: margin(card, "scrollMarginTop"),
          current:
            set && setBox
              ? {
                  top: setBox.top,
                  bottom: setBox.bottom,
                  bottomMargin: margin(set, "scrollMarginBottom"),
                }
              : null,
        }),
        behavior: calm ? "instant" : "smooth",
      });
    };
    if (revealTimeout.current !== null) window.clearTimeout(revealTimeout.current);
    if (!typing) {
      scroll();
      return;
    }
    revealTimeout.current = window.setTimeout(scroll, KEYBOARD_CLOSE_MS);
  };

  /** Point the focus card at an exercise the lifter chose. The page goes
      to the card once it shows that exercise: where its current set sits
      is not known before. */
  const pickExercise = (exerciseId: string): void => {
    selectionHaptic();
    noteCardMoved();
    setFocusPin(pinFor(exercises, exerciseId));
    setEditingSetId(null);
    setVestEditing(null);
    pendingJumpRef.current = { setId: null };
  };

  /** Receipt → Edit: point the focus card at the first touched exercise,
      re-open the touched set and put the cursor in its reps cell. The
      first summary line's exercise name is the fallback target when
      nothing was touched (a note). */
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
    setFocusPin(pinFor(exercises, exerciseId));
    setVestEditing(null);
    // A logged set renders folded — open it so its cells exist to land on.
    setEditingSetId(touched?.setId ?? null);
    pendingJumpRef.current = { setId: touched?.setId ?? null };
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
          ? { ...templateLimitNotice(MAX_TEMPLATES), variant: "destructive" }
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
    const id = `exercise-${Date.now()}`;
    const kind = inferKind(name);
    // Adding an exercise means "this is what I'm doing" — the focus card
    // turns to it rather than leaving it as a row at the end of the list.
    setFocusPin({ exerciseId: id, hadOpenSets: true });
    setEditingSetId(null);
    setVestEditing(null);
    pendingJumpRef.current = { setId: null };
    setExercises((current) => [
      ...current,
      {
        id,
        name,
        kind,
        // Cardio logs minutes, so the row is saved as timed — the same
        // shape the workout builder gives a cardio block.
        ...(kind === "cardio" ? { tracking: "time" as const } : {}),
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

  // The focus card sits out a beat after its layout changes (see
  // CARD_SETTLE_MS), and the exercise list with it: whatever the card
  // gains or loses moves the rows under it. Called by every tap that
  // re-lays the card out, and when the rest block leaves on its own.
  const [cardSettling, setCardSettling] = useState(false);
  const cardSettleTimeout = useRef<number | null>(null);
  const noteCardMoved = (): void => {
    setCardSettling(true);
    if (cardSettleTimeout.current !== null) window.clearTimeout(cardSettleTimeout.current);
    cardSettleTimeout.current = window.setTimeout(() => setCardSettling(false), CARD_SETTLE_MS);
  };

  // The card's "Finish workout" sits out longer, once: right after the
  // workout's last open set is logged, when it has just taken the place
  // of "Complete set" (lib/finishGuard). The time is what decides; the
  // state only keeps the button from answering the touch at all — no
  // press, no haptic — and changes nothing about how it looks.
  const lastSetLoggedAtRef = useRef<number | null>(null);
  const [finishHeld, setFinishHeld] = useState(false);
  const finishHoldTimeout = useRef<number | null>(null);
  const holdCardFinish = (): void => {
    lastSetLoggedAtRef.current = performance.now();
    setFinishHeld(true);
    if (finishHoldTimeout.current !== null) window.clearTimeout(finishHoldTimeout.current);
    finishHoldTimeout.current = window.setTimeout(() => setFinishHeld(false), FINISH_GUARD_MS);
  };

  // The lifter's rest timer setting (lib/restTimerPrefs): off until they
  // add it, and the length every new rest runs. Remembered across
  // workouts; the ref serves voice, whose handlers outlive their render.
  const [restPrefs, setRestPrefs] = useState<RestTimerPrefs>(() => loadRestTimerPrefs());
  const restPrefsRef = useRef(restPrefs);
  restPrefsRef.current = restPrefs;
  const [restSheetOpen, setRestSheetOpen] = useState(false);

  // Rest countdown with a brief raspberry pulse + haptic when it hits zero.
  // A rest that was still counting when the logger last unmounted
  // (Minimize, reload) is taken up where it stands — its own length, and
  // the set that started it, whatever the setting says now.
  const [restPulse, setRestPulse] = useState(false);
  const restPulseTimeout = useRef<number | null>(null);
  // The set whose logging started the rest on screen (lib/sessionFocus
  // "Rest"): the rest is the pause before that exercise's next set, and it
  // ends with that exercise.
  const [restFor, setRestFor] = useState<RestOwner | null>(() =>
    restoredRest(restored?.rest, Date.now()) ? restoredRestOwner(restored?.rest) : null,
  );
  // For voice, whose handlers outlive their render.
  const restForRef = useRef(restFor);
  restForRef.current = restFor;
  // Screen readers hear the end of rest from a region that is mounted for
  // the whole session: one created together with its text, inside a block
  // that leaves 1.6s later, is easily never spoken. Cleared after a few
  // seconds so the next rest writes a change, not the same string.
  const [restAnnouncement, setRestAnnouncement] = useState("");
  const restAnnounceTimeout = useRef<number | null>(null);
  const restTimer = useRestTimer(() => {
    setRestPulse(true);
    if (restPulseTimeout.current !== null) window.clearTimeout(restPulseTimeout.current);
    restPulseTimeout.current = window.setTimeout(() => {
      restPulseTimeout.current = null;
      setRestPulse(false);
      setRestFor(null);
      noteCardMoved();
    }, 1600);
    setRestAnnouncement("Rest complete");
    if (restAnnounceTimeout.current !== null) window.clearTimeout(restAnnounceTimeout.current);
    restAnnounceTimeout.current = window.setTimeout(
      () => setRestAnnouncement(""),
      REST_ANNOUNCE_MS,
    );
  }, restored?.rest);
  /** End the rest on screen, quietly: no buzz, no "Rest complete", no
      pulse — whether it was counting or has just run out. What logging a
      set, un-marking the set that started it, or turning the timer off
      does to a rest. */
  const { skip: skipRestTimer } = restTimer;
  const endRest = useCallback((): void => {
    skipRestTimer();
    setRestFor(null);
    if (restPulseTimeout.current !== null) window.clearTimeout(restPulseTimeout.current);
    restPulseTimeout.current = null;
    setRestPulse(false);
    if (restAnnounceTimeout.current !== null) window.clearTimeout(restAnnounceTimeout.current);
    restAnnounceTimeout.current = null;
    setRestAnnouncement("");
  }, [skipRestTimer]);
  /** A set of `exerciseId` was just logged. Any rest ends; a new one
      starts only when the lifter has the timer on and that exercise still
      has a working set to rest before. Called from voice as well, so it
      reads the setting through its ref. */
  const restartRestAfter = (after: LoggedExercise[], exerciseId: string, setId: string): void => {
    endRest();
    const prefs = restPrefsRef.current;
    if (!prefs.on || !restsAfter(after, exerciseId)) return;
    restTimer.start(prefs.seconds);
    setRestFor({ exerciseId, setId });
  };
  /** The sheet's changes apply at once and are remembered. Turning the
      timer off ends a rest that is counting; a new length is for the next
      rest (+30 sec and Skip rest look after the one running). */
  const updateRestPrefs = (next: RestTimerPrefs): void => {
    const kept = saveRestTimerPrefs(next);
    setRestPrefs(kept);
    if (!kept.on) endRest();
  };
  useEffect(
    () => () => {
      if (restPulseTimeout.current !== null) window.clearTimeout(restPulseTimeout.current);
      if (restAnnounceTimeout.current !== null) window.clearTimeout(restAnnounceTimeout.current);
      if (cardSettleTimeout.current !== null) window.clearTimeout(cardSettleTimeout.current);
      if (finishHoldTimeout.current !== null) window.clearTimeout(finishHoldTimeout.current);
    },
    [],
  );

  // Every edit lands in localStorage so Minimize (or the app being killed)
  // and coming back through the Home resume banner restores the session
  // exactly: sets, notes, the picked exercise, the order sets were logged
  // in, and a rest that is still counting. Skipped once the session is
  // over (recap up, or discarded) — a write after the keys were cleared
  // would leave a stray entry behind.
  const sessionOverRef = useRef(false);
  const { endsAt: restEndsAt, totalSeconds: restTotalSeconds } = restTimer;
  useEffect(() => {
    if (summary || sessionOverRef.current) return;
    try {
      window.localStorage.setItem(
        ACTIVE_WORKOUT_PROGRESS_KEY,
        JSON.stringify({
          startedAt: session.startedAt,
          exercises,
          notes,
          focusPin,
          // Every writer of the list also sets `exercises`, so this effect
          // runs again and reads the updated ref.
          recentSetIds: recentSetIdsRef.current,
          rest:
            restEndsAt !== null
              ? { endsAt: restEndsAt, totalSeconds: restTotalSeconds, ...(restFor ?? {}) }
              : null,
        } satisfies PersistedProgress),
      );
    } catch {
      /* storage full/unavailable — resume just falls back to the bare seed */
    }
  }, [exercises, notes, focusPin, restEndsAt, restTotalSeconds, restFor, session.startedAt, summary]);
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
  /** Sheet → sheet, one after the other: two vaul drawers moving at once
      fight over the page's scroll lock. */
  const restTimerFromMenu = (): void => {
    setMenuOpen(false);
    window.setTimeout(() => setRestSheetOpen(true), 520);
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
  // The recap opens at its title, wherever the logger was scrolled to
  // when Finish was tapped. Before paint, so it is never seen cut off.
  useLayoutEffect(() => {
    if (finished) window.scrollTo({ top: 0, behavior: "instant" });
  }, [finished]);
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

  // ── Focus — the one exercise the card shows, and its current set ──

  const focusId = useMemo(() => resolveFocusId(exercises, focusPin), [exercises, focusPin]);
  const focus = useMemo(
    () => exercises.find((e) => e.id === focusId) ?? null,
    [exercises, focusId],
  );
  const current = useMemo(() => (focus ? currentSetOf(focus) : null), [focus]);
  /** The set "Next:" names — the current set, or the first open one in the
      workout while a finished exercise is being looked over. */
  const next = useMemo(() => upNextOf(exercises, focusPin), [exercises, focusPin]);
  // A pick releases itself once its exercise is finished. Settled here, on
  // every change to the sets, so voice and undo are covered with the taps.
  useEffect(() => {
    setFocusPin((pin) => settlePin(exercises, pin));
  }, [exercises]);
  // Only a set that is still logged, in the card, can be open for fixing.
  const editingId =
    editingSetId !== null &&
    focus?.sets.some((set) => set.id === editingSetId && set.completed) === true
      ? editingSetId
      : null;
  // A logged set open for fixing: its numbers save as they are typed, it
  // stays logged, and it folds back to its one line once the lifter is
  // done with it — a tap anywhere else, focus moving on, Enter on its last
  // field, or picking something else. There is no Save.
  const editingSetWrapRef = useRef<HTMLDivElement | null>(null);
  useFoldOnLeave(editingSetWrapRef, editingId, (id) => {
    // The same tap opened another logged set: that one stays open.
    if (editingSetIdRef.current !== id) return;
    // Folding shortens the card under a finger that may be coming back
    // down (a second tap, "+30 sec" twice): the card sits out a beat,
    // as after any other change to its layout.
    noteCardMoved();
    setEditingSetId(null);
  });
  // A set that stops being logged while it is open ("scratch that", voice
  // Undo), or that leaves the card, is not being fixed any more: logged
  // again later, it comes back folded.
  useEffect(() => {
    if (editingSetId !== null && editingId === null) setEditingSetId(null);
  }, [editingSetId, editingId, setEditingSetId]);
  /** The numbers of a logged set were tapped: open its cells in place.
      Opening does not make the card sit out: a quick second tap would
      pass through it to the page and fold the row it just opened. */
  const openLoggedSet = (setId: string): void => {
    setVestEditing(null);
    setEditingSetId(setId);
  };

  // Rest is a pause BEFORE the next set of the exercise that started it.
  // It ends — quietly — the moment that stops being true, whatever made it
  // so: the exercise finished (a set logged, "Complete remaining sets",
  // a set removed, voice), or the set that started it un-marked (a tap on
  // its check, "scratch that", voice Undo). A countdown left running would
  // buzz at an exercise that is over. Before paint, so the card never
  // shows a rest for a set that is no longer logged.
  const { running: resting } = restTimer;
  const restLive = resting || restPulse;
  useLayoutEffect(() => {
    if (restLive && !restHolds(exercises, restFor)) endRest();
  }, [restLive, exercises, restFor, endRest]);
  /** The set the rest is a pause before — its "Next:" line. */
  const restNext = useMemo(
    () => restNextOf(exercises, restFor, focusPin),
    [exercises, restFor, focusPin],
  );
  const restShown = restLive && restNext !== null;

  /** One line under the exercise name: what this lift looked like last
      time, or the plan, or an honest "first time". */
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

  // ── Cursor travel (reps → weight → next set) ──

  // Only the focused exercise has cells on screen, so the cursor travels
  // within it; crossing to the next exercise is the focus moving on.
  const focusSetIds = focus ? focus.sets.map((set) => set.id) : [];
  const { registerRepsRef, registerWeightRef, focusWeight, focusNextReps } =
    useEnterAdvance(focusSetIds);
  /** Rows register with the advance hook AND the jump map. */
  const registerRowRepsRef = (id: string) => (el: HTMLInputElement | null) => {
    repsInputRefs.current[id] = el;
    registerRepsRef(id)(el);
  };
  // Keyboard flow: Enter on the current set's weight logs it, and the
  // cursor follows to whichever set is current NEXT — a row that may only
  // mount with the render the completion causes.
  const followCurrentRef = useRef(false);
  const currentSetId = current?.set.id ?? null;
  useEffect(() => {
    if (pendingJumpRef.current !== null) {
      const { setId } = pendingJumpRef.current;
      pendingJumpRef.current = null;
      const input = setId !== null ? (repsInputRefs.current[setId] ?? null) : null;
      if (input) jumpToInput(null, input);
      else revealFocusCard();
    }
    if (followCurrentRef.current) {
      followCurrentRef.current = false;
      const input = currentSetId !== null ? (repsInputRefs.current[currentSetId] ?? null) : null;
      if (input) {
        // Focus alone does not scroll a field that is inside the viewport
        // but under the floating bar: bring the set clear of it first.
        currentSetWrapRef.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
        input.focus({ preventScroll: true });
      }
    }
  });

  // Keep the current set clear of the floating bar. Every logged set folds
  // to a row above it and the rest opens under its button, so the card
  // grows downward while the bar stays put; without this the primary
  // button slides underneath it and taps land on Minimize or the mic.
  // Runs after the render that moved things, for every way a set gets
  // logged (button, Enter, warm-up tick, voice). "nearest" leaves the page
  // alone when the set is already in clear view. The rest block LEAVING
  // moves nothing: a rest runs out on its own, and the page stays where
  // the lifter has it (lib/sessionScroll).
  const followedRef = useRef<FollowState | null>(null);
  const focusedId = focus?.id ?? null;
  const followedFocusRef = useRef(focusedId);
  useEffect(() => {
    const was = followedRef.current;
    const now: FollowState = { setId: currentSetId, restShown };
    followedRef.current = now;
    const movedOn = followedFocusRef.current !== focusedId;
    followedFocusRef.current = focusedId;
    if (!followsCurrentSet(was, now)) return;
    const wrap = currentSetWrapRef.current;
    if (!wrap) return;
    const keyboardClosing = keyboardClosingRef.current;
    keyboardClosingRef.current = false;
    // A jump to the card is already placing the page.
    if (performance.now() - revealedAtRef.current < REVEAL_SETTLE_MS) return;
    // Never scroll under a keyboard that is up: the lifter is typing, and
    // the shell would put the page back when it closes.
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
    // The card has moved on to another exercise by itself (the last set of
    // the previous one was logged): "nearest" would leave the page where
    // it was, with the new exercise's NAME above the fold — and the next
    // set logged against an exercise the lifter cannot see named.
    if (movedOn) {
      revealFocusCard();
      return;
    }
    const scroll = (): void => {
      const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      currentSetWrapRef.current?.scrollIntoView({
        behavior: calm ? "instant" : "smooth",
        block: "nearest",
      });
    };
    if (followTimeout.current !== null) window.clearTimeout(followTimeout.current);
    if (!keyboardClosing) {
      scroll();
      return;
    }
    followTimeout.current = window.setTimeout(scroll, KEYBOARD_CLOSE_MS);
  }, [currentSetId, restShown, focusedId]);

  /** The tap that logs a set ends the typing: close the keyboard so the
      page can follow the next set once it is down. */
  const closeKeyboardBeforeFollow = (): void => {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      active.blur();
      keyboardClosingRef.current = true;
    }
  };

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

  /** A set of `exerciseId` was just logged. Whatever rest was running
      ends with it, and a new one starts only between sets of this
      exercise (restartRestAfter). With nothing left to log anywhere the
      card stays on this exercise. */
  const afterLogging = (after: LoggedExercise[], exerciseId: string, setId: string): void => {
    noteCardMoved();
    restartRestAfter(after, exerciseId, setId);
    // "Finish workout" is about to stand where this tap landed.
    if (upNextOf(after, focusPin) === null) holdCardFinish();
    setFocusPin(pinAfterLogging(after, focusPin, exerciseId));
  };

  /** Log one open set. Blank cells take their hints, so the log stays
      honest about what the lifter saw when they tapped. */
  const logSet = (exerciseId: string, setId: string) => {
    const exercise = exercises.find((e) => e.id === exerciseId);
    const index = exercise?.sets.findIndex((s) => s.id === setId) ?? -1;
    if (!exercise || index < 0) return;
    const set = exercise.sets[index];
    if (set.completed) return;
    // The Enter flow keeps its keyboard: the cursor travels to the next set.
    if (!followCurrentRef.current) closeKeyboardBeforeFollow();

    let reps = set.reps;
    let weight = set.weight;
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

    const apply = (list: LoggedExercise[]): LoggedExercise[] =>
      list.map((e) =>
        e.id === exerciseId
          ? {
              ...e,
              sets: e.sets.map((s) =>
                s.id === setId ? { ...s, completed: true, reps, weight } : s,
              ),
            }
          : e,
      );
    setExercises(apply);
    afterLogging(apply(exercises), exerciseId, setId);
    if (!set.isWarmup) {
      tapHaptic();
      celebrateIfRecord(exercise, weight, reps);
    }
  };

  /** One tap on a logged set's check: it is an open set again, numbers
      kept, no question asked. The focus rules decide what is current from
      there (an earlier set comes back as the current one; a finished
      exercise is not finished any more). If this set's logging started
      the rest that is running, that rest ends with it; any other rest runs
      on. It stops being "the last logged set" for voice corrections. */
  const unmarkSet = (exerciseId: string, setId: string): void => {
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise?.sets.some((s) => s.id === setId && s.completed)) return;
    noteCardMoved();
    selectionHaptic();
    setEditingSetId(null);
    recentSetIdsRef.current = recentSetIdsRef.current.filter((id) => id !== setId);
    if (restFor?.setId === setId) endRest();
    setExercises((list) =>
      list.map((e) =>
        e.id === exerciseId
          ? { ...e, sets: e.sets.map((s) => (s.id === setId ? { ...s, completed: false } : s)) }
          : e,
      ),
    );
  };

  /** The focus card's primary action. */
  const completeCurrentSet = (): void => {
    if (!focus || !current) return;
    setEditingSetId(null);
    logSet(focus.id, current.set.id);
  };

  /** "Complete remaining sets": tick every open set of one exercise,
      filling hints in order. Sets already logged are left exactly as they
      were logged. */
  const completeRemainingSets = (exerciseId: string) => {
    const exercise = exercises.find((e) => e.id === exerciseId);
    if (!exercise) return;
    closeKeyboardBeforeFollow();

    const tracking = trackingFor(exercise);
    const timed = tracking === "time";
    const mode = effortModeFor(exercise);
    const hist = historyFor.get(exercise.name.trim().toLowerCase());
    const histEffort = timed ? hist?.duration : hist?.reps;
    let prevReps: string | null = null;
    let prevWeight: string | null = null;
    const filled = exercise.sets.map((set) => {
      const targetEffort = timed ? set.targetTime : set.targetReps;
      if (set.completed) {
        // Logged values still lead the cascade for the sets after them.
        if (!set.isWarmup) {
          if (set.reps.trim() !== "") prevReps = set.reps;
          if (set.weight.trim() !== "") prevWeight = set.weight;
        }
        return set;
      }
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
    const flipped = openSetIds(exercise);
    if (flipped.length === 0) return;
    noteSetsCompleted(flipped);
    const apply = (list: LoggedExercise[]): LoggedExercise[] =>
      list.map((e) => (e.id === exerciseId ? { ...e, sets: filled } : e));
    setExercises(apply);
    setEditingSetId(null);
    tapHaptic();
    // The exercise is finished, so no rest follows — and one running ends.
    afterLogging(apply(exercises), exerciseId, flipped[flipped.length - 1]);
  };

  /** Take an open set off an exercise — the inverse of "Add set", offered
      in the ⋯ sheet so the card gains no control for a rare action.
      lib/sessionSets holds the rules (open rows only, never the only
      working set). With nothing left to log anywhere the card stays on
      this exercise, the same as after logging its last set. */
  const removeSet = (exerciseId: string, setId: string): void => {
    const after = withoutSet(exercises, exerciseId, setId);
    if (after === exercises) return;
    noteCardMoved();
    selectionHaptic();
    setExercises((current) => withoutSet(current, exerciseId, setId));
    setFocusPin(pinAfterLogging(after, focusPin, exerciseId));
  };
  // What the ⋯ sheet offers to remove: the focused exercise's last open set.
  const removable = focus ? removableSetOf(focus) : null;

  const addSet = (exerciseId: string) => {
    noteCardMoved();
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
      sessionOverRef.current = true;
      clearActiveWorkoutStorage();
      if (saved) setSavedLog(saved);
      endRest();
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

  /** The focus card's "Finish workout". Unlike the header's Finish it can
      turn up under a finger that is still tapping "Complete set". */
  const finishFromCard = (): void => {
    if (finishGuarded(lastSetLoggedAtRef.current, performance.now())) return;
    void handleFinish();
  };

  /** Abandon the session: same teardown as a successful finish, minus the
      save. Navigating away unmounts the component, which releases the wake
      lock and clears the elapsed/rest intervals via their effect cleanups —
      the rest is not skipped by hand, since that state change would re-run
      the save-progress effect on the keys just cleared. */
  const handleDiscard = () => {
    setDiscardOpen(false);
    sessionOverRef.current = true;
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
              {/* Leaving the recap clears nothing: Finish already cleared
                  this session's keys, and whatever is in storage by now
                  belongs to a workout started since. */}
              <CTAButton to="/dashboard" fullWidth className={savedLog ? "mt-3" : "mt-6"}>
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

  // ── Focus card ──

  const quietActionClass =
    "relative inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-3 text-xs font-medium text-fg-muted transition after:absolute after:-inset-1 after:content-[''] hover:border-fg-soft hover:text-fg active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

  /** The focus card's content for one exercise. A render helper, not a
      component: a component declared inside this one would be a new type
      on every render and remount its inputs mid-keystroke. */
  const renderFocus = (exercise: LoggedExercise) => {
    const tracking = trackingFor(exercise);
    const mode = effortModeFor(exercise);
    const isCardio = exercise.kind === "cardio";
    const isWeighted = !isCardio && exercise.kind !== "bodyweight";
    const unitsLabel = isCardio ? (isMetric ? "km" : "mi") : units;
    const states = rowStates(exercise);
    const progress = setsProgress(exercise);
    const remaining = openSetIds(exercise);
    // The reps⇄time flip lives on the name, and only for exercises where
    // it is a plausible want — "Squat" never grows a mystery tap.
    const canFlip = !isCardio && (tracking === "time" || TIMED_TOGGLE_HINT.test(exercise.name));
    // Working sets number 1..n; warm-up rows show a W chip instead.
    let workingOrdinal = 0;
    const ordinals = exercise.sets.map((set) => (set.isWarmup ? 0 : workingOrdinal++));
    const lineSet =
      current?.set ?? exercise.sets.filter((set) => !set.isWarmup).at(-1) ?? exercise.sets.at(-1);
    // Rest sits UNDER the primary button, never above it: whatever the
    // rest does, the set's cells and the button stay where they are. Its
    // "Next:" is the next set of the exercise that started it — the one
    // the card shows. While the lifter looks at another exercise the
    // block says whose rest it is instead: that exercise's set under this
    // card's "Complete set" would be two answers to "what next".
    const restIsElsewhere = restFor !== null && restFor.exerciseId !== exercise.id;
    const restBlock =
      restShown && restNext !== null ? (
        <div className="mt-3">
          <RestBlock
            remaining={restTimer.remaining}
            progress={restTimer.progress}
            finished={restPulse && !restTimer.running}
            ownerName={restIsElsewhere ? restNext.exercise.name : null}
            nextName={restNext.exercise.name}
            nextOrdinal={restNext.ordinal}
            nextTotal={restNext.workingTotal}
            onExtend={() => restTimer.extend(30)}
            onSkip={() => {
              noteCardMoved();
              endRest();
            }}
            onOpenSettings={() => setRestSheetOpen(true)}
          />
        </div>
      ) : null;
    const nameHeading = (
      <h2 className="break-words text-[20px] font-semibold capitalize leading-tight tracking-tight text-fg">
        {exercise.name}
      </h2>
    );

    return (
      <>
        <p className="eyebrow !text-primary">Now</p>
        <div className="mt-1 flex items-start justify-between gap-3">
          {canFlip ? (
            <button
              type="button"
              onClick={() => setTracking(exercise.id, tracking === "time" ? "reps" : "time")}
              className="relative min-w-0 rounded-md text-left after:absolute after:-inset-1.5 after:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {nameHeading}
              <span className="caption mt-0.5 block">
                {tracking === "time"
                  ? "timed · tap to switch to reps"
                  : "reps · tap to switch to time"}
              </span>
            </button>
          ) : (
            <div className="min-w-0">
              {nameHeading}
              {isCardio && <p className="caption mt-0.5">cardio · minutes</p>}
            </div>
          )}
          {current && (
            <span className="mono shrink-0 pt-1 text-[12px] font-medium text-fg-muted">
              {setOfLabel(current.ordinal, current.workingTotal)}
            </span>
          )}
        </div>
        {lineSet && <p className="caption mt-1">{previousLine(exercise, lineSet)}</p>}

        <div className="mt-3 space-y-1">
          {exercise.sets.map((set, setIndex) => {
            const state = states[setIndex];
            const isCurrent = state === "current";
            const editing = editingId === set.id;
            const openWarmup = state === "open" && set.isWarmup === true;
            return (
              <div
                key={set.id}
                ref={isCurrent ? currentSetWrapRef : editing ? editingSetWrapRef : undefined}
                className={cn(
                  (isCurrent || editing) && "py-1.5",
                  isCurrent && CLEAR_OF_SESSION_BAR,
                )}
              >
                {state === "done" && !editing ? (
                  <CompletedSetRow
                    idx={ordinals[setIndex]}
                    isWarmup={set.isWarmup === true}
                    summary={summarizeSet(set, mode, unitsLabel)}
                    onOpen={() => openLoggedSet(set.id)}
                    onUnmark={() => unmarkSet(exercise.id, set.id)}
                  />
                ) : (
                  <SetInputRow
                    idx={ordinals[setIndex]}
                    showLabels={isCurrent || editing}
                    scoreboard
                    quiet={state === "open"}
                    // The current set logs with "Complete set" alone and a
                    // later working set waits its turn, so only an open
                    // warm-up (tick) and a set open for fixing (its check,
                    // which un-marks it) show the done column.
                    hideDone={!openWarmup && !editing}
                    animateDone={!editing}
                    effort={mode}
                    reps={set.reps}
                    weight={set.weight}
                    done={set.completed}
                    unitsLabel={unitsLabel}
                    // A logged set being fixed shows what it holds: a
                    // value emptied here reads "—" (or "BW") — the set is
                    // kept without it — never the next set's suggestion.
                    // No hint also means no tap-to-fill putting one back.
                    repsHint={editing ? null : hintFor(exercise, setIndex, "reps")}
                    weightHint={editing ? null : hintFor(exercise, setIndex, "weight")}
                    isWarmup={set.isWarmup === true}
                    bodyweight={exercise.kind === "bodyweight"}
                    registerRepsRef={registerRowRepsRef(set.id)}
                    registerWeightRef={registerWeightRef(set.id)}
                    onRepsChange={(v) => updateSetField(exercise.id, set.id, "reps", v)}
                    onWeightChange={(v) => updateSetField(exercise.id, set.id, "weight", v)}
                    onRepsEnter={() => focusWeight(set.id)}
                    onDoneTap={() =>
                      set.completed ? unmarkSet(exercise.id, set.id) : logSet(exercise.id, set.id)
                    }
                    onWeightEnter={() => {
                      if (editing) {
                        // Its last field: the fix is in (edits save as
                        // they are typed), so the row folds.
                        noteCardMoved();
                        setEditingSetId(null);
                      } else if (isCurrent) {
                        followCurrentRef.current = true;
                        completeCurrentSet();
                      } else {
                        // Only a warm-up logs from here; a later working
                        // set waits its turn as the current one.
                        if (openWarmup) logSet(exercise.id, set.id);
                        focusNextReps(set.id);
                      }
                    }}
                    // A set open for fixing is being typed into: a tap on
                    // its weight edits it rather than opening plate math.
                    onWeightValueTap={isWeighted && !editing ? openPlateMath : undefined}
                  />
                )}
                {isCurrent ? (
                  <button
                    type="button"
                    onClick={completeCurrentSet}
                    className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-[14.5px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  >
                    <Check size={16} strokeWidth={2.5} />
                    Complete set
                  </button>
                ) : null}
                {isCurrent ? restBlock : null}
              </div>
            );
          })}
        </div>

        {current === null && (
          <>
            {next !== null ? (
              <button
                type="button"
                onClick={() => {
                  // The next exercise's "Complete set" lands where this
                  // button is: a second tap must not log a set on it.
                  noteCardMoved();
                  setFocusPin(null);
                  setEditingSetId(null);
                  setVestEditing(null);
                  pendingJumpRef.current = { setId: null };
                }}
                className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-primary px-4 py-2.5 text-center text-[14.5px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="min-w-0 break-words">
                  Continue to <span className="capitalize">{next.exercise.name}</span>
                </span>
                <ArrowRight size={16} strokeWidth={2.5} className="shrink-0" />
              </button>
            ) : (
              <CTAButton
                onClick={finishFromCard}
                disabled={saving}
                variant="accent"
                fullWidth
                className={cn("mt-3", finishHeld && "pointer-events-none")}
              >
                <Check size={16} strokeWidth={2.5} />
                {saving ? "Saving…" : "Finish workout"}
              </CTAButton>
            )}
            {restBlock}
          </>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => addSet(exercise.id)}
            className={quietActionClass}
          >
            <Plus size={14} />
            Add set
          </button>
          {/* An action, never a status: offered only while there are
              several sets left to tick ("Complete set" covers one). */}
          {remaining.length >= 2 && (
            <button
              type="button"
              onClick={() => completeRemainingSets(exercise.id)}
              className={quietActionClass}
            >
              <CheckCheck size={14} />
              Complete remaining sets
            </button>
          )}
          {progress.complete && (
            <p className="inline-flex min-h-9 items-center gap-1.5 px-1 text-xs font-medium text-fg-muted">
              <Check size={13} strokeWidth={2.5} className="text-primary" />
              All sets complete
            </p>
          )}
          {/* Cardio extras as compact icon chips: added weight (vest /
              pack) and live vitals (Pro). The chip grows a value only
              once a vest weight is set. */}
          {isCardio && (
            <div className="ml-auto flex items-center gap-1.5">
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
        {isCardio && vestEditing === exercise.id && (
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
      </>
    );
  };

  // ── Active logging screen ──

  return (
    <div
      className={cn(
        "scoreboard-reveal relative mx-auto min-h-screen w-full max-w-7xl p-6 md:p-10 lg:p-12",
        SESSION_PAGE_CLEARANCE,
      )}
    >
      {/* Solid canvas: no grain, no blur — battery + arm's-length legibility. */}
      <div aria-hidden className="fixed inset-0 z-[-1] bg-background" />

      {/* End of rest, for screen readers (see restAnnouncement). */}
      <p role="status" aria-live="polite" className="sr-only">
        {restAnnouncement}
      </p>

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
          The big number this screen is about is the NEXT SET, below.
          w-0 + min-w-full: the header takes the page's width but adds
          nothing to it, so a long session name (one unbreakable line)
          truncates instead of widening the page and pushing Finish and ⋯
          off the screen. */}
      <header className="relative mb-5 w-0 min-w-full animate-reveal-up">
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

      <div className="relative grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {/* The focus card — the ONE place sets are logged. It shows the
              focused exercise whole: logged sets folded to a line, the
              current set open under the primary button, later sets quiet
              but editable. Rest shows up in here too, right under that
              button. */}
          {exercises.length > 0 && (
            <section
              ref={focusCardRef}
              aria-label={focus ? `Now: ${focus.name}` : "All sets done"}
              className={cn(
                "relative scroll-mt-[calc(var(--safe-top)+1rem)] overflow-hidden rounded-[18px] border border-primary/35 bg-card p-4 animate-reveal-up md:p-5",
                cardSettling && "pointer-events-none",
              )}
              style={{ animationDelay: "60ms" }}
            >
              {focus ? (
                renderFocus(focus)
              ) : (
                <>
                  <p className="eyebrow !text-primary">Now</p>
                  <h2 className="mt-1 text-[20px] font-semibold leading-tight tracking-tight text-fg">
                    All sets done
                  </h2>
                  <p className="caption mt-1">
                    Nice work. Finish to save it, or pick an exercise below to add more.
                  </p>
                  <CTAButton
                    onClick={finishFromCard}
                    disabled={saving}
                    variant="accent"
                    fullWidth
                    className={cn("mt-3", finishHeld && "pointer-events-none")}
                  >
                    <Check size={16} strokeWidth={2.5} />
                    {saving ? "Saving…" : "Finish workout"}
                  </CTAButton>
                </>
              )}
            </section>
          )}

          {exercises.length > 0 && (
            <ExerciseList
              items={exercises.map((exercise) => ({
                id: exercise.id,
                name: exercise.name,
                progress: setsProgress(exercise),
                focused: exercise.id === focusId,
              }))}
              onPick={pickExercise}
              settling={cardSettling}
            />
          )}

          <div className="space-y-3">
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
          </div>
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden xl:sticky xl:top-6 xl:block xl:self-start">
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

      {/* Minimize → Home, where the resume banner brings you back; the mic;
          + → the add-exercise field. */}
      <SessionBar
        onMinimize={() => {
          tapHaptic();
          navigate("/dashboard");
        }}
        onAddExercise={() => {
          tapHaptic();
          focusAddExercise();
        }}
      >
        <VoiceLogControl
          exercises={exercises}
          units={units}
          onApply={handleVoiceApply}
          onUndo={handleVoiceUndo}
          onEdit={handleVoiceEdit}
          recentSetIds={recentSetIds}
        />
      </SessionBar>

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
              onClick={restTimerFromMenu}
              className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[16px] border border-border bg-card px-5 text-left transition-transform duration-150 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-fg">Rest timer</span>
                <span className="mt-0.5 block text-[12px] text-fg-muted">
                  {restTimerSummary(restPrefs)}
                </span>
              </span>
              <Timer size={18} className="shrink-0 text-fg-muted" />
            </button>
            {focus !== null && removable !== null && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  removeSet(focus.id, removable.set.id);
                }}
                className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[16px] border border-border bg-card px-5 text-left transition-transform duration-150 active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-fg">
                    {removeSetLabel(removable)}
                  </span>
                  <span className="mt-0.5 block break-words text-[12px] text-fg-muted">
                    Takes it off <span className="capitalize">{focus.name}</span>. Logged sets stay.
                  </span>
                </span>
                <Minus size={18} className="shrink-0 text-fg-muted" />
              </button>
            )}
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

      {/* Rest timer: on/off and length, from ⋯ or a running countdown. */}
      <RestTimerSheet
        open={restSheetOpen}
        onOpenChange={setRestSheetOpen}
        prefs={restPrefs}
        onChange={updateRestPrefs}
      />

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

export default ActiveWorkoutLogger;
