import { CTAButton } from "@/components/GoldButton";
import { MuscleMap } from "@/components/MuscleMap";
import { useUser } from "@/context/UserContext";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { getMuscleActivation } from "@/lib/muscleMap";
import { getLastTrainedByMuscle, labelForMuscle } from "@/lib/muscleCoverage";
import { allTimePRs, bestWeight, type WeightRecord } from "@/lib/prs";
import { featuredLift, getLiftTrends } from "@/lib/strengthTrend";
import { getVolumeTrend, getWeeklyStreak, getWeekStats } from "@/lib/workoutStats";
import { ArrowRight, ChevronDown, Dumbbell } from "lucide-react";
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

/* ── Progress — answers ONE question: "am I getting stronger?"
     (Research: per-lift strength trend is what lifters re-check; totals and
     averages are share-card material, not screen material.) Structure:
     strength-trend hero, then exactly three cards — Strength, Records,
     This week — with the volume chart demoted behind a tap. ── */

const DAY_MS = 86_400_000;
const PR_RECENT_DAYS = 7;
const RECORDS_VISIBLE = 3;

const relativeDay = (iso: string): string => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
  if (days <= 0) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 56) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
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

const CARD_CLASS =
  "rounded-[14px] bg-card p-4 shadow-[0_4px_12px_rgba(16,22,35,0.08)] " +
  "dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)]";

