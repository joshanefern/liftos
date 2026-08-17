import { WeekBadgeRow } from "@/components/home/WeekBadgeRow";
import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/ui/use-toast";
import { useCapturedSessions } from "@/context/CapturedSessionsProvider";
import { useUser } from "@/context/UserContext";
import { starterPrograms } from "@/data/starterPrograms";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import { usePendingReviews } from "@/hooks/usePendingReviews";
import { fetchStravaActivities } from "@/lib/strava/refresh";
import { buildStravaAuthorizeUrl, stravaIsConfigured } from "@/lib/strava/auth";
import {
  fetchStravaIntegration,
  setStravaAutopost,
  type StravaIntegrationState,
} from "@/lib/strava/writeback";
import { Switch } from "@/components/ui/switch";
import {
  connectHealthKit,
  debugSeedHealthKitWorkout,
  fetchHealthKitWorkouts,
  healthKitSupported,
} from "@/lib/healthkit";
import { formatHold } from "@/lib/exerciseTracking";
import { prStrip } from "@/lib/bigThree";
import { labelForMuscle } from "@/lib/muscleCoverage";
import type { Muscle } from "@/lib/muscleMap";
import { normalizeExerciseName } from "@/lib/prs";
import { muscleFreshnessFromLogs, trimSessionForRecovery } from "@/lib/recovery";
import { ACTIVE_WORKOUT_STORAGE_KEY } from "@/lib/startSession";
import { lastSessionDeltas } from "@/lib/strengthTrend";
import {
  buildSessionFromStarter,
  buildSessionFromTemplate,
  persistActiveSession,
} from "@/lib/startSession";
import { suggestNextWorkout } from "@/lib/suggestion";
import { isPlaceholderName } from "@/lib/exerciseNames";
import { getWeeklyStreak, getWeekStats } from "@/lib/workoutStats";
import { useDayKey } from "@/hooks/useDayKey";
import { useReadiness } from "@/hooks/useReadiness";
import { RecoverySheet } from "@/components/home/RecoverySheet";
import type { ActiveSession } from "@/pages/ActiveWorkout";
import { ArrowRight, ChevronDown, ChevronsRight, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

/** Compact "when": Today / 1d / 6d / 3w / 2mo / —. Calendar days at local
    midnight, not 24h buckets — yesterday evening must read "1d" this
    morning, never "Today". */
const fmtAgo = (iso: string | null): string => {
  if (!iso) return "—";
  const midnight = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (midnight(new Date()) - midnight(new Date(iso))) / 86_400_000,
  );
  if (days <= 0) return "Today";
  if (days < 7) return `${days}d`;
  if (days < 56) return `${Math.floor(days / 7)}w`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
};

/* ── Depth cards: white cards with a cool ink shadow in light that
   deepens to black over slate in dark. ── */

const ROW_CLASS =
  "group flex min-h-[52px] w-full items-center justify-between gap-4 rounded-[13px] " +
  "bg-card px-4 py-3.5 text-left shadow-[0_4px_12px_rgba(16,22,35,0.08)] " +
  "transition-[transform,box-shadow] duration-150 active:scale-[0.99] " +
  "dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const RowLabel = ({ children }: { children: ReactNode }) => (
  <span className="text-sm font-semibold text-fg">{children}</span>
);

const RowEnd = ({ value, icon }: { value?: ReactNode; icon?: ReactNode }) => (
  <span className="flex shrink-0 items-center gap-3">
    {value != null && <span className="caption whitespace-nowrap">{value}</span>}
    {icon ?? (
      <ArrowRight
        size={14}
        className="text-primary transition-transform duration-200 group-hover:translate-x-0.5"
      />
    )}
  </span>
);

/* ── Hero ink panel + card index — the panel inverts with the theme
   (ink-on-porcelain in light, porcelain-on-slate in dark); that
   flip is the signature, so every color inside it is a token. ── */

