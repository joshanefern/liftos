import { ThemeToggle } from "@/components/ThemeToggle";
import { toast } from "@/components/ui/use-toast";
import { useCapturedSessions } from "@/context/CapturedSessionsProvider";
import { useUser } from "@/context/UserContext";
import { starterPrograms } from "@/data/starterPrograms";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import {
  MAX_TEMPLATES,
  TEMPLATE_LIMIT_ERROR,
  useWorkoutTemplates,
  type SupabaseTemplate,
} from "@/hooks/useWorkoutTemplates";
import { usePendingReviews } from "@/hooks/usePendingReviews";
import {
  connectHealthKit,
  debugSeedHealthKitWorkout,
  fetchHealthKitWorkouts,
  healthKitSupported,
} from "@/lib/healthkit";
import { prStrip } from "@/lib/bigThree";
import { buildCoachContext, streamCoach } from "@/lib/coach";
import {
  buildSchedulePrompt,
  buildSplitPrompt,
  clearWeekBuildMarker,
  markWeekBuildStarted,
  parseWeekPlan,
  weekBuildInProgress,
  type IntakeNotes,
  type ScheduleDay,
} from "@/lib/coachSetup";
import { SplitIntakeSheet } from "@/components/home/SplitIntakeSheet";
import { trackingFor } from "@/lib/exerciseTracking";
import { ACTIVE_WORKOUT_STORAGE_KEY } from "@/lib/startSession";
import {
  buildSessionFromStarter,
  buildSessionFromTemplate,
  persistActiveSession,
} from "@/lib/startSession";
import { suggestNextWorkout, type Suggestion } from "@/lib/suggestion";
import {
  applyReminderPrefs,
  loadReminderPrefs,
  remindersSupported,
  type ReminderPrefs,
} from "@/lib/reminders";
import { isPlaceholderName } from "@/lib/exerciseNames";
import {
  countPRsThisMonth,
  getMonthStats,
  getPrevWeekSessions,
  getWeekObservation,
  getWeeklyStreak,
  getWeekStats,
  plannedSessionsPerWeek,
  todayDayIndex,
} from "@/lib/workoutStats";
import { useDayKey } from "@/hooks/useDayKey";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import type { ActiveSession } from "@/pages/ActiveWorkout";
import { CalendarDays, ChevronsRight, RefreshCw, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

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

const CARD_CLASS =
  "rounded-[13px] bg-card shadow-[0_4px_12px_rgba(16,22,35,0.08)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)]";

const CARD_LABEL =
  "text-[10px] font-semibold uppercase tracking-[0.14em] text-[hsl(35,25%,45%)] dark:text-[hsl(38,32%,72%)]";

const ROW_CLASS =
  "group flex min-h-[52px] w-full items-center justify-between gap-4 rounded-[13px] " +
  "bg-card px-4 py-3.5 text-left shadow-[0_4px_12px_rgba(16,22,35,0.08)] " +
  "transition-[transform,box-shadow] duration-150 active:scale-[0.99] " +
  "dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/* ── Hero buttons. Primary is the app's raspberry-with-white everywhere,
   including on the ink panel (it reads fine on both the light panel's ink
   and the dark panel's porcelain — one button, both themes). Secondary is
   the outlined style. ── */
const HERO_PRIMARY =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full bg-primary px-5 py-3 text-[14px] font-semibold text-primary-foreground transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-60";
const HERO_SECONDARY =
  "inline-flex min-h-[44px] items-center gap-2 rounded-full border border-background/25 px-5 py-3 text-[14px] font-semibold text-background transition-transform duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const HERO_EYEBROW =
  "text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--primary-on-inverse))]";
const HERO_TITLE =
  "mt-1.5 text-[26px] font-semibold leading-8 tracking-[-0.01em] text-background";
const HERO_BODY = "mt-2 max-w-md text-[13px] leading-5 text-background/65";

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

/* Loading stand-in for a stat tile: the same box, two breathing bars where
   the numeral and its label will land — the card never changes height
   when the numbers arrive. */
const StatTileSkeleton = () => (
  <div aria-hidden className="rounded-[10px] bg-foreground/[0.04] px-3 py-2.5">
    <span className="skeleton mt-1 block h-6 w-10" />
    <span className="skeleton mb-0.5 mt-2 block h-3 w-14" />
  </div>
);

/* The ink hero's shape row while the pick loads: three breathing bars in
   the slots the numbers will take, so the panel never jumps. */
const ShapeSkeleton = () => (
  <div aria-hidden className="mt-3 border-t border-background/10 pt-3">
    <div className="flex items-baseline gap-5">
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <span className="skeleton skeleton-inverse block h-8 w-9" />
          <span className="skeleton skeleton-inverse mt-1 block h-3 w-8" />
        </div>
      ))}
    </div>
  </div>
);

