import { CTAButton } from "@/components/GoldButton";
import { CardioBlock } from "@/components/review/CardioBlock";
import { ExerciseGroupCard } from "@/components/review/ExerciseGroupCard";
import { ReviewFooter } from "@/components/review/ReviewFooter";
import { ShareButton } from "@/components/ShareButton";
import { toast } from "@/components/ui/use-toast";
import {
  getActivityType,
  inferReviewMode,
  useCapturedSessions,
  type CapturedSessionRow,
} from "@/context/CapturedSessionsProvider";
import { useUser } from "@/context/UserContext";
import { useWorkoutLogs, type WorkoutLog } from "@/hooks/useWorkoutLogs";
import {
  buildEditableFromCaptured,
  buildExerciseNameHistory,
  buildLabelHistory,
  cardioBlockHasContent,
  cardioBlockToExercise,
  editableToExercises,
  editableTotalSets,
  editableVolume,
  filterMixedFalsePositives,
  initCardioBlockFromAggregates,
  lastRepsForExercise,
  lastWeightForExercise,
  mergeGroupUp,
  newCardioGroup,
  newEmptyCardioBlock,
  newEmptyGroup,
  splitGroup,
  workoutLogToEditable,
  type EditableCardioBlock,
  type EditableGroup,
} from "@/lib/review/buildEditable";
import {
  clearReviewDraft,
  loadReviewDraft,
  saveReviewDraft,
} from "@/lib/review/draftStore";
import { getMuscleActivation } from "@/lib/muscleMap";
import { detectSessionPRs } from "@/lib/prs";
import { Activity, Dumbbell, Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

type Mode = "captured" | "log";

const formatDateLine = (iso: string): string => {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
};

const durationMinutes = (startISO: string, endISO: string): number =>
  Math.max(
    0,
    Math.round(
      (new Date(endISO).getTime() - new Date(startISO).getTime()) / 60_000,
    ),
  );

const formatDuration = (startISO: string, endISO: string): string => {
  const minutes = durationMinutes(startISO, endISO);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
};

const SessionReview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useUser();
  const { sessions, loading: sessionsLoading, markReviewed, markDismissed } =
    useCapturedSessions();
  const { logs, loading: logsLoading, save: saveLog } = useWorkoutLogs();

  const captured = useMemo<CapturedSessionRow | null>(
    () => sessions.find((s) => s.id === id) ?? null,
    [sessions, id],
  );
  const existingLog = useMemo<WorkoutLog | null>(
    () => logs.find((l) => l.id === id) ?? null,
    [logs, id],
  );

  const mode: Mode | null = captured ? "captured" : existingLog ? "log" : null;

  const [groups, setGroups] = useState<EditableGroup[]>([]);
  const [cardioBlock, setCardioBlock] = useState<EditableCardioBlock | null>(null);
  const [label, setLabel] = useState<string>("");
  const [labelIsAuto, setLabelIsAuto] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const initializedForId = useRef<string | null>(null);

  // Initialize editable state once per :id (or when underlying data first arrives)
  useEffect(() => {
    if (!id || initializedForId.current === id) return;
    if (captured) {
      // A locally saved draft wins over re-running detection: restore the
      // user's edits exactly as they left them.
      const draft = loadReviewDraft(id);
      if (draft) {
        setGroups(draft.groups);
        setCardioBlock(draft.cardioBlock);
        setLabel(draft.label);
        setLabelIsAuto(draft.labelIsAuto);
        initializedForId.current = id;
        return;
      }
      const detected = buildEditableFromCaptured(
        captured.hr_samples,
        captured.motion_samples,
        [],
      );
      const activityType = getActivityType(captured);
      const reviewMode = inferReviewMode(
        activityType,
        detected.length,
        captured.aggregates,
      );

      if (reviewMode === "cardio") {
        setCardioBlock(initCardioBlockFromAggregates(captured.aggregates, activityType));
        setGroups([]); // cardio sessions discard detected sub-windows as false positives
      } else if (reviewMode === "mixed") {
        setCardioBlock(initCardioBlockFromAggregates(captured.aggregates, activityType));
        setGroups(filterMixedFalsePositives(detected));
      } else {
        setCardioBlock(null);
        setGroups(detected);
      }

      setLabel(activityType ?? "Workout");
      setLabelIsAuto(true);
      initializedForId.current = id;
    } else if (existingLog) {
      setCardioBlock(null);
      setGroups(workoutLogToEditable(existingLog));
      setLabel(existingLog.name);
      setLabelIsAuto(false);
      initializedForId.current = id;
    }
  }, [id, captured, existingLog]);

  const exerciseNameOptions = useMemo(
    () => buildExerciseNameHistory(logs),
    [logs],
  );
  const labelOptions = useMemo(() => buildLabelHistory(logs), [logs]);
  const unitsLabel = profile?.units ?? "lb";

  const volumeEstimate = useMemo(() => editableVolume(groups), [groups]);
  const totalSets = useMemo(() => editableTotalSets(groups), [groups]);

  // Share payload — only meaningful for saved logs (the completed state).
  // Captured-mode reviews are still in progress, so nothing to share yet.
  // Infinity daysBack: this is a single-session snapshot, not the dashboard's
  // 7-day rolling window, and the log may be older than a week.
  const shareActivation = useMemo(
    () => (existingLog ? getMuscleActivation([existingLog], Infinity) : null),
    [existingLog],
  );
  const sharePRCount = useMemo(
    () => (existingLog ? detectSessionPRs(logs, existingLog).length : 0),
    [logs, existingLog],
  );
  const hasCardio = cardioBlock !== null && cardioBlockHasContent(cardioBlock);
  const canSave = totalSets > 0 || hasCardio;

  const weightPlaceholderFor = (name: string): number | null =>
    lastWeightForExercise(logs, name);
  const repsPlaceholderFor = (name: string): number | null =>
    lastRepsForExercise(logs, name);
  const capturedDurationSeconds: string | null =
    captured?.aggregates?.duration_s !== undefined
      ? String(Math.round(captured.aggregates.duration_s))
      : null;

  const updateGroup = (next: EditableGroup): void => {
    setGroups((curr) => curr.map((g) => (g.id === next.id ? next : g)));
  };

  const handleMergeUp = (groupId: string): void => {
    setGroups((curr) => mergeGroupUp(curr, groupId));
  };
  const handleSplit = (groupId: string): void => {
    setGroups((curr) => splitGroup(curr, groupId));
  };
  const handleDelete = (groupId: string): void => {
    setGroups((curr) => curr.filter((g) => g.id !== groupId));
  };
  const addGroup = (): void => {
    setGroups((curr) => [...curr, newEmptyGroup("weighted")]);
  };
  const addCardioGroup = (): void => {
    // Restore the top-of-page CardioBlock if it was removed; otherwise add a
    // cardio EditableGroup so users can stack multiple cardio entries (rare).
    if (cardioBlock === null) {
      setCardioBlock(newEmptyCardioBlock());
      return;
    }
    setGroups((curr) => [...curr, newCardioGroup()]);
  };

  // ── save flows ─────────────────────────────────────────────
  const isMockSession = captured?.user_id === "mock-user";

  const handleSaveWorkout = async (): Promise<void> => {
    if (saving || !canSave) return;
    setSaving(true);
    try {
      const exercises = [
        ...(cardioBlock && cardioBlockHasContent(cardioBlock)
          ? [cardioBlockToExercise(cardioBlock, label || "Cardio")]
          : []),
        ...editableToExercises(groups),
      ];
      const started_at =
        captured?.started_at ??
        existingLog?.started_at ??
        new Date().toISOString();
      const finished_at =
        captured?.ended_at ??
        existingLog?.finished_at ??
        new Date().toISOString();
      const duration_minutes = Math.max(
        1,
        Math.round(
          (new Date(finished_at).getTime() - new Date(started_at).getTime()) /
            60_000,
        ),
      );

      const completed_sets = exercises.reduce(
        (sum, ex) => sum + ex.sets.length,
        0,
      );
      const captured_session_id =
        captured && !isMockSession ? captured.id : null;

      await saveLog({
        template_id: existingLog?.template_id ?? null,
        name: label.trim() || "Workout",
        exercises,
        notes: existingLog?.notes ?? null,
        started_at,
        finished_at,
        duration_minutes,
        total_sets: completed_sets,
        completed_sets,
        total_volume: volumeEstimate,
        source: "review",
        captured_session_id,
      });

      if (captured) {
        await markReviewed(captured.id);
        clearReviewDraft(captured.id);
      }

      toast({ title: "Workout saved" });
      navigate("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save workout";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = (): void => {
    // "Save as draft" in captured mode; plain "Cancel" in log mode. The DB
    // schema has no draft status (review_status is CHECK-constrained to
    // pending/reviewed/dismissed), so drafts persist locally and the session
    // stays 'pending' — still counted in the review queue.
    if (captured) {
      saveReviewDraft(captured.id, { groups, cardioBlock, label, labelIsAuto });
      toast({ title: "Draft saved" });
    }
    navigate("/dashboard");
  };

  const handleDismiss = async (): Promise<void> => {
    if (!captured || saving) return;
    setSaving(true);
    try {
      await markDismissed(captured.id);
      clearReviewDraft(captured.id);
      toast({ title: "Session dismissed" });
      navigate("/dashboard");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not dismiss session";
      toast({ title: "Action failed", description: message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── render branches ────────────────────────────────────────
  const loading = sessionsLoading || logsLoading;

  if (loading && !captured && !existingLog) {
    return <ReviewShell><ReviewSkeleton /></ReviewShell>;
  }

  if (!mode) {
    return (
      <ReviewShell>
        <div className="rounded-[14px] border border-border bg-card p-6 text-center animate-reveal-up">
          <p className="eyebrow mb-2">Not found</p>
          <h1 className="heading-md">No session matches this link</h1>
          <p className="body-md mt-2 text-fg-muted">
            The session may have been dismissed or the link is stale.
          </p>
          <CTAButton to="/dashboard" className="mt-5">Go to dashboard</CTAButton>
        </div>
      </ReviewShell>
    );
  }

  const startedAt =
    captured?.started_at ??
    existingLog?.started_at ??
    new Date().toISOString();
  const endedAt =
    captured?.ended_at ??
    existingLog?.finished_at ??
    new Date().toISOString();
  const activityType = captured ? getActivityType(captured) : null;
  const headerAvgHr = captured?.aggregates?.avg_hr;
  const isEmptyState = cardioBlock === null && groups.length === 0;

  // THE NUMBER — the one figure that answers "what was this session?"
  // Volume when there is any; otherwise (cardio) the duration carries it.
  const focalIsVolume = volumeEstimate > 0;
  const providerName =
    captured?.provider === "healthkit" ? "Apple Health" : "Strava";
  const sourceLabel = activityType
    ? `via ${providerName} · ${activityType}`
    : `via ${providerName}`;

  return (
    <ReviewShell>
      {/* ── header — eyebrow row, The Number, hairline stat strip ── */}
      <header className="rule-heavy pt-3 animate-reveal-up">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <p className="eyebrow">{formatDateLine(startedAt)}</p>
          {/* Quiet secondary, right: the ShareButton for saved logs (it
              renders the SAVED log, so unsaved edits don't leak into the
              card); the capture source otherwise. */}
          {mode === "log" && existingLog && shareActivation ? (
            <ShareButton
              log={existingLog}
              activations={[shareActivation]}
              prCount={sharePRCount}
              className="min-h-11 shrink-0"
            />
          ) : (
            <span className="caption shrink-0">{sourceLabel}</span>
          )}
        </div>

        <p className="stat-hero mt-6 whitespace-nowrap !text-6xl md:!text-7xl">
          {focalIsVolume
            ? volumeEstimate.toLocaleString()
            : durationMinutes(startedAt, endedAt)}
          <span className="ml-2.5 text-xl font-normal tracking-normal text-fg-muted">
            {focalIsVolume ? unitsLabel : "min"}
          </span>
        </p>
        <p className="eyebrow mt-3">
          {focalIsVolume ? "Session volume" : "Session duration"}
        </p>

        {mode === "captured" && (
          <p className="body-sm mt-2 text-fg-soft">
            Detected from your watch — confirm or edit it below.
          </p>
        )}

        {(focalIsVolume ||
          (headerAvgHr !== undefined && headerAvgHr > 0) ||
          totalSets > 0) && (
        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-1.5 rule-hairline pt-3">
          {focalIsVolume && (
            <p className="caption">
              Duration{" "}
              <span className="font-medium text-fg">
                {formatDuration(startedAt, endedAt)}
              </span>
            </p>
          )}
          {headerAvgHr !== undefined && headerAvgHr > 0 && (
            <p className="caption">
              Avg HR{" "}
              <span className="font-medium text-fg">
                {Math.round(headerAvgHr)} bpm
              </span>
            </p>
          )}
          {totalSets > 0 && (
            <p className="caption">
              Sets <span className="font-medium text-fg">{totalSets}</span>
            </p>
          )}
        </div>
        )}
      </header>

      {isEmptyState ? (
        <section className="rounded-[14px] border border-border bg-card p-6 text-center animate-reveal-up">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[0.875rem] border border-border bg-secondary">
            <Dumbbell className="h-[18px] w-[18px] translate-x-[0.5px] translate-y-[0.5px] text-gold" strokeWidth={1.9} />
          </div>
          <p className="eyebrow mt-3">Nothing auto-detected</p>
          <h2 className="heading-md mt-1.5">Add what you did</h2>
          <p className="body-md mt-2 text-fg-muted">
            Pick the kind of work this was — we'll fill in what we can.
          </p>
          <div className="mt-5 flex flex-row items-center justify-center gap-2">
            <button
              type="button"
              onClick={addGroup}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/40 px-4 py-2.5 text-sm font-medium text-gold transition hover:bg-primary hover:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <Dumbbell size={14} />
              Add exercise
            </button>
            <button
              type="button"
              onClick={addCardioGroup}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium text-fg-soft transition hover:bg-secondary hover:text-fg focus:outline-none focus:ring-2 focus:ring-ring/40"
            >
              <Activity size={14} />
              Add cardio
            </button>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          {cardioBlock && (
            <CardioBlock
              value={cardioBlock}
              units={unitsLabel}
              exerciseNameOptions={exerciseNameOptions}
              capturedDurationSeconds={capturedDurationSeconds}
              onChange={setCardioBlock}
              onRemove={() => setCardioBlock(null)}
            />
          )}
          {groups.map((g, idx) => (
            <ExerciseGroupCard
              key={g.id}
              group={g}
              isFirst={idx === 0}
              exerciseNameOptions={exerciseNameOptions}
              unitsLabel={unitsLabel}
              weightPlaceholderFor={weightPlaceholderFor}
              repsPlaceholderFor={repsPlaceholderFor}
              onChange={updateGroup}
              onMergeUp={() => handleMergeUp(g.id)}
              onSplit={() => handleSplit(g.id)}
              onDelete={() => handleDelete(g.id)}
            />
          ))}
          <div className="flex flex-row gap-2">
            <button
              type="button"
              onClick={addGroup}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[14px] border border-dashed border-border px-3 py-3 text-sm text-fg-muted transition hover:border-primary/50 hover:text-fg"
            >
              <Plus size={14} />
              Add exercise
            </button>
            <button
              type="button"
              onClick={addCardioGroup}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[14px] border border-dashed border-border px-3 py-3 text-sm text-fg-muted transition hover:border-primary/50 hover:text-fg"
            >
              <Activity size={14} />
              {cardioBlock === null ? "Add cardio" : "Add another cardio"}
            </button>
          </div>
        </section>
      )}

      <ReviewFooter
        label={label}
        labelOptions={labelOptions}
        labelIsAuto={labelIsAuto}
        onLabelChange={(v) => {
          setLabel(v);
          setLabelIsAuto(false);
        }}
        onSave={handleSaveWorkout}
        onDraft={handleSaveDraft}
        onDismiss={handleDismiss}
        saving={saving}
        canSave={canSave}
        mode={mode}
      />
    </ReviewShell>
  );
};

const ReviewShell = ({ children }: { children: React.ReactNode }) => (
  <div className="relative min-h-screen w-full max-w-4xl mx-auto p-6 md:p-10 lg:p-12">
    <div className="relative space-y-5">{children}</div>
  </div>
);

const ReviewSkeleton = () => (
  <>
    <div className="h-[180px] animate-pulse rounded-[14px] border border-border bg-card" />
    <div className="h-[220px] animate-pulse rounded-[14px] border border-border bg-card" />
    <div className="h-[160px] animate-pulse rounded-[14px] border border-border bg-card" />
  </>
);

export default SessionReview;
