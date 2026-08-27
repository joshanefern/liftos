import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/ui/use-toast";
import { useCapturedSessions } from "@/context/CapturedSessionsProvider";
import { useUser } from "@/context/UserContext";
import { starterPrograms } from "@/data/starterPrograms";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import { usePendingReviews } from "@/hooks/usePendingReviews";
import {
  connectHealthKit,
  debugSeedHealthKitWorkout,
  fetchHealthKitWorkouts,
  healthKitSupported,
} from "@/lib/healthkit";
import { prStrip } from "@/lib/bigThree";
import { trackingFor } from "@/lib/exerciseTracking";
import { labelForMuscle } from "@/lib/muscleCoverage";
import type { Muscle } from "@/lib/muscleMap";
import { muscleFreshnessFromLogs, trimSessionForRecovery } from "@/lib/recovery";
import { ACTIVE_WORKOUT_STORAGE_KEY } from "@/lib/startSession";
import {
  buildSessionFromStarter,
  buildSessionFromTemplate,
  persistActiveSession,
} from "@/lib/startSession";
import { suggestNextWorkout } from "@/lib/suggestion";
import { isPlaceholderName } from "@/lib/exerciseNames";
import { getMonthStats, getWeeklyStreak, getWeekStats, localDayParam } from "@/lib/workoutStats";
import { useDayKey } from "@/hooks/useDayKey";
import { useReadiness } from "@/hooks/useReadiness";
import { RecoverySheet } from "@/components/home/RecoverySheet";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import type { ActiveSession } from "@/pages/ActiveWorkout";
import { CalendarDays, ChevronsRight, RefreshCw } from "lucide-react";
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

/* The tappable affordance on every card — a small filled pill with a verb,
   not a lone arrow glyph. Purely visual (the whole card is the link). */
const OpenPill = ({ label = "Open" }: { label?: string }) => (
  <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-[12px] font-semibold text-primary-foreground">
    {label}
    <ChevronsRight size={13} />
  </span>
);