const Progress = () => {
  const { profile } = useUser();
  const { logs } = useWorkoutLogs();
  const units = profile?.units ?? "lb";
  const [showAllRecords, setShowAllRecords] = useState(false);
  const [showLifted, setShowLifted] = useState(false);

  const trends = useMemo(() => getLiftTrends(logs), [logs]);
  const hero = useMemo(() => featuredLift(trends), [trends]);
  const keyLifts = useMemo(() => trends.slice(0, 4), [trends]);

  // Records, most recently improved first — "what did I just achieve".
  const prs = useMemo(
    () =>
      [...allTimePRs(logs)].sort(
        (a, b) => Date.parse(b.lastImproved) - Date.parse(a.lastImproved),
      ),
    [logs],
  );
  const bestWeightRecords = useMemo(() => {
    const map = new Map<string, WeightRecord | null>();
    for (const pr of prs) map.set(pr.exerciseName, bestWeight(logs, pr.exerciseName));
    return map;
  }, [logs, prs]);
  const visibleRecords = showAllRecords ? prs : prs.slice(0, RECORDS_VISIBLE);

  const weekStats = useMemo(() => getWeekStats(logs), [logs]);
  const weeklyStreak = useMemo(() => getWeeklyStreak(logs), [logs]);
  const volumeTrend = useMemo(() => getVolumeTrend(logs), [logs]);
  const frequency =
    String(profile?.frequency ?? "").replace(/\s*days?\s*/i, "").trim() || null;

  // One plain-English balance verdict under the body map: celebrate full
  // coverage, otherwise name the most neglected muscle.
  const balanceVerdict = useMemo(() => {
    const lastTrained = getLastTrainedByMuscle(logs);
    if (lastTrained.size === 0) return null;
    let stalest: { muscle: string; days: number } | null = null;
    const now = Date.now();
    for (const [muscle, time] of lastTrained) {
      const days = Math.floor((now - time) / DAY_MS);
      if (stalest === null || days > stalest.days) {
        stalest = { muscle: labelForMuscle(muscle), days };
      }
    }
    if (!stalest || stalest.days <= 7) {
      return "Every trained muscle hit within the last week.";
    }
    return `${stalest.muscle}: ${stalest.days} days since last trained — worth a look.`;
  }, [logs]);

  const heroDelta = hero ? hero.delta : 0;

  return (
    <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
      {/* ── Header ── */}
      <header className="animate-reveal-up">
        <p className="eyebrow !text-fg">Progress</p>
      </header>

      {/* ── THE NUMBER — your headline lift's trend ── */}
      <section className="mt-10 md:mt-14 animate-reveal-up" style={{ animationDelay: "60ms" }}>
        {hero ? (
          <>
            <p className="stat-hero !text-6xl md:!text-7xl whitespace-nowrap">
              {hero.first}
              <span className="mx-2 align-middle text-2xl font-extralight text-fg-muted">→</span>
              {hero.last}
              <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                {units}
              </span>
            </p>
            <p className="eyebrow mt-4">{hero.name}</p>
            <p className="body-sm mt-4 max-w-sm">
              {heroDelta > 0
                ? `Up ${heroDelta} ${units} across ${hero.sessions} sessions — your best-moving lift right now.`
                : heroDelta === 0
                  ? `Holding steady across ${hero.sessions} sessions — your most-trained lift.`
                  : `Down ${Math.abs(heroDelta)} ${units} across ${hero.sessions} sessions — worth asking the coach about.`}
            </p>
          </>
        ) : prs.length > 0 ? (
          /* History exists but no lift has 3+ recent sessions — lead with the
             latest best instead of contradicting the records below. */
          <>
            <p className="stat-hero !text-6xl md:!text-7xl whitespace-nowrap">
              {prs[0].maxE1RM !== null ? Math.round(prs[0].maxE1RM) : prs[0].maxReps ?? 0}
              <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                {prs[0].maxE1RM !== null ? units : "reps"}
              </span>
            </p>
            <p className="eyebrow mt-4">Latest best · {prs[0].exerciseName}</p>
            <p className="body-sm mt-4 max-w-sm">
              Log three sessions of any lift and its strength trend charts
              here.
            </p>
          </>
        ) : (
          <>
            <p className="stat-hero !text-6xl md:!text-7xl !text-fg-muted">0</p>
            <p className="eyebrow mt-4">Strength trend</p>
            <p className="body-sm mt-4 max-w-sm">
              Log a few workouts and this becomes the story of your strongest
              lifts — every weight in {units}.
            </p>
            <CTAButton to="/workouts" className="mt-7">
              <Dumbbell size={15} />
              Log your first workout
            </CTAButton>
          </>
        )}
      </section>

      {/* ── Card 1 · STRENGTH — your key lifts, trending ── */}
      {keyLifts.length > 0 && (
        <section className={`${CARD_CLASS} mt-10 animate-reveal-up`} style={{ animationDelay: "120ms" }}>
          <p className="eyebrow mb-1">Strength</p>
          <p className="caption mb-3">Best working set per session, last 12 weeks.</p>
          <div className="divide-y divide-border">
            {keyLifts.map((lift) => (
              <div key={lift.name} className="flex items-center gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-fg">{lift.name}</p>
                  <p className="caption mt-0.5">
                    {lift.first} → {lift.last} {units}
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
                  {lift.delta > 0 ? `+${lift.delta}` : lift.delta}
                  <span className="ml-1 text-[11px] font-normal text-fg-muted">{units}</span>
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Card 2 · RECORDS — most recent bests ── */}
      {prs.length > 0 && (
        <section className={`${CARD_CLASS} mt-4 animate-reveal-up`} style={{ animationDelay: "180ms" }}>
          <p className="eyebrow mb-3">Records</p>
          <div className="divide-y divide-border">
            {visibleRecords.map((pr) => {
              const best = bestWeightRecords.get(pr.exerciseName) ?? null;
              const recentlyImproved =
                Date.now() - Date.parse(pr.lastImproved) < PR_RECENT_DAYS * DAY_MS;
              return (
                <div key={pr.exerciseName} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                      {recentlyImproved && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                      )}
                      <span className="truncate">{pr.exerciseName}</span>
                    </p>
                    <p className="caption mt-0.5">
                      {best !== null
                        ? `Best ${best.weight} ${units} × ${best.reps}`
                        : pr.maxReps !== null
                          ? `Best ${pr.maxReps} reps`
                          : "Logged"}
                      <span className="text-fg-faint"> · {relativeDay(pr.lastImproved)}</span>
                    </p>
                  </div>
                  {pr.maxE1RM !== null && (
                    <div className="shrink-0 text-right">
                      <p className="stat-lg whitespace-nowrap">
                        <b>{Math.round(pr.maxE1RM)}</b>
                        <span className="text-fg-muted"> {units}</span>
                      </p>
                      <p className="caption !text-fg-muted">Est. max</p>
                    </div>
                  )}
                </div>
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
        </section>
      )}

      {/* ── Card 3 · THIS WEEK — consistency + balance ── */}
      {logs.length > 0 && (
        <section className={`${CARD_CLASS} mt-4 animate-reveal-up`} style={{ animationDelay: "240ms" }}>
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">This week</p>
            {weeklyStreak > 1 && (
              <p className="caption">
                {weeklyStreak} weeks in a row
              </p>
            )}
          </div>
          <p className="mt-2 text-base font-medium text-fg">
            {weekStats.sessions} workout{weekStats.sessions === 1 ? "" : "s"}
            {frequency ? ` of ${frequency} planned` : ""} this week
          </p>
          <MuscleMap activation={getMuscleActivation(logs, 7)} className="mt-4 mb-3" />
          {balanceVerdict && <p className="caption">{balanceVerdict}</p>}
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
            <div className="mt-3 h-[170px] animate-fade-in">
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
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.75rem",
                      fontSize: 12,
                      color: "hsl(var(--popover-foreground))",
                    }}
                    formatter={(v: number) => [`${v.toLocaleString()} ${units}`, "Lifted"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="volume"
                    stroke="hsl(var(--chart-line))"
                    fill="hsl(var(--chart-line))"
                    fillOpacity={0.08}
                    strokeWidth={1.5}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <p className="caption mt-2">
                Weekly total of every completed working set, last 8 weeks.
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default Progress;