const Dashboard = () => {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useUser();
  const { logs, loading: logsLoading } = useWorkoutLogs();
  const { templates, loading: templatesLoading } = useWorkoutTemplates();
  const { pendingCount, pendingSessions } = usePendingReviews();

  // Both queries settled — before this, an established user's empty arrays
  // would masquerade as a brand-new account (rule f) in the hero.
  const dataReady = !logsLoading && !templatesLoading;

  // Live local day — re-renders when a long-lived mount crosses midnight, so
  // the header date, the pick, and the insight never freeze on yesterday.
  const dayKey = useDayKey();
  const { dayLabel, dateLabel } = useMemo(() => {
    const today = new Date();
    return {
      dayLabel: today.toLocaleDateString("en-US", { weekday: "long" }),
      dateLabel: today.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
  }, [dayKey]);

  const firstName = profile?.first_name ?? "";
  const units = profile?.units ?? "lb";

  // dayKey in the deps below: these all read the clock internally, and a
  // long-lived iOS mount crosses midnight without logs ever changing —
  // without it the week card shows LAST week's checkmarks on the new dates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekStats = useMemo(() => getWeekStats(logs), [logs, dayKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weeklyStreak = useMemo(() => getWeeklyStreak(logs), [logs, dayKey]);
  // Beat-last-time — the readout lifters check before training: last
  // workout's best sets vs the previous time each lift was done.
  const deltas = useMemo(() => lastSessionDeltas(logs), [logs]);
  // The scoreboard strip: bench / squat / deadlift, backfilled with the
  // heaviest other lifts. Raw best weights, never an index.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records = useMemo(() => prStrip(logs), [logs, dayKey]);

  // A live session dwarfs everything else on a reopen — the banner above the
  // hero is the way back in. dayKey retriggers the read on refocus/midnight.
  const activeSeed = useMemo(() => {
    try {
      const raw = window.localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as { name?: string; startedAt?: string };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayKey, logs]);
  const activeMinutes = activeSeed?.startedAt
    ? Math.max(0, Math.round((Date.now() - Date.parse(activeSeed.startedAt)) / 60_000))
    : null;

  const lastLog = logs[0] ?? null;

  // The engine's pick — names the CTA and (absent an AI insight) the sentence.
  // dayKey keeps the trained-today boundary honest across midnight.
  const suggestion = useMemo(
    () => suggestNextWorkout({ logs, templates, starters: starterPrograms, profile }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, templates, profile, dayKey],
  );

  // Split-position framing. Saved templates carry no split metadata (the
  // builder is name + exercises only), so the split day usually IS the title
  // ("Legs"); starters carry a program-level split worth naming when short
  // and not already in the title.
  const splitLabel = useMemo(() => {
    if (suggestion.kind !== "starter") return null;
    const split = starterPrograms.find((p) => p.id === suggestion.id)?.split?.trim();
    if (!split || split.length > 14) return null;
    return suggestion.title.toLowerCase().includes(split.toLowerCase()) ? null : split;
  }, [suggestion]);

  // ── Recovery: overnight readiness (HealthKit) + per-muscle freshness
  // (training history). The hero carries one line; the sheet has the rest.
  const readiness = useReadiness();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const freshness = useMemo(() => muscleFreshnessFromLogs(logs), [logs, dayKey]);
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  // Without a wearable verdict the line speaks from muscle freshness: the
  // least-recovered muscle today's pick actually targets.
  const staleTarget = useMemo(() => {
    const byMuscle = new Map(freshness.map((f) => [f.muscle, f.freshness]));
    let worst: { muscle: Muscle; value: number } | null = null;
    for (const muscle of suggestion.muscles) {
      const value = byMuscle.get(muscle) ?? 1;
      if (value < 0.85 && (!worst || value < worst.value)) worst = { muscle, value };
    }
    return worst;
  }, [freshness, suggestion.muscles]);

  const recoveryLine = useMemo(():
    | { word: string; tone: "good" | "neutral" | "warn" }
    | null => {
    if (readiness?.state === "primed") return { word: "Primed", tone: "good" };
    if (readiness?.state === "steady") return { word: "Steady", tone: "neutral" };
    if (readiness?.state === "run_down") return { word: "Run down", tone: "warn" };
    if (readiness?.baselineDaysRemaining != null) {
      return {
        word: `Learning your baseline · ${readiness.baselineDaysRemaining}d`,
        tone: "neutral",
      };
    }
    if (logs.length === 0) return null;
    // Rest-day picks don't get "Fresh for today" cheer — nothing is planned.
    if (suggestion.kind === "rest") return { word: "Recovered", tone: "neutral" };
    return staleTarget
      ? { word: `${labelForMuscle(staleTarget.muscle)} still recovering`, tone: "neutral" }
      : { word: "Fresh for today", tone: "good" };
  }, [readiness, staleTarget, logs.length, suggestion.kind]);

  // "To beat today" — the last-time top sets for the SUGGESTED session's
  // lifts, pre-loaded before the workout starts (the single most-wanted
  // open-screen data). Falls back to last-vs-previous deltas when the pick
  // has no history yet.
  const toBeat = useMemo(() => {
    const picked =
      suggestion.kind === "template"
        ? templates.find((t) => t.id === suggestion.id)?.exercises
        : suggestion.kind === "starter"
          ? starterPrograms.find((p) => p.id === suggestion.id)?.exercises
          : undefined;
    if (!picked) return [];
    const rows: { name: string; line: string; when: string }[] = [];
    for (const exercise of picked) {
      if (rows.length >= 3) break;
      if (exercise.kind === "cardio" || isPlaceholderName(exercise.name)) continue;
      const key = normalizeExerciseName(exercise.name);
      for (const log of logs) {
        // Longest hold tracks independently of the weight/reps best — timed
        // sets (weight 0, reps 0) can never win the weight comparison, and
        // folding duration into it froze on the FIRST hold of the session.
        let best: { weight: number; reps: number } | null = null;
        let longestHold = 0;
        for (const e of log.exercises) {
          if (normalizeExerciseName(e.name) !== key || e.kind === "cardio") continue;
          for (const s of e.sets) {
            if (!s.completed || s.isWarmup) continue;
            const reps = typeof s.reps === "number" ? s.reps : 0;
            const rawWeight = typeof s.weight === "number" ? s.weight : 0;
            const weight = rawWeight > 0 && reps >= 1 ? rawWeight : 0;
            const duration = typeof s.duration_seconds === "number" ? s.duration_seconds : 0;
            if (duration > longestHold) longestHold = duration;
            if (weight <= 0 && duration <= 0 && reps < 1) continue;
            if (!best || weight > best.weight || (weight === best.weight && reps > best.reps)) {
              best = { weight, reps };
            }
          }
        }
        if (!best && longestHold <= 0) continue;
        rows.push({
          name: exercise.name,
          line:
            longestHold > 0
              ? formatHold(longestHold)
              : best && best.weight > 0
                ? `${best.weight} × ${best.reps}`
                : `${best?.reps ?? 0} reps`,
          when: fmtAgo(log.finished_at).toLowerCase(),
        });
        break; // newest occurrence only
      }
    }
    return rows;
  }, [suggestion, templates, logs]);

  // One tap starts the named session pre-seeded; rest-day picks, still-loading
  // data, and any stale id fall back to the library, so the CTA never
  // dead-ends. On a run-down morning the seeded session is trimmed — the
  // readiness sentence announces exactly that.
  const persistWithRecovery = (session: ActiveSession): void => {
    persistActiveSession(
      readiness?.state === "run_down" ? trimSessionForRecovery(session) : session,
    );
  };

  const handleSuggestionStart = (): void => {
    // A live session outranks the pick — never silently overwrite its seed.
    if (activeSeed) {
      navigate("/workouts/active");
      return;
    }
    if (!dataReady) {
      navigate("/workouts");
      return;
    }
    if (suggestion.kind === "template") {
      const template = templates.find((t) => t.id === suggestion.id);
      if (template) {
        persistWithRecovery(buildSessionFromTemplate(template));
        navigate("/workouts/active");
        return;
      }
    } else if (suggestion.kind === "starter") {
      const program = starterPrograms.find((p) => p.id === suggestion.id);
      if (program) {
        persistWithRecovery(buildSessionFromStarter(program));
        navigate("/workouts/active");
        return;
      }
    }
    navigate("/workouts");
  };

  const { refresh: refreshCapturedSessions } = useCapturedSessions();

  // One sentence ONLY when something changed the plan (run-down/illness).
  // The daily coach-speak line is gone — owner's call: keep it simple.
  const sentence =
    dataReady && readiness?.state === "run_down" ? readiness.summary : null;

  const ctaLabel = activeSeed
    ? "Resume workout"
    : dataReady
      ? suggestion.ctaLabel
      : "Start a workout";

  const [syncing, setSyncing] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const wearableConnected = profile?.wearable_connected ?? false;

  // Write-back state (scope + autopost) — loaded when the disclosure opens;
  // the daily-return path never pays for it.
  const [stravaIntegration, setStravaIntegration] =
    useState<StravaIntegrationState | null>(null);
  useEffect(() => {
    if (!connectionsOpen || !wearableConnected || stravaIntegration) return;
    let cancelled = false;
    fetchStravaIntegration()
      .then((state) => {
        if (!cancelled) setStravaIntegration(state);
      })
      .catch(() => {
        /* row simply doesn't render the toggle */
      });
    return () => {
      cancelled = true;
    };
  }, [connectionsOpen, wearableConnected, stravaIntegration]);

  const handleAutopostToggle = (enabled: boolean): void => {
    if (!stravaIntegration) return;
    const prev = stravaIntegration;
    setStravaIntegration({ ...prev, autopost: enabled });
    setStravaAutopost(enabled).catch(() => {
      setStravaIntegration(prev);
      toast({ title: "Couldn't update the setting", variant: "destructive" });
    });
  };

  const handleStravaRefresh = async (): Promise<void> => {
    if (syncing) return;
    setSyncing(true);
    try {
      const result = await fetchStravaActivities();
      await refreshCapturedSessions();
      toast({
        title:
          result.inserted > 0
            ? `Imported ${result.inserted} new session${result.inserted === 1 ? "" : "s"}`
            : "No new sessions",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not refresh from Strava";
      toast({ title: "Refresh failed", description: message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  // Apple Health — iOS-native only; same toast contract as the Strava row.
  const healthKitAvailable = healthKitSupported();
  const healthKitConnected = profile?.healthkit_connected ?? false;
  const [hkBusy, setHkBusy] = useState(false);

  const handleHealthKitSync = async (connect: boolean): Promise<void> => {
    if (hkBusy) return;
    setHkBusy(true);
    try {
      const result = connect ? await connectHealthKit() : await fetchHealthKitWorkouts();
      if (connect) await refreshProfile();
      await refreshCapturedSessions();
      toast({
        title:
          result.inserted > 0
            ? `Imported ${result.inserted} new session${result.inserted === 1 ? "" : "s"}`
            : "No new sessions",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not sync Apple Health";
      toast({ title: "Sync failed", description: message, variant: "destructive" });
    } finally {
      setHkBusy(false);
    }
  };

  // QA gesture: 5 taps on the row inside 6s seeds a fake workout. The
  // NATIVE side is the gate (compiled only into simulator debug builds; the
  // stub rejects everywhere else) — the JS can't use import.meta.env.DEV
  // because the sim runs production-built JS. Release users who trip the
  // gesture get silence, never a scary toast. Taps while busy don't count.
  const hkTapTimes = useRef<number[]>([]);
  const handleHealthKitRow = (): void => {
    if (hkBusy) return;
    const now = Date.now();
    hkTapTimes.current = [...hkTapTimes.current.filter((t) => now - t < 6000), now];
    if (hkTapTimes.current.length >= 5) {
      hkTapTimes.current = [];
      debugSeedHealthKitWorkout()
        .then(() => toast({ title: "Seeded a test workout" }))
        .catch(() => {
          // Seed unavailable outside simulator debug builds — stay quiet.
        });
      return;
    }
    void handleHealthKitSync(!healthKitConnected);
  };

  const handleStravaConnect = (): void => {
    if (!stravaIsConfigured()) {
      toast({
        title: "Strava not configured",
        description: "VITE_STRAVA_CLIENT_ID is missing from this build.",
        variant: "destructive",
      });
      return;
    }
    window.location.href = buildStravaAuthorizeUrl();
  };

  const newestPending = pendingSessions[0] ?? null;

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-2xl overflow-x-clip p-6 pb-9 md:p-10 lg:p-12">

      {/* ── Resume banner — a live session outranks everything on reopen ── */}
      {activeSeed && (
        <Link
          to="/workouts/active"
          className="mb-4 flex min-h-[52px] items-center justify-between gap-4 rounded-[13px] border border-primary/40 bg-primary/10 px-4 py-3.5 animate-reveal-up transition-transform duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-fg">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-primary" />
            <span className="truncate">
              Resume workout{activeSeed.name ? ` — ${activeSeed.name}` : ""}
              {activeMinutes !== null && activeMinutes > 0 ? ` · ${activeMinutes} min in` : ""}
            </span>
          </span>
          <ChevronsRight size={16} className="shrink-0 text-primary" />
        </Link>
      )}

      {/* ── Eyebrow row — the only header ── */}
      <header className="flex items-center justify-between gap-3 animate-reveal-up">
        <p className="eyebrow">
          {dayLabel}, {dateLabel}
        </p>
        <div className="-my-2 flex items-center gap-1.5">
          {firstName && <span className="eyebrow">{firstName}</span>}
          <div className="-mr-2 md:hidden">
            <ThemeToggle compact />
          </div>
        </div>
      </header>

      {/* ── Hero ink panel: the next workout. Split position, the pick,
          its last-time numbers, one recovery line, one CTA. ── */}
      <section className="mt-6 md:mt-8 animate-reveal-up">
        <div className="relative overflow-hidden rounded-[18px] bg-foreground p-5 text-background shadow-[0_8px_24px_rgba(16,22,35,0.16)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          <div className="relative z-10">
            {/* Split-position line — "what day of my split is it" as a
                label, never a calendar to interpret. */}
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary-on-inverse))]">
              {!dataReady
                ? "Next up"
                : suggestion.kind === "rest"
                  ? "Rest day"
                  : splitLabel
                    ? `Next up · ${splitLabel}`
                    : "Next up"}
            </p>

            {/* The pick itself — the reason this screen exists. */}
            <h2 className="mt-1.5 text-[26px] font-semibold leading-8 tracking-[-0.01em] text-background">
              {dataReady ? suggestion.title : "Syncing…"}
            </h2>

            {/* The pick's numbers to beat — last-time top sets, pre-loaded
                (the #1-praised pattern: progressive overload without a
                chart). Falls back to last-vs-previous deltas. */}
            {(toBeat.length > 0 || deltas.length > 0) && (
              <div className="mt-3 border-t border-background/10 pt-2">
                {(toBeat.length > 0 ? toBeat : null)?.map((row) => (
                  <div key={row.name} className="flex items-center justify-between gap-3 py-1">
                    <span className="min-w-0 truncate text-sm font-medium capitalize text-background/90">
                      {row.name}
                    </span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-background/80">
                      {row.line}
                    </span>
                  </div>
                ))}
                {toBeat.length === 0 &&
                  deltas.slice(0, 3).map((d) => (
                    <div key={d.name} className="flex items-center justify-between gap-3 py-1">
                      <span className="min-w-0 truncate text-sm font-medium text-background/90">
                        {d.name}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-background/70">
                        {d.metric === "time"
                          ? `${formatHold(d.prev[0])} → ${formatHold(d.last[0])}`
                          : d.prev[0] <= 0 && d.last[0] <= 0
                            ? `${d.prev[1]} → ${d.last[1]} reps`
                            : `${d.prev[0]} × ${d.prev[1]} → ${d.last[0]} × ${d.last[1]}`}
                        <span
                          role="img"
                          aria-label={
                            d.direction === "up"
                              ? "improved"
                              : d.direction === "down"
                                ? "lower"
                                : "matched"
                          }
                          className={`ml-1.5 ${
                            d.direction === "up"
                              ? "text-[hsl(var(--primary-on-inverse))]"
                              : "text-background/45"
                          }`}
                        >
                          {d.direction === "up" ? "▲" : d.direction === "down" ? "▽" : "—"}
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {sentence && (
              <p className="mt-3 line-clamp-2 max-w-md text-[13px] leading-5 text-background/65">
                {sentence}
              </p>
            )}

            {/* Recovery line — a state word, not a gauge. Speaks in the
                sentence above only when ≥2 overnight flags agree. */}
            {recoveryLine && (
              <button
                type="button"
                onClick={() => setRecoveryOpen(true)}
                aria-label={`Recovery: ${recoveryLine.word}. Open details`}
                className="relative mt-3 flex items-center gap-2 rounded-md text-left after:absolute after:-inset-x-1 after:-inset-y-3 after:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 rounded-full ${
                    recoveryLine.tone === "good"
                      ? "bg-[hsl(var(--primary-on-inverse))]"
                      : recoveryLine.tone === "warn"
                        ? "border-[1.5px] border-[hsl(var(--primary-on-inverse))] bg-transparent"
                        : "bg-background/40"
                  }`}
                />
                <span className="text-[13px] font-semibold text-background/85">
                  {recoveryLine.word}
                </span>
                <ChevronsRight size={13} className="text-background/50" />
              </button>
            )}

            {/* The one CTA on this screen — starts the exact pick
                pre-seeded. The quiet chevron is the swap valve. */}
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSuggestionStart}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[hsl(var(--primary-on-inverse))] px-5 py-3 text-[14px] font-semibold text-foreground transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                {ctaLabel}
                <ChevronsRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => navigate("/workouts")}
                aria-label="Choose a different workout"
                className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-full border border-background/25 text-background/80 transition hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              >
                <ChevronDown size={17} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Card index ── */}
      <nav aria-label="Dashboard index" className="mt-4 space-y-2.5 animate-reveal-up">
        {/* PR strip — the three numbers a lifter recites. Raw best
            weights; a record broken in the last 72h lights up. */}
        {records.length > 0 && (
          <Link
            to="/progress"
            className="group block rounded-[13px] bg-card px-4 py-3.5 shadow-[0_4px_12px_rgba(16,22,35,0.08)] transition-[transform,box-shadow] duration-150 active:scale-[0.99] dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                Records
              </p>
              <ArrowRight
                size={14}
                className="shrink-0 text-primary transition-transform duration-200 group-hover:translate-x-0.5"
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {records.map((r) => (
                <div key={r.label} className="min-w-0">
                  <p
                    className={`stat-scoreboard whitespace-nowrap text-[26px] leading-8 ${
                      r.recent ? "text-primary" : "text-fg"
                    }`}
                  >
                    {r.weight}
                    <span className="ml-1 text-[12px] font-medium text-fg-muted">
                      {units}
                    </span>
                  </p>
                  <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                    {r.label}
                  </p>
                </div>
              ))}
            </div>
          </Link>
        )}

        {/* Consistency — week dots, never a daily streak. Doubles as the
            mobile route into the calendar. */}
        <Link
          to="/calendar"
          className="group block rounded-[13px] bg-card px-4 py-3.5 shadow-[0_4px_12px_rgba(16,22,35,0.08)] transition-[transform,box-shadow] duration-150 active:scale-[0.99] dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
              This week
            </p>
            <span className="caption whitespace-nowrap">
              {weekStats.sessions > 0
                ? `${weekStats.sessions} session${weekStats.sessions === 1 ? "" : "s"}`
                : ""}
              {weeklyStreak > 1 ? ` · ${weeklyStreak}-week streak` : ""}
              {weekStats.sessions === 0 && weeklyStreak <= 1 ? "Calendar" : ""}
            </span>
          </div>
          <div className="mt-2.5">
            <WeekBadgeRow workedDayIndices={weekStats.workedDayIndices} variant="surface" />
          </div>
        </Link>

        {pendingCount > 0 && newestPending && (
          <Link to={`/workouts/review/${newestPending.id}`} className={ROW_CLASS}>
            <RowLabel>Pending reviews</RowLabel>
            <RowEnd
              value={
                <span className="flex items-center gap-1.5">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-primary" />
                  <span className="mono font-semibold text-fg">{pendingCount}</span>
                </span>
              }
            />
          </Link>
        )}

        {/* Sync plumbing is settings, not daily-return content — one quiet
            disclosure instead of two always-on rows. */}
        <button
          type="button"
          onClick={() => setConnectionsOpen((v) => !v)}
          aria-expanded={connectionsOpen}
          className="flex min-h-11 w-full items-center justify-between rule-hairline px-1 pt-2 text-left"
        >
          <span className="caption !text-fg-muted">Connections</span>
          <ChevronDown
            size={14}
            className={`text-fg-muted transition-transform ${connectionsOpen ? "rotate-180" : ""}`}
          />
        </button>

        {connectionsOpen &&
          (wearableConnected ? (
            <>
              <button
                type="button"
                onClick={handleStravaRefresh}
                disabled={syncing}
                className={`${ROW_CLASS} disabled:cursor-not-allowed`}
              >
                <RowLabel>Strava</RowLabel>
                <RowEnd
                  value={syncing ? "Refreshing…" : "Connected"}
                  icon={
                    <RefreshCw
                      size={14}
                      className={`text-fg-muted ${syncing ? "animate-spin" : ""}`}
                    />
                  }
                />
              </button>

              {/* Write-back — a setting, not a daily action. Tokens from
                  before the write-back release lack activity:write; the row
                  routes those through one more consent screen. */}
              {stravaIntegration &&
                (stravaIntegration.canWrite ? (
                  <div className="space-y-1.5">
                    <label className={`${ROW_CLASS} cursor-pointer`}>
                      <RowLabel>Post workouts to Strava</RowLabel>
                      <Switch
                        checked={stravaIntegration.autopost}
                        onCheckedChange={handleAutopostToggle}
                        aria-label="Post workouts to Strava"
                      />
                    </label>
                    {stravaIntegration.autopost && (
                      <p className="px-4 text-[11px] leading-4 text-fg-muted">
                        Posts use your Strava default visibility. If another app
                        already sends your workouts to Strava, pick one source —
                        both will double-post.
                      </p>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleStravaConnect}
                    className={ROW_CLASS}
                  >
                    <RowLabel>Post workouts to Strava</RowLabel>
                    <RowEnd value="Reconnect to enable" />
                  </button>
                ))}
            </>
          ) : (
            <button type="button" onClick={handleStravaConnect} className={ROW_CLASS}>
              <RowLabel>Strava</RowLabel>
              <RowEnd value="Not connected" />
            </button>
          ))}

        {/* Native iOS only — the web build never shows Apple Health. Not
            disabled while busy: the sync handler no-ops on re-entry, and a
            disabled button would eat the 5-tap seed gesture. */}
        {connectionsOpen && healthKitAvailable && (
          <button type="button" onClick={handleHealthKitRow} className={ROW_CLASS}>
            <RowLabel>Apple Health</RowLabel>
            {healthKitConnected ? (
              <RowEnd
                value={hkBusy ? "Refreshing…" : "Connected"}
                icon={
                  <RefreshCw
                    size={14}
                    className={`text-fg-muted ${hkBusy ? "animate-spin" : ""}`}
                  />
                }
              />
            ) : (
              <RowEnd value={hkBusy ? "Connecting…" : "Not connected"} />
            )}
          </button>
        )}
      </nav>

      <RecoverySheet
        open={recoveryOpen}
        onOpenChange={setRecoveryOpen}
        assessment={readiness}
        freshness={freshness}
        targetMuscles={suggestion.muscles}
      />
    </div>
  );
};

export default Dashboard;
