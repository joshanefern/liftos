import { CTAButton } from "@/components/GoldButton";
import { LiftDetailSheet, type LiftRef } from "@/components/progress/LiftDetailSheet";
import { RenameExercisesSheet } from "@/components/progress/RenameExercisesSheet";
import { useUser } from "@/context/UserContext";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { isPlaceholderName, placeholderNames } from "@/lib/exerciseNames";
import { formatHold, formatHoldDelta, inferTracking } from "@/lib/exerciseTracking";
import { allTimePRs, bestWeight, type WeightRecord } from "@/lib/prs";
import {
  featuredLift,
  getLiftTrends,
  lastSessionDeltas,
} from "@/lib/strengthTrend";
import {
  getPrevWeekSessions,
  getTopLifts,
  getVolumeTrend,
  getWeeklyStreak,
  getWeekStats,
} from "@/lib/workoutStats";
import { ArrowRight, ChevronDown, Dumbbell, PenLine } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/* ── Progress — answers ONE question: "am I getting stronger?" — and reads
     top-to-bottom like a spoken summary (research round 2, Aug 2026):
     interpreted hero → Strength trends (beat-last-time + sparklines, never
     silently missing) → Your records (real names only, no invented maxes)
     → This week (neutral count, no quota grades, no gray-corpse body map)
     → total-weight chart demoted behind a tap. Every number is plain
     English with visible provenance; junk imported names surface only as
     one fix-it row. ── */

const DAY_MS = 86_400_000;
const PR_RECENT_DAYS = 7;
const RECORDS_VISIBLE = 3;
const TREND_MIN_SESSIONS = 2;

const relativeDay = (iso: string): string => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 56) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

