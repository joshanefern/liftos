import { DotMatrixMeter } from "@/components/home/DotMatrixMeter";
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
  connectHealthKit,
  debugSeedHealthKitWorkout,
  fetchHealthKitWorkouts,
  healthKitSupported,
} from "@/lib/healthkit";
import { getMuscleActivation } from "@/lib/muscleMap";
import { normalizeExerciseName } from "@/lib/prs";
import {
  buildSessionFromStarter,
  buildSessionFromTemplate,
  persistActiveSession,
} from "@/lib/startSession";
import { suggestNextWorkout } from "@/lib/suggestion";
import { getTopLifts, getWeeklyVolumeTarget, getWeekStats } from "@/lib/workoutStats";
import { buildCoachContext, fetchDailyInsight } from "@/lib/coach";
import { useDayKey } from "@/hooks/useDayKey";
import { ArrowRight, ChevronsRight, RefreshCw } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

/** First sentence of a coach insight — the hero screen carries one line, no paragraphs. */
const firstSentence = (text: string): string => {
  const match = text.match(/^[\s\S]*?[.!?](?=["')\]]*(\s|$))/);
  return (match?.[0] ?? text).trim();
};

/* "8.2k" — the Calendar fmtVol compaction, sans unit (the trio carries the
   unit in its label instead). */
const fmtVolCompact = (v: number): string =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v).toLocaleString();

/** Total minutes → "H:MM". */
const fmtHours = (minutes: number): string =>
  `${Math.floor(minutes / 60)}:${String(Math.round(minutes) % 60).padStart(2, "0")}`;

/** Polyline points for a tiny sparkline in a 100×24 viewBox. */
const sparkPoints = (values: number[], w = 100, h = 24, pad = 3): string => {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = max === min ? h / 2 : pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

/* ── Depth cards: white cards with a cool ink shadow in light that
   deepens to black over slate in dark. ── */

const ROW_CLASS =
  "group flex min-h-[52px] w-full items-center justify-between gap-4 rounded-[13px] " +
  "bg-card px-4 py-3.5 text-left shadow-[0_4px_12px_rgba(16,22,35,0.08)] " +
  "transition-[transform,box-shadow] duration-150 active:scale-[0.99] " +
  "dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/* Micro-tile: same depth-card recipe as ROW_CLASS, columnar for eyebrow +
   value + tiny graphic. */
const TILE_CLASS =
  "group flex min-h-[44px] flex-1 flex-col rounded-[14px] bg-card px-4 py-3 " +
  "shadow-[0_4px_12px_rgba(16,22,35,0.08)] transition-[transform,box-shadow] " +
  "duration-150 active:scale-[0.99] dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const EYEBROW_MINI = "text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted";

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
  // Profile stores frequency as prose ("3–4 days") — strip the unit so the
  // trio renders "0/3–4" instead of wrapping.
  const frequency =
    String(profile?.frequency ?? "–").replace(/\s*days?\s*/i, "").trim() || "–";
  const units = profile?.units ?? "lb";

  const weekStats = useMemo(() => getWeekStats(logs), [logs]);
  const volumeTarget = useMemo(() => getWeeklyVolumeTarget(logs), [logs]);
  const topLifts = useMemo(() => getTopLifts(logs), [logs]);
  const activation = useMemo(() => getMuscleActivation(logs, 7), [logs]);
  const musclesTrained = activation.primary.size;

  // Last ~6 top-set weights for the current top lift, oldest → newest, one
  // point per session that includes the exercise (warmups excluded).
  const topLiftSpark = useMemo(() => {
    const top = topLifts[0];
    if (!top) return [];
    const key = normalizeExerciseName(top.name);
    const points: number[] = [];
    const chronological = [...logs].sort(
      (a, b) => Date.parse(a.finished_at) - Date.parse(b.finished_at),
    );
    for (const log of chronological) {
      let best = 0;
      for (const exercise of log.exercises) {
        if (normalizeExerciseName(exercise.name) !== key) continue;
        for (const set of exercise.sets) {
          if (!set.completed || set.isWarmup) continue;
          if (typeof set.weight === "number" && set.weight > best) best = set.weight;
        }
      }
      if (best > 0) points.push(best);
    }
    return points.slice(-6);
  }, [logs, topLifts]);

  const lastLog = logs[0] ?? null;

  // The engine's pick — names the CTA and (absent an AI insight) the sentence.
  // dayKey keeps the trained-today boundary honest across midnight.
  const suggestion = useMemo(
    () => suggestNextWorkout({ logs, templates, starters: starterPrograms, profile }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, templates, profile, dayKey],
  );

  // One tap starts the named session pre-seeded; rest-day picks, still-loading
  // data, and any stale id fall back to the library, so the CTA never
  // dead-ends.
  const handleSuggestionStart = (): void => {
    if (!dataReady) {
      navigate("/workouts");
      return;
    }
    if (suggestion.kind === "template") {
      const template = templates.find((t) => t.id === suggestion.id);
      if (template) {
        persistActiveSession(buildSessionFromTemplate(template));
        navigate("/workouts/active");
        return;
      }
    } else if (suggestion.kind === "starter") {
      const program = starterPrograms.find((p) => p.id === suggestion.id);
      if (program) {
        persistActiveSession(buildSessionFromStarter(program));
        navigate("/workouts/active");
        return;
      }
    }
    navigate("/workouts");
  };

  // hrDetailSessions: full rows (samples included) for the newest HR-bearing
  // sessions — the list itself is summary-only and can't feed the coach.
  const { hrDetailSessions, refresh: refreshCapturedSessions } = useCapturedSessions();

  const coachContext = useMemo(
    () => buildCoachContext(logs, profile, hrDetailSessions, suggestion),
    [logs, profile, hrDetailSessions, suggestion],
  );

  const [insight, setInsight] = useState<string | null>(null);

  useEffect(() => {
    // Wait for both queries — an insight generated against a half-loaded pick
    // would be cached for the rest of the day.
    if (!dataReady || !lastLog) return;
    let cancelled = false;
    fetchDailyInsight(coachContext)
      .then((text) => {
        if (!cancelled) setInsight(text);
      })
      .catch(() => {
        if (!cancelled) setInsight(null); // coach offline → computed fallback below, no AI claim
      });
    return () => {
      cancelled = true;
    };
    // Cached per (user, local day, pick) inside fetchDailyInsight; re-run when
    // the newest log, the pick, or the local day changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady, lastLog?.id, suggestion.kind, suggestion.title, dayKey]);

  // One supporting sentence, max: AI insight (first sentence) → suggestion
  // reason → last-session fact → first-workout nudge. The computed line
  // renders immediately; the coach line replaces it when it arrives — no
  // skeleton flash. When the AI insight is present the reason goes unused,
  // but the CTA still names the pick. Until both queries settle the hero
  // stays neutral — never the brand-new-account pick for an established user.
  const sentence = !dataReady
    ? "Syncing your training…"
    : insight
      ? firstSentence(insight)
      : suggestion.reason ||
        (lastLog
          ? `Last session: ${lastLog.name} — ${lastLog.completed_sets} sets, ${lastLog.total_volume.toLocaleString()} ${units} volume.`
          : "Log your first workout to start tracking.");

  const ctaLabel = dataReady ? suggestion.ctaLabel : "Start a workout";

  const [syncing, setSyncing] = useState(false);
  const wearableConnected = profile?.wearable_connected ?? false;

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
    <div className="relative mx-auto min-h-screen w-full max-w-2xl overflow-x-clip p-5 pb-9 md:p-10 lg:p-12">

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

      {/* ── Hero ink panel ── */}
      <section className="mt-6 md:mt-8 animate-reveal-up">
        <div className="relative overflow-hidden rounded-[18px] bg-foreground p-5 text-background shadow-[0_8px_24px_rgba(16,22,35,0.16)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          <div className="relative z-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              This week
            </p>

            <div className="mt-3.5">
              <WeekBadgeRow workedDayIndices={weekStats.workedDayIndices} />
            </div>

            {/* Stat trio — inset row on the panel */}
            <div className="mt-4 grid grid-cols-3 divide-x divide-background/10 rounded-xl bg-background/10 py-2.5 backdrop-blur-md">
              <div className="flex flex-col items-center gap-0.5 px-2">
                <p className="text-[22px] font-extralight leading-7 tabular-nums text-background">
                  {weekStats.sessions}
                  <span className="ml-0.5 text-[11px] font-normal text-background/50">
                    /{frequency}
                  </span>
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-background/50">
                  Sessions
                </p>
              </div>
              <div className="flex flex-col items-center gap-0.5 px-2">
                <p className="text-[22px] font-extralight leading-7 tabular-nums text-background">
                  {fmtVolCompact(weekStats.totalVolume)}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-background/50">
                  {units} volume
                </p>
              </div>
              <div className="flex flex-col items-center gap-0.5 px-2">
                <p className="text-[22px] font-extralight leading-7 tabular-nums text-background">
                  {fmtHours(weekStats.totalMinutes)}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-background/50">
                  Hours
                </p>
              </div>
            </div>

            <p className="mt-4 line-clamp-2 max-w-md text-[13px] leading-5 text-background/60">
              {sentence}
            </p>

            {/* The one CTA on this screen — names the engine's pick and
                starts that exact session pre-seeded. */}
            <button
              type="button"
              onClick={handleSuggestionStart}
              className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-full bg-background px-5 py-3 text-[14px] font-semibold text-foreground transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {ctaLabel}
              <ChevronsRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {/* ── Card index ── */}
      <nav aria-label="Dashboard index" className="mt-4 space-y-2.5 animate-reveal-up">
        <DotMatrixMeter
          value={weekStats.totalVolume}
          target={volumeTarget}
          label="Weekly volume"
          unit={units}
        />

        {/* Micro-tile row */}
        <div className="flex gap-2.5">
          <Link to="/progress" className={TILE_CLASS}>
            <p className={EYEBROW_MINI}>Top lift</p>
            {topLifts[0] ? (
              <>
                <p className="mt-1.5 truncate text-base font-bold tabular-nums text-fg">
                  {topLifts[0].weight} {units}
                  <span className="ml-1.5 text-[11px] font-normal text-fg-muted">
                    {topLifts[0].name}
                  </span>
                </p>
                {topLiftSpark.length >= 2 && (
                  <svg
                    viewBox="0 0 100 24"
                    preserveAspectRatio="none"
                    aria-hidden
                    className="mt-auto h-6 w-full pt-1"
                  >
                    <polyline
                      points={sparkPoints(topLiftSpark)}
                      fill="none"
                      stroke="hsl(var(--chart-line))"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                )}
              </>
            ) : (
              <p className="mt-1.5 text-base font-bold text-fg">—</p>
            )}
          </Link>

          <Link to="/progress#coverage" className={TILE_CLASS}>
            <p className={EYEBROW_MINI}>Coverage</p>
            <p className="mt-1.5 text-base font-bold tabular-nums text-fg">
              {musclesTrained}
              <span className="ml-1.5 text-[11px] font-normal text-fg-muted">muscles hot</span>
            </p>
            <span aria-hidden className="mt-auto flex gap-1 pt-2">
              {Array.from({ length: 5 }, (_, i) => (
                <span
                  key={i}
                  className={`h-[7px] w-[7px] rounded-full ${
                    i < Math.min(musclesTrained, 5) ? "bg-primary" : "bg-secondary"
                  }`}
                />
              ))}
            </span>
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

        {wearableConnected ? (
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
        ) : (
          <button type="button" onClick={handleStravaConnect} className={ROW_CLASS}>
            <RowLabel>Strava</RowLabel>
            <RowEnd value="Not connected" />
          </button>
        )}

        {/* Native iOS only — the web build never shows Apple Health. Not
            disabled while busy: the sync handler no-ops on re-entry, and a
            disabled button would eat the 5-tap seed gesture. */}
        {healthKitAvailable && (
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
    </div>
  );
};

export default Dashboard;