const RowEnd = ({
  value,
  icon,
  label,
}: {
  value?: ReactNode;
  icon?: ReactNode;
  label?: string;
}) => (
  <span className="flex shrink-0 items-center gap-3">
    {value != null && <span className="caption whitespace-nowrap">{value}</span>}
    {icon ?? <OpenPill label={label} />}
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const monthStats = useMemo(() => getMonthStats(logs), [logs, dayKey]);
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

  // Without a wearable verdict, recovery is COMPUTED from training history:
  // the freshness of the muscles today's pick targets (falls back to every
  // trained muscle on rest days / unknown picks). Shown as a percentage —
  // it's a real number from real sets, not a vibe.
  const computedRecovery = useMemo(() => {
    const byMuscle = new Map(freshness.map((f) => [f.muscle, f.freshness]));
    const targets = suggestion.muscles.length > 0 ? suggestion.muscles : freshness.map((f) => f.muscle);
    let worst: { muscle: Muscle; value: number } | null = null;
    let sum = 0;
    let n = 0;
    for (const muscle of targets) {
      const value = byMuscle.get(muscle) ?? 1;
      sum += value;
      n += 1;
      if (!worst || value < worst.value) worst = { muscle, value };
    }
    if (n === 0) return null;
    return { pct: Math.round((sum / n) * 100), worst };
  }, [freshness, suggestion.muscles]);

  // The recovery line names its SOURCE. Apple Watch data (via Health) gives
  // the overnight verdict; without it the number is computed from the log.
  const recoveryLine = useMemo(():
    | { word: string; source: string; tone: "good" | "neutral" | "warn" }
    | null => {
    if (readiness?.state === "primed") return { word: "Primed", source: "Apple Watch", tone: "good" };
    if (readiness?.state === "steady") return { word: "Steady", source: "Apple Watch", tone: "neutral" };
    if (readiness?.state === "run_down") return { word: "Run down", source: "Apple Watch", tone: "warn" };
    if (readiness?.baselineDaysRemaining != null) {
      return {
        word: `Learning baseline · ${readiness.baselineDaysRemaining}d`,
        source: "Apple Watch",
        tone: "neutral",
      };
    }
    if (logs.length === 0 || !computedRecovery) return null;
    const { pct, worst } = computedRecovery;
    if (pct >= 85) return { word: `${pct}% recovered`, source: "from your training", tone: "good" };
    return {
      word: worst && worst.value < 0.85
        ? `${pct}% recovered · ${labelForMuscle(worst.muscle)} ${Math.round(worst.value * 100)}%`
        : `${pct}% recovered`,
      source: "from your training",
      tone: pct < 60 ? "warn" : "neutral",
    };
  }, [readiness, computedRecovery, logs.length]);

  // The pick's shape — what you're walking into: how many lifts and sets,
  // roughly how long, when you last ran this exact session and how it went.
  // Replaces the per-exercise number rows (owner: "put something meaningful").
  const sessionShape = useMemo(() => {
    const picked =
      suggestion.kind === "template"
        ? templates.find((t) => t.id === suggestion.id)?.exercises
        : suggestion.kind === "starter"
          ? starterPrograms.find((p) => p.id === suggestion.id)?.exercises
          : undefined;
    if (!picked) return null;
    // The shape trio adapts to what the session actually contains: SETS
    // counts strength work (lifts + holds, never cardio blocks), REPS only
    // counts rep-tracked lifts (a plank has sets but no reps), MIN is
    // always shown and folds cardio duration in. Pure cardio → MIN alone.
    const named = picked.filter((e) => !isPlaceholderName(e.name));
    const strength = named.filter((e) => e.kind !== "cardio");
    const sets = strength.reduce((n, e) => n + e.sets.length, 0);
    const reps = strength
      .filter((e) => trackingFor(e) === "reps")
      .reduce(
        (n, e) => n + e.sets.reduce((r, s) => r + (typeof s.reps === "number" ? s.reps : 0), 0),
        0,
      );
    const cardioMinutes =
      named
        .filter((e) => e.kind === "cardio")
        .reduce((n, e) => n + e.sets.reduce((r, s) => r + (s.duration_seconds ?? 0), 0), 0) / 60;
    // 3 min per strength set (set + rest) plus the cardio you planned.
    const minutes = Math.max(5, Math.round(sets * 3 + cardioMinutes));

    // Last time THIS session ran — matched by template id first, then by
    // name so starters and renamed templates still resolve.
    const key = suggestion.title.trim().toLowerCase();
    const last = logs.find(
      (l) =>
        (suggestion.kind === "template" && l.template_id === suggestion.id) ||
        l.name.trim().toLowerCase() === key,
    );
    return {
      sets,
      reps,
      minutes,
      last: last
        ? {
            when: fmtAgo(last.finished_at),
            volume: last.total_volume,
            // Legacy imports carry bogus 1-min durations — say nothing under 5.
            minutes: last.duration_minutes && last.duration_minutes >= 5 ? last.duration_minutes : null,
          }
        : null,
    };
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

  // The banner owns "Resume"; the hero CTA always reads as the pick. (It
  // still routes into the live session when one exists — see
  // handleSuggestionStart — so a seed is never silently overwritten.)
  const ctaLabel = dataReady ? suggestion.ctaLabel : "Start a workout";

  const [connectionsOpen, setConnectionsOpen] = useState(false);

  // Apple Health — iOS-native only.
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

            {/* The session's shape — only the tiles that mean something for
                THIS session: a plank day has sets but no reps, a run has
                only minutes. MIN always shows and includes planned cardio. */}
            {sessionShape && (
              <div className="mt-3 border-t border-background/10 pt-3">
                <div className="flex items-baseline gap-5">
                  {sessionShape.sets > 0 && (
                    <div>
                      <p className="stat-scoreboard text-[28px] leading-8 text-background">
                        {sessionShape.sets}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-background/55">
                        sets
                      </p>
                    </div>
                  )}
                  {sessionShape.reps > 0 && (
                    <div>
                      <p className="stat-scoreboard text-[28px] leading-8 text-background">
                        {sessionShape.reps}
                      </p>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-background/55">
                        reps
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="stat-scoreboard text-[28px] leading-8 text-background">
                      {sessionShape.minutes}
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-background/55">
                      min
                    </p>
                  </div>
                </div>
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
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    recoveryLine.tone === "good"
                      ? "bg-[hsl(var(--primary-on-inverse))]"
                      : recoveryLine.tone === "warn"
                        ? "border-[1.5px] border-[hsl(var(--primary-on-inverse))] bg-transparent"
                        : "bg-background/40"
                  }`}
                />
                {/* One flowing span: the word and source wrap as a sentence,
                    never as two side-by-side squeezed columns. */}
                <span className="min-w-0 text-[13px] font-semibold leading-5 text-background/85">
                  {recoveryLine.word}{" "}
                  <span className="whitespace-nowrap text-[11px] font-normal text-background/45">
                    · {recoveryLine.source}
                  </span>
                </span>
                <ChevronsRight size={13} className="shrink-0 text-background/50" />
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

            </div>
          </div>
        </div>
      </section>

      {/* ── Card index ── */}
      <nav aria-label="Dashboard index" className="mt-4 space-y-2.5 animate-reveal-up">
        {/* Last workout — one tap to the full summary (exercises, top sets,
            PRs, notes) that the recap showed; it lives on the calendar day. */}
        {lastLog && (
          <Link
            to={`/calendar?day=${localDayParam(lastLog.finished_at)}`}
            className={ROW_CLASS}
          >
            <span className="min-w-0">
              <RowLabel>Last workout</RowLabel>
              <span className="mt-0.5 block truncate text-[12px] leading-4 text-fg-muted">
                {lastLog.name} · {fmtAgo(lastLog.finished_at).toLowerCase() === "today" ? "today" : `${fmtAgo(lastLog.finished_at)} ago`}
                {lastLog.completed_sets > 0 ? ` · ${lastLog.completed_sets} sets` : ""}
                {lastLog.total_volume > 0
                  ? ` · ${Math.round(lastLog.total_volume).toLocaleString()} ${units}`
                  : ""}
              </span>
            </span>
            <RowEnd label="View" />
          </Link>
        )}

        {/* Personal records — the three numbers a lifter recites. Raw best
            weights; a record broken in the last 72h lights up. */}
        {records.length > 0 && (
          <Link
            to="/progress"
            className="group block rounded-[13px] bg-card px-4 pb-4 pt-3.5 shadow-[0_4px_12px_rgba(16,22,35,0.08)] transition-[transform,box-shadow] duration-150 active:scale-[0.99] dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg">
                Personal records
              </p>
              <OpenPill label="All" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {records.map((r) => (
                <div
                  key={r.label}
                  className="min-w-0 rounded-[10px] bg-foreground/[0.04] px-3 py-2.5"
                >
                  <p className="stat-scoreboard whitespace-nowrap text-[26px] leading-8 tabular-nums text-fg">
                    {r.weight}
                    <span className="ml-1 text-[11px] font-medium tracking-normal text-fg-muted">
                      {units}
                    </span>
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] font-medium leading-4 text-fg-soft first-letter:uppercase">
                    {r.label}
                  </p>
                </div>
              ))}
            </div>
          </Link>
        )}

        {/* Training this month — sessions, weekly streak, weight moved —
            plus the one obvious way into the calendar. */}
        <div className="rounded-[13px] bg-card px-4 pb-3 pt-3.5 shadow-[0_4px_12px_rgba(16,22,35,0.08)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg">
              This month
            </p>
            {weeklyStreak > 1 && (
              <span className="caption whitespace-nowrap">{weeklyStreak}-week streak</span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-[10px] bg-foreground/[0.04] px-3 py-2.5">
              <p className="stat-scoreboard text-[26px] leading-8 tabular-nums text-fg">
                {monthStats.count}
              </p>
              <p className="mt-0.5 text-[11px] font-medium leading-4 text-fg-soft">
                {monthStats.count === 1 ? "session" : "sessions"}
              </p>
            </div>
            <div className="rounded-[10px] bg-foreground/[0.04] px-3 py-2.5">
              <p className="stat-scoreboard text-[26px] leading-8 tabular-nums text-fg">
                {weekStats.sessions}
              </p>
              <p className="mt-0.5 text-[11px] font-medium leading-4 text-fg-soft">this week</p>
            </div>
            <div className="rounded-[10px] bg-foreground/[0.04] px-3 py-2.5">
              <p className="stat-scoreboard whitespace-nowrap text-[26px] leading-8 tabular-nums text-fg">
                {monthStats.volume >= 1000
                  ? `${(monthStats.volume / 1000).toFixed(monthStats.volume >= 10_000 ? 0 : 1)}k`
                  : monthStats.volume}
              </p>
              <p className="mt-0.5 text-[11px] font-medium leading-4 text-fg-soft">{units} lifted</p>
            </div>
          </div>
          <Link
            to="/calendar"
            className="mt-2 flex min-h-11 items-center justify-between rounded-md text-sm font-semibold text-fg transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="flex items-center gap-2">
              <CalendarDays size={15} className="text-primary" />
              Calendar
            </span>
            <OpenPill />
          </Link>
        </div>

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

        {/* Connections — a button that opens the sheet (Apple Health toggle
            lives there). iOS-native only: the web has nothing to connect. */}
        {healthKitAvailable && (
          <button
            type="button"
            onClick={() => setConnectionsOpen(true)}
            className={ROW_CLASS}
          >
            <RowLabel>Connections</RowLabel>
            <RowEnd value={healthKitConnected ? "Apple Health on" : "None"} label="Manage" />
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

      <Drawer open={connectionsOpen} onOpenChange={setConnectionsOpen}>
        <DrawerContent className="px-6 pb-8">
          <p className="eyebrow mt-4 !text-primary">Connections</p>
          <DrawerTitle className="heading-md mt-2 text-fg">Where your data comes from</DrawerTitle>

          <label className={`${ROW_CLASS} mt-4 cursor-pointer`}>
            <span className="min-w-0">
              <RowLabel>Apple Health</RowLabel>
              <span className="mt-0.5 block text-[12px] leading-4 text-fg-muted">
                Workouts from your watch, overnight recovery vitals
              </span>
            </span>
            <Switch
              checked={healthKitConnected}
              disabled={hkBusy || healthKitConnected}
              onCheckedChange={(on) => {
                if (on && !healthKitConnected) void handleHealthKitSync(true);
              }}
              aria-label="Connect Apple Health"
            />
          </label>
          {healthKitConnected && (
            <button
              type="button"
              onClick={handleHealthKitRow}
              className={`${ROW_CLASS} mt-2`}
            >
              <RowLabel>Sync now</RowLabel>
              <RowEnd
                value={hkBusy ? "Syncing…" : ""}
                icon={
                  <RefreshCw
                    size={14}
                    className={`text-fg-muted ${hkBusy ? "animate-spin" : ""}`}
                  />
                }
              />
            </button>
          )}
          <p className="mt-3 text-[11px] leading-4 text-fg-muted">
            {healthKitConnected
              ? "Read-only. Turn it off any time in iOS Settings → Health → Data Access & Devices."
              : "Any watch that writes to Apple Health — Apple Watch, Garmin, Whoop, Oura — flows in."}
          </p>
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default Dashboard;