/** Tiny sparkline points for a 100×28 viewBox. */
const sparkPoints = (values: number[], w = 100, h = 28, pad = 3): string => {
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

/** Rotating real-world scale for total weight lifted — tonnage is a
    share-toy, so give it a grin instead of more math. Input in the user's
    units; ladder is in lb. */
const tonnageEquivalence = (total: number, units: string): string | null => {
  const lb = units === "lb" ? total : total * 2.20462;
  const ladder: [number, string, string][] = [
    [970_000, "jumbo jet", "jumbo jets"],
    [25_000, "school bus", "school buses"],
    [13_000, "elephant", "elephants"],
    [750, "grand piano", "grand pianos"],
    [160, "beer keg", "beer kegs"],
  ];
  for (const [weight, one, many] of ladder) {
    const n = lb / weight;
    if (n >= 1) {
      const rounded = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
      return `that's about ${rounded} ${rounded === 1 ? one : many}`;
    }
  }
  return null;
};

const CARD_CLASS =
  "rounded-[14px] bg-card p-4 shadow-[0_4px_12px_rgba(16,22,35,0.08)] " +
  "dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)]";

const Progress = () => {
  const { profile } = useUser();
  const { logs, reload } = useWorkoutLogs();
  const units = profile?.units ?? "lb";
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [showLifted, setShowLifted] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [detailLift, setDetailLift] = useState<LiftRef | null>(null);

  // ── Data (placeholder "Exercise N" imports are excluded everywhere and
  //    surface only through the fix-it row) ──
  const junkNames = useMemo(() => placeholderNames(logs), [logs]);

  const trends = useMemo(() => getLiftTrends(logs, 84, TREND_MIN_SESSIONS), [logs]);
  const hero = useMemo(() => featuredLift(trends), [trends]);
  const keyLifts = useMemo(() => trends.slice(0, 4), [trends]);
  const deltas = useMemo(() => lastSessionDeltas(logs), [logs]);

  // Records, most recently improved first — real names only.
  const prs = useMemo(
    () =>
      allTimePRs(logs)
        .filter((pr) => !isPlaceholderName(pr.exerciseName))
        .sort((a, b) => Date.parse(b.lastImproved) - Date.parse(a.lastImproved)),
    [logs],
  );
  const bestWeightRecords = useMemo(() => {
    const map = new Map<string, WeightRecord | null>();
    for (const pr of prs) map.set(pr.exerciseName, bestWeight(logs, pr.exerciseName));
    return map;
  }, [logs, prs]);
  const visibleRecords = showAllRecords ? prs : prs.slice(0, RECORDS_VISIBLE);
  const newPrCount = useMemo(
    () =>
      prs.filter((pr) => Date.now() - Date.parse(pr.lastImproved) < PR_RECENT_DAYS * DAY_MS)
        .length,
    [prs],
  );

  const weekStats = useMemo(() => getWeekStats(logs), [logs]);
  const prevWeekSessions = useMemo(() => getPrevWeekSessions(logs), [logs]);
  const weeklyStreak = useMemo(() => getWeeklyStreak(logs), [logs]);
  const volumeTrend = useMemo(() => getVolumeTrend(logs), [logs]);
  const lastLog = logs[0] ?? null;

  // Hero fallback material: the best real (named) lift, preserved forever.
  // getTopLifts is uncapped here so a heavy junk import can't crowd out a
  // genuinely named best.
  const bestNamedLift = useMemo(
    () => getTopLifts(logs, Infinity).find((t) => !isPlaceholderName(t.name)) ?? null,
    [logs],
  );
  const bestNamedHold = useMemo(
    () => prs.find((pr) => pr.maxDuration !== null) ?? null,
    [prs],
  );
  const bestNamedReps = useMemo(
    () => prs.find((pr) => pr.maxReps !== null) ?? null,
    [prs],
  );

  // One timed-ness rule for rows AND the sheet they open: real hold data
  // wins; name inference only fills in when the data is silent (a "Glute
  // Bridge" logged with weight × reps is a weight lift, whatever the name
  // sounds like).
  const isTimedPr = (pr: { maxDuration: number | null; maxWeight: number | null }, name: string) =>
    pr.maxDuration !== null || (pr.maxWeight === null && inferTracking(name) === "time");

  const openDetail = (name: string) => {
    const pr = prs.find((p) => p.exerciseName === name);
    setDetailLift({ name, timed: pr ? isTimedPr(pr, name) : inferTracking(name) === "time" });
  };

  const weekLine =
    weekStats.sessions > 0
      ? `${weekStats.sessions} session${weekStats.sessions === 1 ? "" : "s"} this week` +
        (prevWeekSessions === weekStats.sessions
          ? " · same as last week"
          : prevWeekSessions === 0
            ? ""
            : weekStats.sessions > prevWeekSessions
              ? ` · ${weekStats.sessions - prevWeekSessions} more than last week`
              : ` · ${prevWeekSessions - weekStats.sessions} fewer than last week`)
      : lastLog
        ? Date.now() - Date.parse(lastLog.finished_at) < 2 * DAY_MS
          ? // A Monday after a Sunday session must not read "no sessions" —
            // that's a calendar technicality, not a lapse.
            `Fresh week — last workout ${relativeDay(lastLog.finished_at)}`
          : `No sessions yet this week · last workout ${relativeDay(lastLog.finished_at)}`
        : "No sessions yet this week";

  const expandedTonnage = useMemo(
    () => tonnageEquivalence(volumeTrend.reduce((s, p) => s + p.volume, 0), units),
    [volumeTrend, units],
  );

  return (
    <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
      {/* ── Header ── */}
      <header className="animate-reveal-up">
        <p className="eyebrow !text-fg">Progress</p>
      </header>

      {/* ── HERO — one interpreted headline, never an invented number ── */}
      <section className="mt-10 md:mt-14 animate-reveal-up" style={{ animationDelay: "60ms" }}>
        {hero ? (
          <>
            <p className="stat-hero !text-6xl md:!text-7xl whitespace-nowrap">
              {hero.metric === "time" ? formatHold(hero.first) : hero.first}
              <span className="mx-2 align-middle text-2xl font-extralight text-fg-muted">→</span>
              {hero.metric === "time" ? formatHold(hero.last) : hero.last}
              <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                {hero.metric === "time" ? "hold" : units}
              </span>
            </p>
            <p className="eyebrow mt-4">{hero.name}</p>
            <p className="body-sm mt-4 max-w-sm">
              {hero.delta > 0
                ? `${hero.name} is climbing — up ${hero.metric === "time" ? formatHold(hero.delta) : `${hero.delta} ${units}`} across ${hero.sessions} sessions.`
                : hero.delta === 0
                  ? `Holding steady across ${hero.sessions} sessions — your most-trained lift.`
                  : `Down ${hero.metric === "time" ? formatHold(Math.abs(hero.delta)) : `${Math.abs(hero.delta)} ${units}`} across ${hero.sessions} sessions — worth asking the coach.`}
              <span className="text-fg-faint"> Last 12 weeks.</span>
            </p>
          </>
        ) : bestNamedLift || bestNamedHold || bestNamedReps ? (
          /* History exists but nothing has 2 recent sessions — welcome back
             with a preserved best. Bests never decay or reset for absence. */
          <>
            <p className="stat-hero !text-6xl md:!text-7xl whitespace-nowrap">
              {bestNamedLift ? (
                <>
                  {bestNamedLift.weight}
                  <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                    {units}
                  </span>
                </>
              ) : bestNamedHold ? (
                <>
                  {formatHold(bestNamedHold.maxDuration!)}
                  <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                    hold
                  </span>
                </>
              ) : (
                <>
                  {bestNamedReps!.maxReps}
                  <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                    reps
                  </span>
                </>
              )}
            </p>
            <p className="eyebrow mt-4">
              Your best ·{" "}
              {bestNamedLift
                ? bestNamedLift.name
                : bestNamedHold
                  ? bestNamedHold.exerciseName
                  : bestNamedReps!.exerciseName}
            </p>
            <p className="body-sm mt-4 max-w-sm">
              {lastLog
                ? `Welcome back — last workout ${relativeDay(lastLog.finished_at)}. `
                : ""}
              Log {TREND_MIN_SESSIONS} sessions of any lift and its trend appears here.
            </p>
          </>
        ) : junkNames.length > 0 ? (
          /* Only unnamed imports exist — the fix-it row below is the way in. */
          <>
            <p className="heading-lg max-w-sm">Your imported workouts need names.</p>
            <p className="body-sm mt-4 max-w-sm">
              Name the exercises below and your records and trends start
              charting from what you've already logged.
            </p>
          </>
        ) : (
          <>
            <p className="stat-hero !text-6xl md:!text-7xl !text-fg-muted">0</p>
            <p className="eyebrow mt-4">Strength trend</p>
            <p className="body-sm mt-4 max-w-sm">
              Log your first workout — after {TREND_MIN_SESSIONS} sessions of a
              lift, its trend appears right here.
            </p>
            <CTAButton to="/workouts" className="mt-7">
              <Dumbbell size={15} />
              Log your first workout
            </CTAButton>
          </>
        )}
      </section>

      {/* ── Card 1 · STRENGTH TRENDS — never silently missing ── */}
      {(keyLifts.length > 0 || deltas.length > 0) && (
        <section className={`${CARD_CLASS} mt-10 animate-reveal-up`} style={{ animationDelay: "120ms" }}>
          <p className="eyebrow mb-1">Strength trends</p>
          <p className="caption mb-3">Best set per session · last 12 weeks. Tap a lift for detail.</p>

          {/* Beat-last-time — the readout lifters actually check */}
          {deltas.length > 0 && (
            <div className="mb-3 rounded-[0.75rem] bg-secondary/60 px-3 py-2.5">
              <p className="eyebrow mb-1.5 !text-[10px]">Last workout vs the one before</p>
              {deltas.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-3 py-1">
                  <span className="min-w-0 truncate text-sm font-medium text-fg">{d.name}</span>
                  <span className="shrink-0 text-sm tabular-nums text-fg-soft">
                    {d.metric === "time"
                      ? `${formatHold(d.prev[0])} → ${formatHold(d.last[0])}`
                      : d.prev[0] <= 0 && d.last[0] <= 0
                        ? // Bodyweight lifts — compare reps, never "0 × 22".
                          `${d.prev[1]} → ${d.last[1]} reps`
                        : `${d.prev[0]} × ${d.prev[1]} → ${d.last[0]} × ${d.last[1]}`}
                    <span
                      role="img"
                      className={`ml-1.5 ${d.direction === "up" ? "text-primary" : "text-fg-faint"}`}
                      aria-label={
                        d.direction === "up" ? "improved" : d.direction === "down" ? "lower" : "matched"
                      }
                    >
                      {d.direction === "up" ? "▲" : d.direction === "down" ? "▽" : "—"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="divide-y divide-border">
            {keyLifts.map((lift) => (
              <button
                key={lift.name}
                type="button"
                onClick={() => setDetailLift({ name: lift.name, timed: lift.metric === "time" })}
                className="flex min-h-11 w-full items-center gap-4 py-3 text-left transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{lift.name}</p>
                  <p className="caption mt-0.5">
                    {lift.metric === "time"
                      ? `${formatHold(lift.first)} → ${formatHold(lift.last)}`
                      : `${lift.first} → ${lift.last} ${units}`}
                  </p>
                </div>
                <svg viewBox="0 0 100 28" aria-hidden className="h-7 w-24 shrink-0">
                  <polyline
                    points={sparkPoints(lift.points)}
                    fill="none"
                    stroke="hsl(var(--chart-line))"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                <p
                  className={`w-16 shrink-0 text-right text-sm font-semibold tabular-nums ${
                    lift.delta > 0 ? "text-fg" : "text-fg-muted"
                  }`}
                >
                  {lift.metric === "time" ? (
                    formatHoldDelta(lift.delta)
                  ) : (
                    <>
                      {lift.delta > 0 ? `+${lift.delta}` : lift.delta}
                      <span className="ml-1 text-[11px] font-normal text-fg-muted">{units}</span>
                    </>
                  )}
                </p>
              </button>
            ))}

          </div>
        </section>
      )}

      {/* ── Card 2 · YOUR RECORDS ── */}
      {(prs.length > 0 || junkNames.length > 0) && (
        <section className={`${CARD_CLASS} mt-4 animate-reveal-up`} style={{ animationDelay: "180ms" }}>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <p className="eyebrow">Your records</p>
            {newPrCount > 0 && (
              <p className="caption !text-primary">
                {newPrCount} new in the last 7 days
              </p>
            )}
          </div>
          <div className="divide-y divide-border">
            {visibleRecords.map((pr) => {
              const best = bestWeightRecords.get(pr.exerciseName) ?? null;
              // Holds never get an estimated single — Epley over a plank's
              // "reps" invents a lift that never happened.
              const timed = isTimedPr(pr, pr.exerciseName);
              const holdNamed = inferTracking(pr.exerciseName) === "time";
              const recentlyImproved =
                Date.now() - Date.parse(pr.lastImproved) < PR_RECENT_DAYS * DAY_MS;
              return (
                <button
                  key={pr.exerciseName}
                  type="button"
                  onClick={() => openDetail(pr.exerciseName)}
                  className="flex min-h-11 w-full items-center justify-between gap-4 py-3 text-left transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                      {recentlyImproved && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      )}
                      <span className="truncate">{pr.exerciseName}</span>
                    </p>
                    <p className="caption mt-0.5">
                      {pr.maxDuration !== null
                        ? `Longest hold ${formatHold(pr.maxDuration)}`
                        : holdNamed && best !== null
                          ? // Rep-shaped legacy log of a hold exercise — state it
                            // plainly, claim no rep record.
                            `Logged ${best.weight} ${units} × ${best.reps}`
                          : best !== null
                            ? `Best ${best.weight} ${units} × ${best.reps}`
                            : pr.maxReps !== null
                              ? `Best ${pr.maxReps} reps`
                              : "Logged"}
                      <span className="text-fg-faint"> · {relativeDay(pr.lastImproved)}</span>
                    </p>
                  </div>
                  {timed || holdNamed ? (
                    pr.maxDuration !== null && (
                      <div className="shrink-0 text-right">
                        <p className="stat-lg whitespace-nowrap">
                          <b>{formatHold(pr.maxDuration)}</b>
                        </p>
                        <p className="caption !text-fg-muted">Hold</p>
                      </div>
                    )
                  ) : pr.maxE1RM !== null ? (
                    <div className="shrink-0 text-right">
                      <p className="stat-lg whitespace-nowrap">
                        <b>{Math.round(pr.maxE1RM)}</b>
                        <span className="text-fg-muted"> {units}</span>
                      </p>
                      <p className="caption !text-fg-muted">Est. best single</p>
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
          {prs.length > RECORDS_VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAllRecords((v) => !v)}
              className="caption flex min-h-11 w-full items-center !text-fg-muted transition hover:!text-fg"
            >
              {showAllRecords ? "Show fewer" : `All records (${prs.length})`}
            </button>
          )}

          {/* Fix-it row — the only acknowledgment of messy imports */}
          {junkNames.length > 0 && (
            <button
              type="button"
              onClick={() => setRenameOpen(true)}
              className="mt-1 flex min-h-11 w-full items-center gap-2 rule-hairline pt-2 text-left transition hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <PenLine size={13} className="shrink-0 text-primary" />
              <span className="caption !text-fg-soft">
                {junkNames.length} imported exercise{junkNames.length === 1 ? "" : "s"} need
                {junkNames.length === 1 ? "s" : ""} a name — tap to name{" "}
                {junkNames.length === 1 ? "it" : "them"}
              </span>
            </button>
          )}
        </section>
      )}

      {/* ── Card 3 · THIS WEEK — one line and the calendar; nothing to read,
          nothing to grade. ── */}
      {logs.length > 0 && (
        <section className={`${CARD_CLASS} mt-4 animate-reveal-up`} style={{ animationDelay: "240ms" }}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">This week</p>
            {weeklyStreak > 1 && (
              <p className="caption">{weeklyStreak} weeks in a row</p>
            )}
          </div>
          <p className="mt-2 text-base font-medium text-fg">{weekLine}</p>

          <Link
            to="/calendar"
            className="mt-2 flex min-h-11 items-center justify-between text-sm font-semibold text-fg transition hover:opacity-80"
          >
            Training calendar
            <ArrowRight size={14} className="text-primary" />
          </Link>
        </section>
      )}

      {/* ── Demoted: total weight lifted (chart behind a tap) ── */}
      {volumeTrend.length > 0 && (
        <section className="mt-8 animate-reveal-up" style={{ animationDelay: "300ms" }}>
          <button
            type="button"
            onClick={() => setShowLifted((v) => !v)}
            aria-expanded={showLifted}
            className="flex min-h-11 w-full items-center justify-between rule-hairline pt-3 text-left"
          >
            <span className="eyebrow">Total weight lifted</span>
            <ChevronDown
              size={15}
              className={`text-fg-muted transition-transform ${showLifted ? "rotate-180" : ""}`}
            />
          </button>
          {showLifted && (
            <div className="animate-fade-in">
              <div className="mt-3 h-[170px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={volumeTrend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 10, fill: "hsl(var(--text-tertiary))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--text-tertiary))" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(v) => [`${Number(v).toLocaleString()} ${units}`, "Lifted"]}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 10,
                        fontSize: 12,
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="volume"
                      stroke="hsl(var(--chart-line))"
                      strokeWidth={1.5}
                      fill="hsl(var(--chart-line) / 0.12)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="caption mt-2">
                Weekly totals, last 8 weeks
                {expandedTonnage ? (
                  <span className="text-fg-faint"> — {expandedTonnage}.</span>
                ) : (
                  "."
                )}
              </p>
            </div>
          )}
        </section>
      )}

      {/* ── Sheets ── */}
      <LiftDetailSheet
        lift={detailLift}
        onClose={() => setDetailLift(null)}
        logs={logs}
        units={units}
      />
      <RenameExercisesSheet
        open={renameOpen}
        onOpenChange={setRenameOpen}
        logs={logs}
        onRenamed={reload}
      />
    </div>
  );
};

export default Progress;
