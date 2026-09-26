import { CTAButton } from "@/components/GoldButton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUser } from "@/context/UserContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkoutLogs, type WorkoutLog } from "@/hooks/useWorkoutLogs";
import { formatHold } from "@/lib/exerciseTracking";
import { getLogsByDay, getStreak } from "@/lib/workoutStats";
import { sessionToTemplateExercises } from "@/lib/sessionToTemplate";
import { TEMPLATE_LIMIT_ERROR, useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import { toast } from "@/components/ui/use-toast";
import { ChevronLeft, ChevronRight, Dumbbell } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

/* Sunday-start weeks (US convention). */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* Ceiling for the planned-workouts %, so a month far over plan stays a
   readable three digits instead of a five-digit number. */
const HIT_RATE_CAP = 999;

const localMidnight = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

type DayCell = { date: Date; inMonth: boolean };

/* Stable 6-row grid: 42 cells, leading/trailing days from adjacent months. */
const buildCalendarCells = (year: number, month: number): DayCell[] => {
  const startOffset = new Date(year, month, 1).getDay(); // Sun = 0
  const cells: DayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(year, month, 1 - startOffset + i);
    cells.push({ date, inMonth: date.getMonth() === month });
  }
  return cells;
};

const fmtVol = (v: number, units: string) =>
  v >= 1000 ? `${(v / 1000).toFixed(1)}k ${units}` : `${Math.round(v).toLocaleString()} ${units}`;

type PrLift = { name: string; weight: number };

/* A PR day is one where an exercise's top completed weight beats every prior
   workout's best for that exercise. First-ever exposure to a lift sets the
   baseline — it is not counted as a PR. */
const computePrs = (logs: WorkoutLog[]) => {
  const sorted = [...logs].sort(
    (a, b) => new Date(a.finished_at).getTime() - new Date(b.finished_at).getTime(),
  );
  const best: Record<string, number> = {};
  const prDays = new Set<number>();
  const prsByLog: Record<string, PrLift[]> = {};

  for (const log of sorted) {
    const dayKey = localMidnight(new Date(log.finished_at)).getTime();
    for (const exercise of log.exercises ?? []) {
      let top = 0;
      for (const set of exercise.sets ?? []) {
        if (!set.completed || !set.weight || set.weight <= 0) continue;
        if (set.weight > top) top = set.weight;
      }
      if (top <= 0) continue;
      const prev = best[exercise.name];
      if (prev !== undefined && top > prev) {
        prDays.add(dayKey);
        if (!prsByLog[log.id]) prsByLog[log.id] = [];
        prsByLog[log.id].push({ name: exercise.name, weight: top });
      }
      if (prev === undefined || top > prev) best[exercise.name] = top;
    }
  }
  return { prDays, prsByLog };
};

/* Tiny four-point star used for PR accents. */
const Spark = ({ className = "" }: { className?: string }) => (
  <svg viewBox="0 0 10 10" className={className} aria-hidden="true">
    <path d="M5 0L6.15 3.85L10 5L6.15 6.15L5 10L3.85 6.15L0 5L3.85 3.85Z" fill="hsl(var(--primary))" />
  </svg>
);

/* Slim radial donut beside the planned-workouts stat — md+ only, mobile stays clean. */
const HitRateDonut = ({ pct, muted }: { pct: number; muted: boolean }) => {
  const r = 20;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(pct, 100)) / 100;
  return (
    <svg viewBox="0 0 48 48" className="hidden h-9 w-9 shrink-0 -rotate-90 md:block">
      <circle cx="24" cy="24" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="3" />
      {!muted && filled > 0 && (
        <circle
          cx="24"
          cy="24"
          r={r}
          fill="none"
          stroke="hsl(var(--chart-line))"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - filled * c}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      )}
    </svg>
  );
};

