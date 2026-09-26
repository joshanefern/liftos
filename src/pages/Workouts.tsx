import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { CTAButton } from "@/components/GoldButton";
import ExerciseNameSuggestions from "@/components/ExerciseNameSuggestions";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { PendingReviewsCard } from "@/components/review/PendingReviewsCard";
import type { WorkoutExercise } from "@/data/liftosMock";
import { starterPrograms, type StarterProgram } from "@/data/starterPrograms";
import { TEMPLATE_LIMIT_ERROR, MAX_TEMPLATES, useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import {
  ACTIVE_WORKOUT_STORAGE_KEY,
  buildBlankSession,
  buildSessionFromStarter,
  buildSessionFromTemplate,
  persistActiveSession,
} from "@/lib/startSession";
import { toast } from "@/components/ui/use-toast";
import { useDictation } from "@/components/logging/useDictation";
import { useUser } from "@/context/UserContext";
import { cn } from "@/lib/utils";
import { interpretPlan } from "@/lib/voice";
import { voiceDiag } from "@/lib/speech";
import { dictationVocabulary } from "@/lib/voiceVocabulary";
import { reuseRowIds } from "@/lib/voicePlanRows";
import { buildCoachContext, streamCoach } from "@/lib/coach";
import { parseWeekPlan } from "@/lib/coachSetup";
import { inferKind } from "@/lib/exerciseTracking";
import { Check, ChevronDown, ChevronsRight, Dumbbell, Pencil, Plus, Trash2, X, Mic, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

type ExerciseDraft = {
  id: string;
  name: string;
  /** "lift" = sets × reps × weight; "cardio" = one duration block
      (stairmaster, bike, treadmill) logged in minutes. */
  mode: "lift" | "cardio";
  sets: string;
  reps: string;
  weight: string;
  minutes: string;
  decideLater: boolean;
  /** The template exercise this draft came from, passed through VERBATIM on
      save while the row is untouched — the draft fields flatten pyramids,
      holds, and multi-block cardio, so rebuilding an unedited row from them
      silently destroyed that data. */
  original?: WorkoutExercise;
  /** True once any non-name field changes — only then is the row rebuilt. */
  dirty: boolean;
};

const createExerciseDraft = (overrides?: Partial<ExerciseDraft>): ExerciseDraft => ({
  id: `exercise-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: "",
  mode: "lift",
  sets: "3",
  // Targets are opt-in: blank reps/weight = decide while training, so the
  // fastest path is name → Save.
  reps: "",
  weight: "",
  minutes: "",
  decideLater: false,
  dirty: false,
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
  // Cardio round-trips as a duration block — without this, editing a
  // template would silently flatten a 30-min ride into 0-rep sets.
  if (exercise.kind === "cardio") {
    const seconds = exercise.sets[0]?.duration_seconds ?? 0;
    return createExerciseDraft({
      id: exercise.id,
      name: exercise.name,
      mode: "cardio",
      minutes: seconds > 0 ? String(Math.round(seconds / 60)) : "",
      original: exercise,
    });
  }

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
    original: exercise,
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
        className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        Start
      </button>
    </div>
  </div>
);

const Workouts = () => {
  const navigate = useNavigate();
  const { templates, loading, save, remove } = useWorkoutTemplates();
  const isMobile = useIsMobile();
  const [builderOpen, setBuilderOpen] = useState(false);
  // Which builder row's name input is focused — its suggestions render.
  const [nameFocusId, setNameFocusId] = useState<string | null>(null);
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

  // One session at a time: starting anything while a session is live would
  // silently erase its progress. The dialog routes back into the live one.
  const [blockedStart, setBlockedStart] = useState(false);
  // Trash tap arms this; the actual delete only runs from the confirm dialog.
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const guardActive = (): boolean => {
    if (!activeSeed) return false;
    setBlockedStart(true);
    return true;
  };

  const startWorkout = (template: { id?: string; name: string; exercises: WorkoutExercise[] }) => {
    if (guardActive()) return;
    persistActiveSession(buildSessionFromTemplate(template));
    navigate("/workouts/active");
  };

  // Starter programs start without a templateId — see buildSessionFromStarter.
  const startProgram = (program: StarterProgram) => {
    if (guardActive()) return;
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
    } catch (err) {
      toast(
        err instanceof Error && err.message === TEMPLATE_LIMIT_ERROR
          ? { title: "Workout limit reached", description: "You have 7 saved workouts — the max. Delete one in Workouts to make room." }
          : { title: "Could not save program", variant: "destructive" },
      );
    } finally {
      setSavingProgramId(null);
    }
  };

  const addExercise = () => {
    setExercises((current) => [...current, createExerciseDraft()]);
  };

  const { profile } = useUser();
  const units = profile?.units ?? "lb";

  // ── Dictate a plan: "push day — bench four by eight at one thirty five,
  // incline dumbbell three by ten, twenty minutes on the bike". Each pause
  // hands over the WHOLE transcript so far; the rows built from the
  // previous version are replaced, never stacked. Rows typed by hand are
  // untouched. Nothing saves until Save.
  const [pendingPlans, setPendingPlans] = useState(0);
  const dictating = pendingPlans > 0;
  const planSeq = useRef(0);
  const voiceSession = useRef(0);
  const voiceRowIds = useRef<Set<string>>(new Set());
  const nameFromVoice = useRef(false);
  // The lifter's own templates + starter programs bias the recognizer.
  const vocabulary = useMemo(
    () => dictationVocabulary([...templates, ...starterPrograms]),
    [templates],
  );
  // Live: the transcript is re-interpreted every ~second while you talk.
  // One call in flight at a time; the newest transcript waits its turn, so
  // a burst of partials never queues a dozen requests.
  // Two different things, kept apart on purpose:
  //   VOICE  — the mic: dictate YOUR plan, rows appear as you talk.
  //   AI     — (Pro) describe what you WANT ("45-min push day, dumbbells
  //            only") and the coach designs it. You can type that ask or
  //            speak it; the words go into the ask box, never straight to
  //            rows.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const aiRowIds = useRef<Set<string>>(new Set());
  const nameFromAi = useRef(false);
  const dictationTarget = useRef<"rows" | "ai">("rows");
  const liveInFlight = useRef(false);
  const liveQueued = useRef<{ transcript: string; session: number } | null>(null);
  const interpretLatest = (transcript: string, session: number): void => {
    const seq = ++planSeq.current;
    liveInFlight.current = true;
    setPendingPlans((n) => n + 1);
    voiceDiag(`builder: interpret #${seq} session ${session} (${transcript.length} chars)`);
    void interpretPlan(transcript, units)
      .then((plan) => {
        if (seq !== planSeq.current) {
          voiceDiag(`builder: plan #${seq} superseded → dropped`);
          return;
        }
        voiceDiag(
          `builder: plan #${seq} → ${plan.exercises.length} exercises, name=${plan.name ?? "—"}, conf=${plan.confidence}`,
        );
        // A new tap-to-dictate makes the previous dictation's rows permanent.
        if (session !== voiceSession.current) {
          voiceSession.current = session;
          voiceRowIds.current = new Set();
          nameFromVoice.current = false;
        }
        if (plan.name && (!workoutName.trim() || nameFromVoice.current)) {
          setWorkoutName(plan.name);
          nameFromVoice.current = true;
        }
        const previous = voiceRowIds.current;
        setExercises((current) => {
          // Same-named rows keep their ids — on-screen rows never blink.
          const prevVoice = current.filter((row) => previous.has(row.id));
          const ids = reuseRowIds(prevVoice, plan.exercises.map((e) => e.name));
          const rows = plan.exercises.map((e, i) =>
            createExerciseDraft({
              ...(ids[i] ? { id: ids[i] as string } : {}),
              name: e.name,
              mode: e.kind === "cardio" ? "cardio" : "lift",
              sets: String(e.sets),
              reps: e.reps !== null ? String(e.reps) : "",
              weight: e.weight !== null ? String(e.weight) : "",
              minutes: e.minutes !== null ? String(e.minutes) : "",
              dirty: true,
            }),
          );
          voiceRowIds.current = new Set(rows.map((r) => r.id));
          const kept = current.filter(
            (row) => !previous.has(row.id) && (row.name.trim() !== "" || row.dirty),
          );
          return [...kept, ...rows].slice(0, 20);
        });
      })
      .catch((err) => {
        voiceDiag(`builder: plan #${seq} FAILED ${err instanceof Error ? err.message : String(err)}`);
        if (seq !== planSeq.current) return;
        toast(
          err instanceof Error && err.message === "plan-mode-not-deployed"
            ? {
                title: "Voice needs the latest server update",
                description: "Deploy the voice-log function, then dictation builds rows.",
                variant: "destructive",
              }
            : { title: "Couldn’t interpret that — try again", variant: "destructive" },
        );
      })
      .finally(() => {
        setPendingPlans((n) => n - 1);
        liveInFlight.current = false;
        const next = liveQueued.current;
        if (next) {
          liveQueued.current = null;
          interpretLatest(next.transcript, next.session);
        }
      });
  };
  const designPrompt = (ask: string): string =>
    `Design ONE workout for me: ${ask}.
Reply with NOTHING but this exact format:

## <Workout name>
<Exercise name>: <sets>x<reps>

5-8 exercises matched to the ask. Cardio blocks as "<Machine>: 1x<minutes>". No intro, no outro, no weights.`;

  const designWorkout = async (): Promise<void> => {
    const ask = aiText.trim();
    if (!ask || aiBusy) return;
    setAiBusy(true);
    voiceDiag(`builder: ai design (${ask.length} chars)`);
    try {
      const reply = await streamCoach(
        [{ role: "user", content: designPrompt(ask) }],
        buildCoachContext([], profile),
        () => {},
      );
      const [day] = parseWeekPlan(reply, 1);
      if (!day || day.exercises.length === 0) {
        toast({ title: "The coach couldn’t design that — add a bit more detail", variant: "destructive" });
        return;
      }
      voiceDiag(`builder: ai design → "${day.name}" ${day.exercises.length} exercises`);
      if (!workoutName.trim() || nameFromAi.current) {
        setWorkoutName(day.name);
        nameFromAi.current = true;
      }
      // Designing again replaces the AI's rows; typed and dictated rows stay.
      const previous = aiRowIds.current;
      setExercises((current) => {
        const prevAi = current.filter((row) => previous.has(row.id));
        const ids = reuseRowIds(prevAi, day.exercises.map((e) => e.name));
        const rows = day.exercises.map((e, i) => {
          const cardio = inferKind(e.name) === "cardio";
          const first = e.sets[0];
          return createExerciseDraft({
            ...(ids[i] ? { id: ids[i] as string } : {}),
            name: e.name,
            mode: cardio ? "cardio" : "lift",
            sets: String(cardio ? 1 : Math.max(1, e.sets.length)),
            reps: !cardio && first?.reps ? String(first.reps) : "",
            weight: "",
            minutes: cardio && first?.reps ? String(first.reps) : "",
            dirty: true,
          });
        });
        aiRowIds.current = new Set(rows.map((r) => r.id));
        const kept = current.filter(
          (row) => !previous.has(row.id) && (row.name.trim() !== "" || row.dirty),
        );
        return [...kept, ...rows].slice(0, 20);
      });
      toast({ title: `Designed “${day.name}”`, description: `${day.exercises.length} exercises — edit anything before saving.` });
    } catch (err) {
      voiceDiag(`builder: ai design FAILED ${err instanceof Error ? err.message : String(err)}`);
      toast({ title: "Couldn’t reach the coach — try again", variant: "destructive" });
    } finally {
      setAiBusy(false);
    }
  };

  const dictation = useDictation(
    (transcript, session) => {
      // Speaking into the AI box: the words are the ask, not the plan.
      if (dictationTarget.current === "ai") {
        setAiText(transcript);
        return;
      }
      if (liveInFlight.current) {
        liveQueued.current = { transcript, session };
        return;
      }
      interpretLatest(transcript, session);
    },
    { vocabulary, live: true },
  );
  const startDictation = (target: "rows" | "ai"): void => {
    dictationTarget.current = target;
    void dictation.start();
  };
  const listeningTo = dictation.state.at === "idle" ? null : dictationTarget.current;

  const updateExercise = <K extends keyof ExerciseDraft>(id: string, key: K, value: ExerciseDraft[K]) => {
    setExercises((current) =>
      current.map((exercise) => {
        if (exercise.id !== id) return exercise;
        // A no-op write (tapping the already-active mode pill) must not
        // dirty the row — dirty rows rebuild from the flattened fields on
        // save, silently destroying pyramid/hold/multi-block data.
        if (exercise[key] === value) return exercise;
        // Name edits alone keep the original sets verbatim; touching any
        // number/mode rebuilds the row from the visible fields.
        return { ...exercise, [key]: value, ...(key === "name" ? {} : { dirty: true }) };
      }),
    );
  };

  const saveWorkout = async () => {
    if (!canSave || saving) return;
    setSaving(true);

    const exercisesToSave: WorkoutExercise[] = completedExercises.map((exercise) => {
      // Untouched rows from an edited template pass through verbatim —
      // pyramid sets, holds, and multi-block cardio survive a rename-only
      // or neighbor-only edit.
      if (exercise.original && !exercise.dirty) {
        return {
          ...exercise.original,
          name: exercise.name.trim(),
          category: workoutName.trim(),
        };
      }

      // Cardio saves as one duration block: kind "cardio" keeps it out of
      // hold-PR and strength-trend math; tracking "time" gives it the
      // duration column in the logger. Blank minutes = decide during.
      if (exercise.mode === "cardio") {
        const minutes = Math.min(toInteger(exercise.minutes, 0), 600);
        return {
          id: exercise.id,
          name: exercise.name.trim(),
          category: workoutName.trim(),
          kind: "cardio" as const,
          tracking: "time" as const,
          target: minutes > 0 ? `${minutes} min` : "",
          sets: [
            {
              id: `${exercise.id}-set-1`,
              reps: 0,
              weight: 0,
              ...(minutes > 0 ? { duration_seconds: minutes * 60 } : {}),
            },
          ],
        };
      }

      // Blank targets = decide during the session. No toggle, no ceremony.
      // Sets clamp: a fat-fingered "999" would render a thousand rows and
      // freeze the logger.
      const decideLater = exercise.reps.trim() === "" && exercise.weight.trim() === "";
      const targetSets = Math.min(toInteger(exercise.sets, 3), 20);
      const targetReps = toInteger(exercise.reps, 0);
      const targetWeight = toDecimal(exercise.weight);

      return {
        id: exercise.id,
        name: exercise.name.trim(),
        category: workoutName.trim(),
        target: decideLater
          ? ""
          : `${targetSets} × ${targetReps}${targetWeight > 0 ? ` @ ${targetWeight}` : ""}`,
        sets: Array.from({ length: decideLater ? Math.min(toInteger(exercise.sets, 1), 20) : targetSets }, (_, index) => ({
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
    } catch (err) {
      toast(
        err instanceof Error && err.message === TEMPLATE_LIMIT_ERROR
          ? { title: "Workout limit reached", description: "You have 7 saved workouts — the max. Delete one in Workouts to make room." }
          : { title: "Could not save workout", variant: "destructive" },
      );
    } finally {
      setSaving(false);
    }
  };

  // The builder's form, shared by the phone sheet and the desktop dialog.
  const builderBody = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-5 pb-1 md:px-6">
        <div className="mt-1 flex items-center gap-2">
          <input
            // No autofocus on phones: the keyboard popping on open makes iOS
            // pan the sheet up under the status bar. Tap to name it instead.
            autoFocus={!isMobile}
            value={workoutName}
            onChange={(event) => setWorkoutName(event.target.value)}
            placeholder="Workout name — Push Day, Legs…"
            aria-label="Workout name"
            className="h-12 w-full min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-[15px] font-medium text-fg outline-none transition placeholder:font-normal focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
          />
          {/* VOICE — dictate the plan; rows appear as you talk. */}
          {dictation.supported && (
            <button
              type="button"
              onClick={() => startDictation("rows")}
              disabled={listeningTo === "ai"}
              aria-label={listeningTo === "rows" ? "Stop dictating" : "Dictate this workout"}
              className={cn(
                "relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border transition after:absolute after:-inset-1 after:content-[''] disabled:opacity-40",
                listeningTo === "rows"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-primary",
              )}
            >
              <Mic size={18} className={listeningTo === "rows" ? "animate-pulse" : ""} />
            </button>
          )}
          {/* AI — Pro. The coach designs a workout from what you ask for. */}
          <button
            type="button"
            onClick={() => setAiOpen((open) => !open)}
            aria-pressed={aiOpen}
            aria-label="Design with AI"
            className={cn(
              "relative inline-flex h-12 shrink-0 items-center gap-1.5 rounded-lg border pl-3 pr-2 text-[13px] font-semibold transition after:absolute after:-inset-1 after:content-['']",
              aiOpen
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-primary",
            )}
          >
            <Sparkles size={15} />
            AI
            <span
              className={cn(
                "rounded-full px-1.5 text-[8.5px] font-bold uppercase leading-[15px] tracking-[0.1em]",
                aiOpen ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary text-primary-foreground",
              )}
            >
              Pro
            </span>
          </button>
        </div>

        {/* Voice status — only while the mic is feeding rows. */}
        {(listeningTo === "rows" || (dictating && !aiOpen)) && (
          <p className="mt-2 min-h-[18px] truncate text-[12.5px] leading-[18px] text-fg-muted">
            {dictating && dictation.state.at === "idle"
              ? "Building your rows…"
              : dictation.state.at === "starting"
                ? "Opening the mic…"
                : dictation.state.at === "blocked"
                  ? dictation.state.reason
                  : dictation.state.at === "listening"
                    ? dictation.state.partial || "Just talk — rows appear as you go. “Take the bench out” removes it."
                    : ""}
          </p>
        )}

        {aiOpen && (
          <div className="mt-2 rounded-[14px] border border-primary/25 bg-primary/[0.05] p-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-primary">
              Ask the coach
            </p>
            <div className="mt-2 flex items-start gap-2">
              <textarea
                value={aiText}
                onChange={(event) => setAiText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void designWorkout();
                  }
                }}
                rows={2}
                placeholder="What do you want? “45-minute push day, dumbbells only, hypertrophy”"
                aria-label="Describe the workout you want the coach to design"
                className="min-h-[60px] w-full min-w-0 flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-[14px] leading-5 text-fg outline-none transition placeholder:text-fg-muted focus:border-primary/60"
              />
              {dictation.supported && (
                <button
                  type="button"
                  onClick={() => startDictation("ai")}
                  disabled={listeningTo === "rows"}
                  aria-label={listeningTo === "ai" ? "Stop speaking" : "Speak your request"}
                  className={cn(
                    "relative inline-flex h-[60px] w-12 shrink-0 items-center justify-center rounded-lg border transition after:absolute after:-inset-1 after:content-[''] disabled:opacity-40",
                    listeningTo === "ai"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-primary",
                  )}
                >
                  <Mic size={18} className={listeningTo === "ai" ? "animate-pulse" : ""} />
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="min-h-[18px] min-w-0 flex-1 truncate text-[12px] leading-[18px] text-fg-muted">
                {aiBusy
                  ? "The coach is designing it…"
                  : listeningTo === "ai"
                    ? "Listening — say what you want, then tap Design."
                    : "The coach picks the exercises, sets and reps. Edit anything after."}
              </p>
              <button
                type="button"
                onClick={() => void designWorkout()}
                disabled={!aiText.trim() || aiBusy}
                className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.97] disabled:opacity-40"
              >
                <Sparkles size={13} />
                {aiBusy ? "Designing…" : "Design it"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* data-vaul-no-drag: scrolling the exercise list never turns into a
          half-dismissed sheet — the title row and grabber still swipe. */}
      <div data-vaul-no-drag className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 md:px-6">
        <div className="space-y-4">
          {exercises.map((exercise, index) => (
            <div key={exercise.id} className="rule-hairline pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-center gap-2">
                <input
                  value={exercise.name}
                  onChange={(event) => updateExercise(exercise.id, "name", event.target.value)}
                  onFocus={() => setNameFocusId(exercise.id)}
                  onBlur={() => setNameFocusId((current) => (current === exercise.id ? null : current))}
                  placeholder={
                    exercise.mode === "cardio"
                      ? "Stairmaster, bike, treadmill…"
                      : index === 0
                        ? "Exercise — Bench Press, Squat…"
                        : "Exercise"
                  }
                  aria-label={`Exercise ${index + 1} name`}
                  className="h-11 w-full min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm font-medium text-fg outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                />
                {/* Lift ⇄ Cardio — cardio swaps the target grid for minutes. */}
                <div className="inline-flex shrink-0 rounded-full border border-border p-0.5">
                  {(["lift", "cardio"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateExercise(exercise.id, "mode", mode)}
                      aria-pressed={exercise.mode === mode}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
                        exercise.mode === mode
                          ? "bg-foreground text-background"
                          : "text-fg-muted hover:text-fg"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
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
              {nameFocusId === exercise.id && (
                <ExerciseNameSuggestions
                  query={exercise.name}
                  onPick={(name) => updateExercise(exercise.id, "name", name)}
                />
              )}
              {exercise.mode === "cardio" ? (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <label className="block min-w-0">
                    <span className="mb-1 block text-[10px] uppercase tracking-widest text-fg-muted">
                      Minutes
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={exercise.minutes}
                      placeholder="30"
                      onChange={(event) =>
                        updateExercise(exercise.id, "minutes", integerInput(event.target.value))
                      }
                      className="h-11 w-full rounded-lg border border-border bg-card px-3 text-center text-sm tabular-nums text-fg outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    />
                  </label>
                </div>
              ) : (
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
              )}
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

      {/* Save pinned to the sheet's bottom edge, clear of the home indicator. */}
      <div className="border-t border-border px-5 pb-[calc(var(--safe-bottom)+1rem)] pt-3 md:px-6 md:pb-4">
        <CTAButton onClick={saveWorkout} disabled={!canSave || saving} fullWidth>
          <Check size={15} />
          {saving ? "Saving…" : "Save workout"}
        </CTAButton>
      </div>
    </div>
  );

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
        <div className="flex flex-wrap gap-2.5">
          <CTAButton onClick={openBuilder} variant="accent">
            <Plus size={16} />
            New workout
          </CTAButton>
          {/* Start empty, log as you go (voice or typed), decide at the end
              whether to keep it as a saved workout. */}
          <CTAButton
            onClick={() => {
              if (guardActive()) return;
              persistActiveSession(buildBlankSession());
              navigate("/workouts/active");
            }}
          >
            <ChevronsRight size={16} />
            Quick start
          </CTAButton>
        </div>
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
                      aria-label={`Edit ${template.name}`}
                      onClick={() => editWorkout(template)}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-fg-muted transition hover:bg-foreground/[0.06] hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring/40"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${template.name}`}
                      onClick={() => setDeleteTarget({ id: template.id, name: template.name })}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-fg-muted transition hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => startWorkout(template)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary/40"
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
                  saveDisabled={savingProgramId !== null || savedProgramIds.has(program.id) || templates.length >= MAX_TEMPLATES}
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
                saveDisabled={savingProgramId !== null || savedProgramIds.has(program.id) || templates.length >= MAX_TEMPLATES}
                onSave={() => saveProgramAsTemplate(program)}
                onStart={() => startProgram(program)}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Builder — a name, exercise rows, one button. Blank targets mean
          "decide while training"; nothing here needs explaining. ── */}
      {/* Already mid-workout — block the new start, offer the way back. */}
      <AlertDialog open={blockedStart} onOpenChange={setBlockedStart}>
        <AlertDialogContent className="w-[calc(100%-2.5rem)] max-w-sm rounded-[18px] border-border bg-card p-6 text-fg">
          <AlertDialogHeader className="space-y-2 text-left sm:text-left">
            <AlertDialogTitle className="text-[20px] font-semibold tracking-[-0.01em] text-fg">
              A workout is already running
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-5 text-fg-soft">
              {activeSeed?.name ? `“${activeSeed.name}” is live.` : "Your session is live."}{" "}
              Finish or discard it before starting another — its progress would
              be lost otherwise.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-5 flex-col gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogAction
              onClick={() => navigate("/workouts/active")}
              className="h-12 w-full rounded-full border-0 bg-foreground text-[14.5px] font-semibold text-background hover:bg-foreground/90"
            >
              Back to workout
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0 h-12 w-full rounded-full border border-border bg-transparent text-[14.5px] font-semibold text-fg-soft">
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation — a saved workout is a curated thing; one
          mis-tap on the trash shouldn't erase it. History is unaffected. */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="w-[calc(100%-2.5rem)] max-w-sm rounded-[18px] border-border bg-card p-6 text-fg">
          <AlertDialogHeader className="space-y-2 text-left sm:text-left">
            <AlertDialogTitle className="text-[20px] font-semibold tracking-[-0.01em] text-fg">
              Delete “{deleteTarget?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[14px] leading-5 text-fg-soft">
              This removes the saved workout from your library. Workouts you
              already logged with it stay in your history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-5 flex-col gap-2 sm:flex-col sm:space-x-0">
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) void removeWorkout(deleteTarget.id);
                setDeleteTarget(null);
              }}
              className="h-12 w-full rounded-full border-0 bg-destructive text-[14.5px] font-semibold text-destructive-foreground hover:bg-destructive/90"
            >
              Delete workout
            </AlertDialogAction>
            <AlertDialogCancel className="mt-0 h-12 w-full rounded-full border border-border bg-transparent text-[14.5px] font-semibold text-fg-soft">
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Builder. Phones get a full-height bottom sheet (keyboard-safe,
          anchored to the bottom edge — a centered dialog floated mid-screen
          and collapsed under the keyboard); desktop keeps the dialog. */}
      {isMobile ? (
        <Drawer
          open={builderOpen}
          onOpenChange={setBuilderOpen}
          shouldScaleBackground={false}
          repositionInputs={false}
        >
          {/* hideClose: the X lives in the title row here. p-0 takes over
              the safe-area padding — the Save footer clears the indicator. */}
          <DrawerContent
            hideClose
            className="flex h-[calc(100dvh-var(--safe-top)-12px)] max-h-[calc(100dvh-var(--safe-top)-12px)] flex-col bg-background p-0"
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-1.5">
              <DrawerTitle className="text-[17px] font-semibold text-fg">
                {editingWorkoutId ? "Edit workout" : "New workout"}
              </DrawerTitle>
              <button
                type="button"
                onClick={() => setBuilderOpen(false)}
                aria-label="Close"
                className="relative -mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-fg-soft transition-colors after:absolute after:-inset-1 after:content-[''] hover:bg-foreground/[0.1] hover:text-fg active:bg-foreground/[0.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <X size={18} strokeWidth={2.25} />
              </button>
            </div>
            {builderBody}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
          <DialogContent className="grid h-[min(85dvh,680px)] max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[560px] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-[18px] border border-border bg-background p-0 sm:w-[calc(100vw-2rem)]">
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
            </div>
            {builderBody}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default Workouts;