type SessionShape = { sets: number; reps: number; minutes: number };

/* The session's shape — only the tiles that mean something for THIS
   session: a plank day has sets but no reps, a run has only minutes. MIN
   always shows and includes planned cardio. */
const ShapeTiles = ({ shape }: { shape: SessionShape }) => (
  <div className="mt-3 border-t border-background/10 pt-3">
    <div className="flex items-baseline gap-5">
      {shape.sets > 0 && (
        <div>
          <p className="stat-scoreboard text-[28px] leading-8 text-background">{shape.sets}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-background/55">
            sets
          </p>
        </div>
      )}
      {shape.reps > 0 && (
        <div>
          <p className="stat-scoreboard text-[28px] leading-8 text-background">{shape.reps}</p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-background/55">
            reps
          </p>
        </div>
      )}
      <div>
        <p className="stat-scoreboard text-[28px] leading-8 text-background">{shape.minutes}</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-background/55">
          min
        </p>
      </div>
    </div>
  </div>
);

/* How a week build was asked for. "split": the beginner's one-shot from the
   onboarding answers — its day names carry no weekday ("Push Day"), so the
   hero pins day one. "schedule": the intake's own days ("Monday · Push"),
   which the suggestion engine's weekday rule reads. */
type WeekBuildSource = "split" | "schedule";

/* ── Hero ink panel + card index — the panel inverts with the theme
   (ink-on-porcelain in light, porcelain-on-slate in dark); that
   flip is the signature, so every color inside it is a token. ── */

const Dashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, refreshProfile } = useUser();
  const { logs, loading: logsLoading, loadFailed: logsLoadFailed } = useWorkoutLogs();
  const {
    templates,
    loading: templatesLoading,
    loadFailed: templatesLoadFailed,
    save: saveTemplate,
  } = useWorkoutTemplates();
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
  // without it the week card shows LAST week's dots on the new dates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weekStats = useMemo(() => getWeekStats(logs), [logs, dayKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const weeklyStreak = useMemo(() => getWeeklyStreak(logs), [logs, dayKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const monthStats = useMemo(() => getMonthStats(logs), [logs, dayKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prevWeekSessions = useMemo(() => getPrevWeekSessions(logs), [logs, dayKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prsThisMonth = useMemo(() => countPRsThisMonth(logs), [logs, dayKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayIdx = useMemo(() => todayDayIndex(), [dayKey]);
  // The scoreboard strip: bench / squat / deadlift, backfilled with the
  // heaviest other lifts. Raw best weights, never an index.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const records = useMemo(() => prStrip(logs), [logs, dayKey]);

  // "2 of 3 planned workouts" — the plan is the onboarding frequency answer
  // ("3–4 days" → 3). Unknown → the card shows a plain count instead.
  const plannedPerWeek = plannedSessionsPerWeek(profile?.frequency);
  const weekObservation = useMemo(
    () =>
      getWeekObservation({
        sessions: weekStats.sessions,
        planned: plannedPerWeek,
        weeklyStreak,
        prsThisMonth,
        prevWeekSessions,
      }),
    [weekStats.sessions, plannedPerWeek, weeklyStreak, prsThisMonth, prevWeekSessions],
  );

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

  // The engine's pick — names the CTA and (absent an AI insight) the sentence.
  // dayKey keeps the trained-today boundary honest across midnight.
  const suggestion = useMemo(
    () => suggestNextWorkout({ logs, templates, starters: starterPrograms, profile }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logs, templates, profile, dayKey],
  );

  // ── The first plan just landed (this mount, no history yet): the hero
  // says "Here's your first workout" and "Start" — the moment the
  // onboarding steps were for. WHICH workout depends on how the week was
  // built. The beginner split names days by their work ("Push Day", "Pull
  // Day", "Leg Day"), and with zero history every template scores the same
  // and the engine's tie-break is alphabetical ("Leg Day" first) — so that
  // path pins the coach's day one (`day`). The intake's days carry their
  // weekday ("Monday · Push") and the engine's weekday rule already puts
  // today's first, so `day: null` leaves the choice to the engine — and the
  // "Your week" Start pill follows the same pick either way (planStartId).
  // Resets on remount, when the engine takes over as usual.
  const [firstPlan, setFirstPlan] = useState<{ day: string | null } | null>(null);
  const firstPlanPick = useMemo<Suggestion | null>(() => {
    if (!firstPlan) return null;
    if (firstPlan.day === null) return suggestion.kind === "template" ? suggestion : null;
    const template = templates.find((t) => t.name === firstPlan.day);
    if (!template) return null;
    return {
      kind: "template",
      id: template.id,
      title: template.name,
      ctaLabel: "Start",
      reason: "",
      muscles: [],
    };
  }, [firstPlan, templates, suggestion]);
  const showFirstWorkout = firstPlanPick !== null && logs.length === 0;
  const pick: Suggestion = showFirstWorkout && firstPlanPick ? firstPlanPick : suggestion;

  // Split-position framing. Saved templates carry no split metadata (the
  // builder is name + exercises only), so the split day usually IS the title
  // ("Legs"); starters carry a program-level split worth naming when short
  // and not already in the title.
  const splitLabel = useMemo(() => {
    if (pick.kind !== "starter") return null;
    const split = starterPrograms.find((p) => p.id === pick.id)?.split?.trim();
    if (!split || split.length > 14) return null;
    return pick.title.toLowerCase().includes(split.toLowerCase()) ? null : split;
  }, [pick]);

  // The pick's shape — what you're walking into: how many lifts and sets,
  // roughly how long, when you last ran this exact session and how it went.
  const sessionShape = useMemo(() => {
    const picked =
      pick.kind === "template"
        ? templates.find((t) => t.id === pick.id)?.exercises
        : pick.kind === "starter"
          ? starterPrograms.find((p) => p.id === pick.id)?.exercises
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
    const key = pick.title.trim().toLowerCase();
    const last = logs.find(
      (l) =>
        (pick.kind === "template" && l.template_id === pick.id) ||
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
  }, [pick, templates, logs]);

  // ── First run: zero logs, zero templates — and both queries genuinely
  // SUCCEEDED (a failed cold-start load returns the same empty arrays, and a
  // veteran must never see the welcome hero). buildingWeek pins the branch
  // open while templates stream in mid-build, so the panel doesn't flip to
  // a pick after the first save. It starts true when the session marker
  // says a build from an EARLIER mount is still running (the user left Home
  // mid-build and came back): the hero keeps saying "Building…" with no
  // buttons, so a second build can't be started on top of the first.
  const [buildingWeek, setBuildingWeek] = useState(() => weekBuildInProgress());
  // Whether this mount's own runWeekBuild holds the marker (it clears it in
  // finally). When another mount's run holds it, watch until that run
  // clears it — or it goes stale — and the engine takes over: the saves
  // landed in the shared templates context, so nothing needs refetching.
  const ownsBuild = useRef(false);
  useEffect(() => {
    if (!buildingWeek || ownsBuild.current) return;
    const id = window.setInterval(() => {
      if (!weekBuildInProgress()) setBuildingWeek(false);
    }, 1000);
    return () => window.clearInterval(id);
  }, [buildingWeek]);
  // profile !== null = the profile fetch completed (fetchProfile always sets
  // an object, even for an empty row) — without it the beginner variant
  // flashes, and its one-tap build can fire, on a null in-flight profile.
  const firstRun =
    buildingWeek ||
    (dataReady &&
      profile !== null &&
      !logsLoadFailed &&
      !templatesLoadFailed &&
      logs.length === 0 &&
      templates.length === 0);

  // No completed workouts yet, and we KNOW it (the logs query succeeded).
  // Drives the stat block: a plan preview once templates exist, one benefit
  // line before that — never a row of zeros.
  const noHistory = dataReady && !logsLoadFailed && logs.length === 0;

  // Beginners never see the intake — the coach decides everything from
  // onboarding. Experienced lifters route through the intake sheet, which
  // hands us their actual schedule.
  const [intakeOpen, setIntakeOpen] = useState(false);
  const isBeginner =
    !profile?.experience || profile.experience.toLowerCase().includes("beginner");

  const runWeekBuild = async (prompt: string, source: WeekBuildSource): Promise<void> => {
    // Two guards: this mount's run (state), and any run holding the session
    // marker — an earlier mount's, or this one's before the state flushed
    // between two taps.
    if (buildingWeek || weekBuildInProgress()) return;
    ownsBuild.current = true;
    markWeekBuildStarted();
    setBuildingWeek(true);
    let saved = 0;
    let firstSaved: string | null = null;
    const newAccount = logs.length === 0;
    try {
      const reply = await streamCoach(
        [{ role: "user", content: prompt }],
        buildCoachContext(logs, profile),
        () => {},
      );
      const days = parseWeekPlan(reply, MAX_TEMPLATES);
      if (days.length === 0) throw new Error("no_plan");
      for (const day of days) {
        await saveTemplate({ id: null, name: day.name, exercises: day.exercises });
        saved += 1;
        if (firstSaved === null) firstSaved = day.name;
      }
      toast({
        title: `Your week is ready — ${saved} workout${saved === 1 ? "" : "s"} saved`,
      });
    } catch (err) {
      // A mid-loop failure leaves the already-saved days in the library —
      // say what landed instead of announcing total failure.
      const limitHit = err instanceof Error && err.message === TEMPLATE_LIMIT_ERROR;
      toast({
        title:
          saved > 0
            ? `Saved ${saved} workout${saved === 1 ? "" : "s"} — the rest didn't land`
            : "Couldn't build your plan right now",
        description: limitHit
          ? "Your library hit its limit of saved workouts."
          : saved > 0
            ? "They're in My Workouts; ask the coach for the missing days any time."
            : "The starter programs are ready to run today.",
        variant: saved > 0 ? "default" : "destructive",
      });
      if (saved === 0) navigate("/workouts");
    } finally {
      // Even a partial build gives a new account its first workout to start
      // — day one pinned for the split, the engine's weekday pick for the
      // schedule (see firstPlan).
      if (newAccount && firstSaved) {
        setFirstPlan({ day: source === "split" ? firstSaved : null });
      }
      clearWeekBuildMarker();
      ownsBuild.current = false;
      setBuildingWeek(false);
      setIntakeOpen(false);
    }
  };

  // ── Straight from onboarding (Onboarding navigates with
  // state.firstTime): a beginner's first week builds itself, no tap — the
  // six answers ARE the intake. Experienced lifters keep the choice. The
  // flag is dropped from history first, so a refresh or a later return to
  // Home never builds a second week; the ref guards StrictMode's
  // double-effect in dev. The flag is only consumed once BOTH cold-start
  // loads succeeded: a failed load leaves the same empty arrays a new
  // account has, and consuming it then would lose the first-run experience
  // for the session — so it stays in history, the effect re-runs when the
  // failure clears, and one quiet toast says what happened.
  const arrivedFromOnboarding =
    (location.state as { firstTime?: boolean } | null)?.firstTime === true;
  const autoBuildFired = useRef(false);
  const loadFailedToasted = useRef(false);
  useEffect(() => {
    if (!arrivedFromOnboarding || autoBuildFired.current) return;
    if (!dataReady || profile === null) return;
    if (logsLoadFailed || templatesLoadFailed) {
      if (!loadFailedToasted.current) {
        loadFailedToasted.current = true;
        toast({
          title: "Couldn't load your account yet",
          description: "Reopen the app to retry.",
        });
      }
      return;
    }
    autoBuildFired.current = true;
    navigate(location.pathname, { replace: true, state: null });
    if (firstRun && isBeginner && !buildingWeek) {
      void runWeekBuild(buildSplitPrompt(profile), "split");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    arrivedFromOnboarding,
    dataReady,
    profile,
    firstRun,
    isBeginner,
    logsLoadFailed,
    templatesLoadFailed,
  ]);

  const handleIntakeBuild = (schedule: ScheduleDay[], notes: IntakeNotes): void => {
    void runWeekBuild(buildSchedulePrompt(profile, schedule, notes), "schedule");
  };

  // One tap starts a saved workout pre-seeded. A live session outranks it —
  // never silently overwrite its seed.
  const startTemplate = (template: SupabaseTemplate): void => {
    if (activeSeed) {
      navigate("/workouts/active");
      return;
    }
    persistActiveSession(buildSessionFromTemplate(template));
    navigate("/workouts/active");
  };

  // One tap starts the named session pre-seeded; rest-day picks, still-loading
  // data, and any stale id fall back to the library, so the CTA never
  // dead-ends.
  const handleSuggestionStart = (): void => {
    if (activeSeed) {
      navigate("/workouts/active");
      return;
    }
    if (!dataReady) {
      navigate("/workouts");
      return;
    }
    if (pick.kind === "template") {
      const template = templates.find((t) => t.id === pick.id);
      if (template) {
        startTemplate(template);
        return;
      }
    } else if (pick.kind === "starter") {
      const program = starterPrograms.find((p) => p.id === pick.id);
      if (program) {
        persistActiveSession(buildSessionFromStarter(program));
        navigate("/workouts/active");
        return;
      }
    }
    navigate("/workouts");
  };

  const { refresh: refreshCapturedSessions } = useCapturedSessions();

  // The banner owns "Resume"; the hero CTA always reads as the pick. (It
  // still routes into the live session when one exists — see
  // handleSuggestionStart — so a seed is never silently overwritten.)
  const ctaLabel = dataReady ? pick.ctaLabel : "Start a workout";

  // The week's plan, in the order the coach wrote it (oldest save first),
  // for the no-history preview. "Start" sits on the hero's pick so the two
  // never disagree; the first row when the pick isn't in the list.
  const planRows = useMemo(
    () =>
      noHistory && templates.length > 0
        ? [...templates].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
        : [],
    [noHistory, templates],
  );
  const planStartId =
    pick.kind === "template" && planRows.some((t) => t.id === pick.id)
      ? pick.id
      : (planRows[0]?.id ?? null);

  const [connectionsOpen, setConnectionsOpen] = useState(false);
  // Training reminders — prefs persist locally; every change reschedules.
  const [reminders, setReminders] = useState<ReminderPrefs>(() => loadReminderPrefs());
  const updateReminders = async (next: ReminderPrefs) => {
    setReminders(next);
    const ok = await applyReminderPrefs(next);
    if (!ok && next.enabled) {
      toast({
        title: "Notifications are off",
        description: "Allow notifications for LiftOS in iOS Settings to get reminders.",
        variant: "destructive",
      });
      setReminders({ ...next, enabled: false });
      void applyReminderPrefs({ ...next, enabled: false });
    }
  };

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

  const welcomeEyebrow = `Welcome${firstName ? ` · ${firstName}` : ""}`;

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
          its shape, one CTA. Four states: building the first week, the
          welcome (beginner / experienced), the first workout just landed,
          and the everyday pick. ── */}
      <section className="mt-6 md:mt-8 animate-reveal-up">
        <div className="relative overflow-hidden rounded-[18px] bg-foreground p-5 text-background shadow-[0_8px_24px_rgba(16,22,35,0.16)] dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
          <div className="relative z-10" aria-busy={!dataReady || buildingWeek}>
            {firstRun && buildingWeek ? (
              <>
                <p className={HERO_EYEBROW}>{welcomeEyebrow}</p>
                <h2 className={HERO_TITLE} aria-live="polite">
                  {isBeginner ? "Building your first week…" : "Building your week…"}
                </h2>
                <p className={HERO_BODY}>
                  The coach is writing your workouts around your goal — about 15 seconds.
                </p>
                <ShapeSkeleton />
              </>
            ) : firstRun && isBeginner ? (
              <>
                <p className={HERO_EYEBROW}>{welcomeEyebrow}</p>
                <h2 className={HERO_TITLE}>New to the gym? Start here.</h2>
                <p className={HERO_BODY}>
                  One tap and the coach builds your first week around your goal — then walks
                  you through every session.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runWeekBuild(buildSplitPrompt(profile), "split")}
                    className={HERO_PRIMARY}
                  >
                    <Sparkles size={15} />
                    Build my first week
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      navigate("/coach", {
                        state: {
                          draft:
                            "I'm brand new to the gym. Build me a simple first week and tell me exactly how to start.",
                        },
                      })
                    }
                    className={HERO_SECONDARY}
                  >
                    Talk to the coach
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => navigate("/workouts")}
                  className="mt-3 min-h-[44px] text-left text-[12.5px] font-semibold text-background/55 transition hover:text-background/80"
                >
                  I’ll start on my own →
                </button>
              </>
            ) : firstRun ? (
              <>
                <p className={HERO_EYEBROW}>{welcomeEyebrow}</p>
                <h2 className={HERO_TITLE}>Bring your routine, or just start.</h2>
                <p className={HERO_BODY}>
                  Tell the coach your days and what each one hits — it writes the week. Or
                  start a workout right now.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIntakeOpen(true)}
                    className={HERO_PRIMARY}
                  >
                    <Sparkles size={15} />
                    Use my existing routine
                  </button>
                  <button
                    type="button"
                    onClick={handleSuggestionStart}
                    className={HERO_SECONDARY}
                  >
                    Start a workout
                    <ChevronsRight size={16} />
                  </button>
                </div>
              </>
            ) : showFirstWorkout ? (
              <>
                <p className={HERO_EYEBROW}>Here’s your first workout</p>
                <h2 className={HERO_TITLE}>{pick.title}</h2>
                {sessionShape && <ShapeTiles shape={sessionShape} />}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={handleSuggestionStart} className={HERO_PRIMARY}>
                    Start
                    <ChevronsRight size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate("/workouts")}
                    className={HERO_SECONDARY}
                  >
                    Adjust
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Split-position line — "what day of my split is it" as a
                    label, never a calendar to interpret. */}
                <p className={HERO_EYEBROW}>
                  {!dataReady
                    ? "Next up"
                    : pick.kind === "rest"
                      ? "Rest day"
                      : splitLabel
                        ? `Next up · ${splitLabel}`
                        : "Next up"}
                </p>

                {/* The pick itself — the reason this screen exists. */}
                <h2 className={HERO_TITLE}>
                  {dataReady ? (
                    pick.title
                  ) : (
                    <>
                      <span className="sr-only">Loading your next workout</span>
                      <span aria-hidden className="skeleton skeleton-inverse my-1 block h-6 w-[62%]" />
                    </>
                  )}
                </h2>

                {!dataReady && <ShapeSkeleton />}
                {dataReady && sessionShape && <ShapeTiles shape={sessionShape} />}

                {/* The one CTA on this screen — starts the exact pick
                    pre-seeded. */}
                <div className="mt-4 flex items-center gap-2">
                  <button type="button" onClick={handleSuggestionStart} className={HERO_PRIMARY}>
                    {ctaLabel}
                    <ChevronsRight size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Card index ── */}
      <nav aria-label="Dashboard index" className="mt-4 space-y-2.5 animate-reveal-up">
        {/* Personal records — the three numbers a lifter recites. Raw best
            weights; a record broken in the last 72h lights up. */}
        {records.length > 0 && (
          <Link
            to="/progress"
            className={`${CARD_CLASS} group block px-4 pb-4 pt-3.5 transition-[transform,box-shadow] duration-150 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className={CARD_LABEL}>Personal records</p>
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

        {/* No history yet: the week's plan once it exists (names in the
            coach's order, Start on the pick), one line before that. Zeros
            tell a new user nothing. */}
        {planRows.length > 0 ? (
          <div className={`${CARD_CLASS} px-4 pb-2 pt-3.5`}>
            <div className="flex items-center justify-between gap-3">
              <p className={CARD_LABEL}>Your week</p>
              <span className="caption whitespace-nowrap">
                {planRows.length} workout{planRows.length === 1 ? "" : "s"}
              </span>
            </div>
            <ol className="mt-1.5 divide-y divide-border">
              {planRows.map((template, i) => {
                const exerciseCount = template.exercises.filter(
                  (e) => !isPlaceholderName(e.name),
                ).length;
                return (
                  <li
                    key={template.id}
                    className="flex min-h-[46px] items-center justify-between gap-3 py-1.5"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="mono w-4 shrink-0 text-[11px] text-fg-muted">{i + 1}</span>
                      <span className="truncate text-sm font-semibold text-fg">{template.name}</span>
                      {exerciseCount > 0 && (
                        <span className="caption shrink-0 whitespace-nowrap">
                          {exerciseCount} exercise{exerciseCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                    {template.id === planStartId && !buildingWeek && (
                      <button
                        type="button"
                        onClick={() => startTemplate(template)}
                        aria-label={`Start ${template.name}`}
                        className="relative inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-transform duration-150 after:absolute after:-inset-1.5 after:content-[''] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                      >
                        Start
                        <ChevronsRight size={13} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
            <Link
              to="/workouts"
              className="mt-1 flex min-h-11 items-center justify-between rounded-md text-sm font-semibold text-fg transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span>All workouts</span>
              <OpenPill />
            </Link>
          </div>
        ) : noHistory && !templatesLoadFailed ? (
          <div className={`${CARD_CLASS} px-4 py-3.5`}>
            <p className="text-sm font-semibold text-fg">
              Finish one workout and your numbers start here.
            </p>
          </div>
        ) : (
          <>
            {/* This week — sessions against the plan you set in onboarding,
                the days you trained, and one line history can back up. */}
            <div className={`${CARD_CLASS} px-4 pb-3.5 pt-3.5`}>
              <div className="flex items-center justify-between gap-3">
                <p className={CARD_LABEL}>This week</p>
                {dataReady && (
                  <div
                    role="img"
                    aria-label={`Trained ${weekStats.workedDayIndices.length} of 7 days this week, Monday first`}
                    className="flex items-center gap-1"
                  >
                    {Array.from({ length: 7 }, (_, i) => {
                      const worked = weekStats.workedDayIndices.includes(i);
                      const isToday = i === todayIdx;
                      return (
                        <span
                          key={i}
                          aria-hidden
                          className={`h-2 w-2 rounded-full ${
                            worked
                              ? "bg-primary"
                              : isToday
                                ? "border border-primary/70"
                                : "bg-foreground/[0.14]"
                          }`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
              {!dataReady ? (
                <div aria-hidden className="mt-2">
                  <span className="skeleton block h-7 w-24" />
                  <span className="skeleton mt-2 block h-3 w-32" />
                </div>
              ) : (
                <>
                  <p className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="stat-scoreboard text-[28px] leading-8 tabular-nums text-fg">
                      {weekStats.sessions}
                    </span>
                    {plannedPerWeek !== null && (
                      <span className="text-[15px] font-medium tabular-nums text-fg-muted">
                        of {plannedPerWeek}
                      </span>
                    )}
                    <span className="text-[12px] font-medium text-fg-soft">
                      {plannedPerWeek !== null
                        ? "planned workouts"
                        : weekStats.sessions === 1
                          ? "workout"
                          : "workouts"}
                    </span>
                  </p>
                  {weekObservation && (
                    <p className="mt-1 text-[12px] leading-4 text-fg-muted">{weekObservation}</p>
                  )}
                </>
              )}
            </div>

            {/* This month — sessions, weight moved — plus the one obvious
                way into the calendar. */}
            <div className={`${CARD_CLASS} px-4 pb-3 pt-3.5`}>
              <p className={CARD_LABEL}>This month</p>
              <div className="mt-3 grid grid-cols-2 gap-2" aria-busy={!dataReady}>
                {!dataReady ? (
                  <>
                    <StatTileSkeleton />
                    <StatTileSkeleton />
                  </>
                ) : (
                  <>
                    <div className="rounded-[10px] bg-foreground/[0.04] px-3 py-2.5">
                      <p className="stat-scoreboard text-[26px] leading-8 tabular-nums text-fg">
                        {monthStats.count}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium leading-4 text-fg-soft">
                        {monthStats.count === 1 ? "session" : "sessions"}
                      </p>
                    </div>
                    <div className="rounded-[10px] bg-foreground/[0.04] px-3 py-2.5">
                      <p className="stat-scoreboard whitespace-nowrap text-[26px] leading-8 tabular-nums text-fg">
                        {monthStats.volume >= 1000
                          ? `${(monthStats.volume / 1000).toFixed(monthStats.volume >= 10_000 ? 0 : 1)}k`
                          : monthStats.volume}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium leading-4 text-fg-soft">
                        {units} lifted
                      </p>
                    </div>
                  </>
                )}
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
          </>
        )}

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

        {/* Last workout — one tap straight to that workout's full summary
            (exercises, top sets, PRs, share, delete). Hidden until the
            first completed workout exists. */}
        {logs[0] && (
          <Link to={`/workouts/review/${logs[0].id}`} className={ROW_CLASS}>
            <span className="min-w-0">
              <RowLabel>Last workout</RowLabel>
              <span className="mt-0.5 block truncate text-[12px] leading-4 text-fg-muted">
                {logs[0].name} · {fmtAgo(logs[0].finished_at).toLowerCase() === "today" ? "today" : `${fmtAgo(logs[0].finished_at)} ago`}
                {logs[0].completed_sets > 0 ? ` · ${logs[0].completed_sets} sets` : ""}
                {logs[0].total_volume > 0
                  ? ` · ${Math.round(logs[0].total_volume).toLocaleString()} ${units}`
                  : ""}
              </span>
            </span>
            <RowEnd label="View" />
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
            <RowEnd label="Manage" />
          </button>
        )}
      </nav>

      <SplitIntakeSheet
        open={intakeOpen}
        onOpenChange={setIntakeOpen}
        building={buildingWeek}
        onBuild={handleIntakeBuild}
      />

      <Drawer open={connectionsOpen} onOpenChange={setConnectionsOpen}>
        <DrawerContent className="px-6 pb-[calc(2rem+var(--safe-bottom))]">
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

          {/* ── Training reminders — a local nudge on chosen days. ── */}
          {remindersSupported() && (
            <div className="mt-5 border-t border-border pt-4">
              <label className={`${ROW_CLASS} cursor-pointer`}>
                <span className="min-w-0">
                  <RowLabel>Training reminders</RowLabel>
                  <span className="mt-0.5 block text-[12px] leading-4 text-fg-muted">
                    A nudge on your training days
                  </span>
                </span>
                <Switch
                  checked={reminders.enabled}
                  onCheckedChange={(on) =>
                    void updateReminders({
                      ...reminders,
                      enabled: on,
                      // Simple daily nudge — no weekday picker to babysit.
                      days: [1, 2, 3, 4, 5, 6, 7],
                    })
                  }
                  aria-label="Training reminders"
                />
              </label>
              {reminders.enabled && (
                <div className="mt-3 flex items-center justify-between gap-3 px-1">
                  <span className="text-[12px] text-fg-muted">Every day at</span>
                  <input
                    type="time"
                    value={`${String(reminders.hour).padStart(2, "0")}:${String(reminders.minute).padStart(2, "0")}`}
                    onChange={(event) => {
                      const [h, m] = event.target.value.split(":").map(Number);
                      if (Number.isFinite(h) && Number.isFinite(m)) {
                        void updateReminders({ ...reminders, hour: h, minute: m });
                      }
                    }}
                    aria-label="Reminder time"
                    className="h-9 rounded-lg border border-border bg-card px-2 text-sm text-fg outline-none focus:border-primary/60"
                  />
                </div>
              )}
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </div>
  );
};

export default Dashboard;