const Calendar = () => {
  const { profile } = useUser();
  const { logs } = useWorkoutLogs();
  const { save: saveTemplate } = useWorkoutTemplates();
  const [savedLogIds, setSavedLogIds] = useState<Set<string>>(new Set());

  // "Save it later, into workouts" — any logged workout can become a
  // saved workout with its achieved numbers as the targets.
  const saveLogAsTemplate = async (log: WorkoutLog): Promise<void> => {
    if (savedLogIds.has(log.id)) return;
    const exercises = sessionToTemplateExercises(log.exercises ?? []);
    if (exercises.length === 0) {
      toast({ title: "Nothing completed in this workout to save" });
      return;
    }
    try {
      await saveTemplate({ id: null, name: log.name, exercises });
      setSavedLogIds((current) => new Set(current).add(log.id));
      toast({ title: `Saved "${log.name}" to your workouts` });
    } catch (err) {
      toast(
        err instanceof Error && err.message === TEMPLATE_LIMIT_ERROR
          ? { title: "Workout limit reached", description: "You have 7 saved workouts — the max. Delete one in Workouts to make room." }
          : { title: "Could not save workout", variant: "destructive" },
      );
    }
  };
  const isMobile = useIsMobile();
  const units = profile?.units ?? "lb";

  const now = new Date();
  const todayKey = localMidnight(now).getTime();

  // Deep link: /calendar?day=YYYY-MM-DD opens straight onto that day's
  // workouts — the recap and the home "Last workout" card land here.
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const linkedDay = useMemo(() => {
    const raw = searchParams.get("day");
    if (!raw) return null;
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }, [searchParams]);

  const [view, setView] = useState(() =>
    linkedDay
      ? { year: linkedDay.getFullYear(), month: linkedDay.getMonth() }
      : { year: now.getFullYear(), month: now.getMonth() },
  );
  const [selected, setSelected] = useState<Date | null>(linkedDay);

  const isCurrentMonth = view.year === now.getFullYear() && view.month === now.getMonth();
  const monthKey = `${view.year}-${view.month}`;
  const viewDate = new Date(view.year, view.month, 1);
  const monthLabel = `${viewDate.toLocaleDateString("en-US", { month: "long" }).toUpperCase()} ${view.year}`;
  const monthNameLong = viewDate.toLocaleDateString("en-US", { month: "long" });

  const shiftMonth = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const cells = useMemo(() => buildCalendarCells(view.year, view.month), [view.year, view.month]);
  const logsByDay = useMemo(() => getLogsByDay(logs), [logs]);
  const streak = useMemo(() => getStreak(logs), [logs]);
  const { prDays, prsByLog } = useMemo(() => computePrs(logs), [logs]);

  const monthLogs = useMemo(
    () =>
      logs.filter((l) => {
        const d = new Date(l.finished_at);
        return d.getFullYear() === view.year && d.getMonth() === view.month;
      }),
    [logs, view.year, view.month],
  );

  const prevMonthLogs = useMemo(() => {
    const prev = new Date(view.year, view.month - 1, 1);
    return logs.filter((l) => {
      const d = new Date(l.finished_at);
      return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
    });
  }, [logs, view.year, view.month]);

  /* Per-day volume within the displayed month, for subtle indicator scaling. */
  const dayVolumes = useMemo(() => {
    const map: Record<number, number> = {};
    for (const log of monthLogs) {
      const key = localMidnight(new Date(log.finished_at)).getTime();
      map[key] = (map[key] ?? 0) + log.total_volume;
    }
    return map;
  }, [monthLogs]);
  const maxDayVol = Math.max(0, ...Object.values(dayVolumes));

  /* ── Real hit rate: workouts logged vs frequency target × weeks elapsed.
     One denominator feeds both the % and its "N of about M" caption — the
     caption shows a whole number of planned workouts, so the % divides by
     that same whole number or the two contradict each other ("3 of about
     3" reading 86%). Capped so a wildly-over-plan month can't print a
     five-digit percentage. ── */
  const weeklyTarget = parseInt(profile?.frequency?.match(/\d+/)?.[0] ?? "") || 3;
  const daysInViewMonth = new Date(view.year, view.month + 1, 0).getDate();
  const daysConsidered = isCurrentMonth ? now.getDate() : daysInViewMonth;
  const expectedWorkouts = (weeklyTarget * daysConsidered) / 7;
  const plannedSoFar = Math.max(1, Math.round(expectedWorkouts));
  const hasAnyData = logs.length > 0;
  const hitRate = hasAnyData
    ? Math.min(HIT_RATE_CAP, Math.round((monthLogs.length / plannedSoFar) * 100))
    : null;

  const monthVolume = monthLogs.reduce((s, l) => s + l.total_volume, 0);

  /* ── Month insight — computed, never fake ── */
  const insight = useMemo(() => {
    if (monthLogs.length === 0) return null;
    const weekCounts: Record<number, number> = {};
    for (const log of monthLogs) {
      const d = new Date(log.finished_at);
      const ws = new Date(d);
      ws.setDate(d.getDate() - d.getDay()); // Sunday-start week
      ws.setHours(0, 0, 0, 0);
      weekCounts[ws.getTime()] = (weekCounts[ws.getTime()] ?? 0) + 1;
    }
    const bestWeek = Object.values(weekCounts).reduce((m, n) => Math.max(m, n), 0);
    const prevVol = prevMonthLogs.reduce((s, l) => s + l.total_volume, 0);
    const deltaPct = prevVol > 0 ? Math.round(((monthVolume - prevVol) / prevVol) * 100) : null;
    const prevMonthName = new Date(view.year, view.month - 1, 1).toLocaleDateString("en-US", {
      month: "long",
    });
    return { bestWeek, deltaPct, prevMonthName };
  }, [monthLogs, prevMonthLogs, monthVolume, view.year, view.month]);

  /* ── Selected-day detail ── */
  const selectedKey = selected ? localMidnight(selected).getTime() : null;
  const selectedLogs = selectedKey !== null ? (logsByDay[selectedKey] ?? []) : [];
  const dayVol = selectedLogs.reduce((s, l) => s + l.total_volume, 0);
  const daySets = selectedLogs.reduce((s, l) => s + l.completed_sets, 0);
  const dayMin = selectedLogs.reduce((s, l) => s + (l.duration_minutes ?? 0), 0);

  /* Stat rows under the grid. Each label says what its number counts in
     plain words — the "x of about y planned" context is visible, not hidden
     in a title attribute iOS never shows. ("Green days" — distinct days
     with a workout — duplicated the workout count above and is gone.) */
  const stripStats = [
    {
      label: "Planned workouts completed",
      value: hitRate !== null ? `${hitRate}%` : "–",
      detail:
        hitRate !== null
          ? `${monthLogs.length} of about ${plannedSoFar} planned${isCurrentMonth ? " so far" : ""}`
          : `Based on ${weeklyTarget} a week`,
      donut: true,
    },
    {
      label: "Streak",
      value: hasAnyData ? String(streak) : "–",
      detail: streak === 1 ? "day in a row" : "days in a row",
      donut: false,
    },
  ];

  return (
    <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
      {/* ── Eyebrow header — context left, quiet volume right ── */}
      <header className="mb-6 flex items-baseline justify-between gap-4 animate-reveal-up">
        <h1 className="eyebrow">Workout history</h1>
        {monthVolume > 0 && (
          <p key={`vol-${monthKey}`} className="mono text-xs tabular-nums text-fg-muted animate-fade-in">
            {fmtVol(monthVolume, units)} logged
          </p>
        )}
      </header>

      {/* ── Month grid — first on the page, opened by a heavy rule. The
          numbers it summarizes sit below it. ── */}
      <section
        className="relative mb-8 rule-heavy pt-4 animate-reveal-up"
        style={{ animationDelay: "60ms" }}
      >
        {/* Month navigation */}
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border after:absolute after:-inset-1 after:content-[''] text-fg-muted transition-all duration-200 hover:bg-secondary hover:text-fg active:scale-95"
          >
            <ChevronLeft size={16} />
          </button>
          <p
            key={`label-${monthKey}`}
            className="mono min-w-[10rem] text-center text-xs font-medium uppercase tracking-[0.3em] text-fg-soft animate-fade-in"
          >
            {monthLabel}
          </p>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border after:absolute after:-inset-1 after:content-[''] text-fg-muted transition-all duration-200 hover:bg-secondary hover:text-fg active:scale-95 disabled:pointer-events-none disabled:opacity-25"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Weekday header */}
        <div className="mb-2 grid grid-cols-7 gap-1.5 md:gap-2">
          {WEEKDAYS.map((d) => (
            <span
              key={d}
              className="text-center text-[10px] font-medium uppercase tracking-[0.2em] text-fg-muted"
            >
              {d}
            </span>
          ))}
        </div>

        {/* Day cells — 6 stable rows, flat: dot marks a workout, ink ring marks today */}
        <div key={`grid-${monthKey}`} className="grid grid-cols-7 gap-1.5 md:gap-2 animate-fade-in">
          {cells.map((cell) => {
            const key = cell.date.getTime();
            const dayLogs = cell.inMonth ? (logsByDay[key] ?? []) : [];
            const hasWorkouts = dayLogs.length > 0;
            const isToday = cell.inMonth && key === todayKey;
            const isFuture = key > todayKey;
            const isPrDay = hasWorkouts && prDays.has(key);
            const vol = dayVolumes[key] ?? 0;
            const ratio = maxDayVol > 0 ? vol / maxDayVol : 0;
            const dotSize = 7 + Math.round(ratio * 5); // 7–12px, subtle

            const stateCls = !cell.inMonth
              ? "border-transparent"
              : hasWorkouts
                ? "cursor-pointer border-transparent hover:bg-secondary active:scale-[0.96]"
                : "border-transparent";

            const numCls = !cell.inMonth
              ? "text-fg-disabled"
              : hasWorkouts
                ? "font-semibold text-fg"
                : isFuture
                  ? "text-fg-faint"
                  : "text-fg-muted";

            return (
              <button
                key={key}
                type="button"
                disabled={!hasWorkouts}
                onClick={() => setSelected(cell.date)}
                aria-label={
                  hasWorkouts
                    ? `${cell.date.toLocaleDateString("en-US", { month: "long", day: "numeric" })} — ${dayLogs.length} workout${dayLogs.length === 1 ? "" : "s"}, ${fmtVol(vol, units)}`
                    : undefined
                }
                className={`relative flex h-12 flex-col items-center justify-center gap-1 rounded-[0.75rem] border transition-all duration-200 sm:h-16 md:h-20 md:rounded-[0.875rem] ${stateCls} ${
                  isToday ? "ring-1 ring-foreground" : ""
                }`}
              >
                <span className={`mono text-[11px] leading-none md:text-xs ${numCls}`}>
                  {cell.date.getDate()}
                </span>
                <span className="flex h-3.5 items-center justify-center">
                  {hasWorkouts ? (
                    <span
                      className="rounded-full bg-primary"
                      style={{ width: dotSize, height: dotSize }}
                    />
                  ) : cell.inMonth && !isFuture ? (
                    <span className="h-1 w-1 rounded-full bg-border" />
                  ) : null}
                </span>
                {isPrDay && <Spark className="absolute right-1.5 top-1.5 h-2 w-2 md:h-2.5 md:w-2.5" />}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
          <span className="caption inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Workout · sized by volume
          </span>
          <span className="caption inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-border" />
            Rest
          </span>
          <span className="caption inline-flex items-center gap-2">
            <Spark className="h-2 w-2" />
            PR day
          </span>
          <span className="caption inline-flex items-center gap-2">
            <span className="h-2 w-2 rounded-full ring-1 ring-foreground" />
            Today
          </span>
        </div>
      </section>

      {/* ── The month in numbers — workouts logged, the read on them, then
          the two rates, then the door to the next one ── */}
      <section
        className="mb-6 rule-hairline pt-5 animate-reveal-up"
        style={{ animationDelay: "160ms" }}
      >
        <div key={`count-${monthKey}`} className="animate-fade-in">
          <p className="stat-xl">
            {monthLogs.length}
            <span className="ml-2 text-[13px] font-medium tracking-normal text-fg-muted">
              workout{monthLogs.length === 1 ? "" : "s"} in {monthNameLong}
            </span>
          </p>
          <p className="body-sm mt-2 max-w-md">
            {insight ? (
              <>
                Best week: <span className="mono font-medium text-fg">{insight.bestWeek}</span> workout
                {insight.bestWeek === 1 ? "" : "s"}
                {insight.deltaPct !== null &&
                  (insight.deltaPct === 0 ? (
                    <> · volume even with {insight.prevMonthName}</>
                  ) : (
                    <>
                      {" "}
                      · volume {insight.deltaPct > 0 ? "up" : "down"}{" "}
                      <span className="mono font-medium text-fg">{Math.abs(insight.deltaPct)}%</span> on{" "}
                      {insight.prevMonthName}
                    </>
                  ))}
              </>
            ) : (
              `Nothing logged in ${monthNameLong}${isCurrentMonth ? " yet — the grid fills in as you train" : ""}.`
            )}
          </p>
        </div>

        <div
          key={`strip-${monthKey}`}
          className="mt-5 divide-y divide-border border-y border-border animate-fade-in"
        >
          {stripStats.map((stat) => (
            <div key={stat.label} className="flex items-center justify-between gap-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {stat.donut && <HitRateDonut pct={hitRate ?? 0} muted={hitRate === null} />}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">{stat.label}</p>
                  <p className="caption">{stat.detail}</p>
                </div>
              </div>
              <p className={`stat-md shrink-0 ${stat.value !== "–" ? "" : "text-fg-disabled"}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <CTAButton to="/workouts">
            <Dumbbell size={16} />
            Log workout
          </CTAButton>
        </div>
      </section>

      {/* ── Day detail sheet — true overlay ── */}
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        {/* The bottom variant brings its own grabber, X, corners, height
            cap and safe-area padding; this only adds the scroller. */}
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={`flex flex-col border-border bg-background ${
            isMobile ? "" : "w-full p-0 sm:max-w-md"
          }`}
        >
          {/* min-h-0 + flex-1: max-h alone gives the sheet no definite
              height, so a plain h-full child never overflowed — the content
              just clipped and swipes did nothing. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 md:px-6 md:pt-6">
            <SheetHeader className="pr-10 text-left sm:text-left">
              <SheetTitle className="heading-md">
                {selectedLogs.length} workout{selectedLogs.length === 1 ? "" : "s"} logged
              </SheetTitle>
              {/* The day identity lives on each card now; kept here for
                  screen readers only. */}
              <SheetDescription className="sr-only">
                {selected?.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </SheetDescription>
            </SheetHeader>

            {/* Day totals */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { label: "Volume", value: dayVol > 0 ? fmtVol(dayVol, units) : "–" },
                { label: "Sets", value: daySets > 0 ? String(daySets) : "–" },
                { label: "Minutes", value: dayMin > 0 ? String(dayMin) : "–" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg border border-border p-3">
                  <p className="eyebrow mb-1 !text-[9px]">{s.label}</p>
                  <p className="stat-md truncate">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Workouts */}
            <div className="mt-5 space-y-3">
              {selectedLogs.map((log) => {
                const logPrs = prsByLog[log.id] ?? [];
                return (
                  <article
                    key={log.id}
                    className="rounded-[14px] border border-border bg-card p-4"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="truncate text-sm font-semibold text-fg">{log.name}</h3>
                      <span className="mono shrink-0 text-[11px] text-fg-muted">
                        {new Date(log.finished_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                        {" · "}
                        {new Date(log.finished_at).toLocaleTimeString("en-US", {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-fg-muted">
                      <span className="mono text-fg-soft">{fmtVol(log.total_volume, units)}</span>
                      {" · "}
                      <span className="mono text-fg-soft">{log.completed_sets}</span> sets
                      {log.duration_minutes ? (
                        <>
                          {" · "}
                          <span className="mono text-fg-soft">{log.duration_minutes}</span> min
                        </>
                      ) : null}
                    </p>

                    {logPrs.length > 0 && (
                      <div className="mt-3 flex items-center gap-2 rounded-[0.75rem] border border-primary/30 bg-primary/10 px-3 py-2">
                        <Spark className="h-2.5 w-2.5 shrink-0" />
                        <p className="truncate text-xs font-medium text-primary">
                          {logPrs.length === 1
                            ? `PR — ${logPrs[0].name}`
                            : `${logPrs.length} PRs this workout`}
                        </p>
                      </div>
                    )}

                    {log.notes && (
                      <p className="mt-3 rounded-[0.75rem] bg-secondary/60 px-3 py-2 text-xs leading-relaxed text-fg-soft">
                        {log.notes}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void saveLogAsTemplate(log)}
                        disabled={savedLogIds.has(log.id)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[12.5px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:bg-secondary disabled:text-fg-muted"
                      >
                        {savedLogIds.has(log.id) ? "Saved to workouts ✓" : "Save as workout"}
                      </button>
                      {/* Every historical log opens its full review — share
                          and delete live there, not just for the newest. */}
                      <button
                        type="button"
                        onClick={() => navigate(`/workouts/review/${log.id}`)}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border px-3.5 text-[12.5px] font-semibold text-fg-soft transition hover:border-fg-soft hover:text-fg"
                      >
                        View details
                      </button>
                    </div>

                    <div className="mt-3 divide-y divide-border border-t border-border">
                      {(log.exercises ?? []).map((exercise) => {
                        const done = (exercise.sets ?? []).filter((s) => s.completed);
                        const topW = done.reduce((m, s) => Math.max(m, s.weight ?? 0), 0);
                        const topHold =
                          exercise.kind === "cardio"
                            ? 0
                            : done.reduce((m, s) => Math.max(m, s.duration_seconds ?? 0), 0);
                        const topSet = done
                          .filter((s) => (s.weight ?? 0) === topW)
                          .sort((a, b) => (b.reps ?? 0) - (a.reps ?? 0))[0];
                        const pr = logPrs.find((p) => p.name === exercise.name);
                        return (
                          <div
                            key={exercise.id}
                            className="flex items-center justify-between gap-3 py-2.5"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <p
                                className={`truncate text-sm ${
                                  pr ? "font-medium text-primary" : "text-fg-soft"
                                }`}
                              >
                                {exercise.name}
                              </p>
                              {pr && (
                                <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-1.5 py-px text-[9px] font-medium uppercase tracking-[0.15em] text-primary">
                                  PR
                                </span>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className={`mono text-sm ${pr ? "text-primary" : "text-fg"}`}>
                                {topHold > 0
                                  ? topW > 0
                                    ? `${formatHold(topHold)} @ ${topW} ${units}`
                                    : `${formatHold(topHold)} hold`
                                  : topW > 0
                                    ? `${topW} ${units} × ${topSet?.reps ?? "–"}`
                                    : `${done.length} set${done.length === 1 ? "" : "s"}`}
                              </p>
                              <p className="mono text-[10px] text-fg-faint">
                                {done.length} of {(exercise.sets ?? []).length} sets
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Calendar;
