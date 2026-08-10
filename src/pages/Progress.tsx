import { CTAButton } from "@/components/GoldButton";
import { MuscleMap } from "@/components/MuscleMap";
import { useUser } from "@/context/UserContext";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { getMuscleActivation } from "@/lib/muscleMap";
import { getLastTrainedByMuscle, labelForMuscle, TRACKED_MUSCLES } from "@/lib/muscleCoverage";
import { allTimePRs, bestWeight, type WeightRecord } from "@/lib/prs";
import { getMonthStats, getVolumeTrend } from "@/lib/workoutStats";
import { Dumbbell } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const DAY_MS = 86_400_000;
const PR_VISIBLE_COUNT = 8;
const PR_RECENT_DAYS = 7;
const COVERAGE_VISIBLE_COUNT = 4;

/* Compact relative label for record dates ("3d ago"). */
const relativeDay = (iso: string): string => {
  const days = Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);
  if (days <= 0) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 56) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

/* Compact numeral for the hero — "142.5k", never "142,500". */
const compactNum = (n: number): string =>
  n >= 10_000
    ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
    : n.toLocaleString();

/* ── Muscle coverage — days since each muscle was last a primary mover.
     The staleness convention (labels, tracked list, last-trained map) lives in
     src/lib/muscleCoverage.ts, shared with the suggestion engine. ── */

const Progress = () => {
  const { profile } = useUser();
  const { logs } = useWorkoutLogs();
  const units = profile?.units ?? "lb";
  const [showAllPRs, setShowAllPRs] = useState(false);

  const monthStats = useMemo(() => getMonthStats(logs), [logs]);
  const volumeTrend = useMemo(() => getVolumeTrend(logs), [logs]);

  const prs = useMemo(() => allTimePRs(logs), [logs]);
  // Reps at the max weight — allTimePRs carries the numbers per kind, but the
  // "best 225 × 5" line needs the reps achieved at that top weight.
  const bestWeightRecords = useMemo(() => {
    const map = new Map<string, WeightRecord | null>();
    for (const pr of prs) map.set(pr.exerciseName, bestWeight(logs, pr.exerciseName));
    return map;
  }, [logs, prs]);
  const visiblePRs = showAllPRs ? prs : prs.slice(0, PR_VISIBLE_COUNT);

  const eightWeek = useMemo(() => {
    const cutoff = Date.now() - 56 * DAY_MS;
    let volume = 0;
    let sessions = 0;
    for (const log of logs) {
      if (new Date(log.finished_at).getTime() < cutoff) continue;
      volume += log.total_volume;
      sessions += 1;
    }
    return { volume, sessions };
  }, [logs]);

  // Exercises whose records improved inside the 8-week block, matching the
  // hero number's window.
  const prsThisBlock = useMemo(() => {
    const cutoff = Date.now() - 56 * DAY_MS;
    return prs.filter((p) => Date.parse(p.lastImproved) >= cutoff).length;
  }, [prs]);

  // Fallback hero when the 8-week window is empty but history exists:
  // the heaviest projected single across all logged exercises.
  const bestE1RM = useMemo(() => {
    let best: { name: string; value: number } | null = null;
    for (const pr of prs) {
      if (pr.maxE1RM !== null && (best === null || pr.maxE1RM > best.value)) {
        best = { name: pr.exerciseName, value: pr.maxE1RM };
      }
    }
    return best;
  }, [prs]);

  const coverage = useMemo(() => {
    const lastTrained = getLastTrainedByMuscle(logs);
    const now = Date.now();
    // Most neglected first: never-trained (no record), then longest ago.
    const neglected = TRACKED_MUSCLES.map((muscle) => {
      const time = lastTrained.get(muscle);
      return {
        muscle,
        days: time ? Math.max(0, Math.floor((now - time) / DAY_MS)) : null,
      };
    })
      .sort((a, b) => {
        if (a.days === null && b.days === null) return 0;
        if (a.days === null) return -1;
        if (b.days === null) return 1;
        return b.days - a.days;
      })
      .slice(0, COVERAGE_VISIBLE_COUNT);
    return { neglected, hasHistory: lastTrained.size > 0 };
  }, [logs]);

  const stats = [
    { label: "Avg hard sets", value: monthStats.avgSets > 0 ? String(monthStats.avgSets) : "–" },
    { label: "Workouts / mo", value: monthStats.count > 0 ? String(monthStats.count) : "–" },
    { label: "PRs this block", value: prsThisBlock > 0 ? String(prsThisBlock) : "–" },
  ];

  return (
    <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">

      {/* ── Header — one eyebrow row ── */}
      <header className="flex items-baseline justify-between animate-reveal-up">
        <p className="eyebrow !text-fg">Progress</p>
        <p className="eyebrow !text-fg-faint">Last 8 weeks</p>
      </header>

      {/* ── THE NUMBER ── */}
      <section
        className="mt-10 md:mt-14 animate-reveal-up"
        style={{ animationDelay: "60ms" }}
      >
        {eightWeek.volume > 0 ? (
          <>
            <p className="stat-hero !text-6xl md:!text-7xl whitespace-nowrap">
              {compactNum(eightWeek.volume)}
              <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                {units}
              </span>
            </p>
            <p className="eyebrow mt-4">Training volume · 8 weeks</p>
            <p className="body-sm mt-4 max-w-sm">
              Across {eightWeek.sessions} logged session
              {eightWeek.sessions === 1 ? "" : "s"} in the last 8 weeks.
            </p>
          </>
        ) : bestE1RM !== null ? (
          <>
            <p className="stat-hero !text-6xl md:!text-7xl whitespace-nowrap">
              {Math.round(bestE1RM.value).toLocaleString()}
              <span className="ml-2.5 text-xl md:text-2xl font-light tracking-normal text-fg-muted">
                {units}
              </span>
            </p>
            <p className="eyebrow mt-4">Best e1RM · {bestE1RM.name}</p>
            <p className="body-sm mt-4 max-w-sm">
              Your heaviest projected single from logged sets — no volume in the
              last 8 weeks yet.
            </p>
          </>
        ) : (
          <>
            <p className="stat-hero !text-6xl md:!text-7xl !text-fg-disabled">0</p>
            <p className="eyebrow mt-4">Training volume · 8 weeks</p>
            <p className="body-sm mt-4 max-w-sm">
              Your volume trend and personal records will appear here as you log
              workouts. All weights display in {units}.
            </p>
            <CTAButton to="/workouts" className="mt-7">
              <Dumbbell size={15} />
              Log your first workout
            </CTAButton>
          </>
        )}
      </section>

      {/* ── Stat strip — the old tile grid, collapsed to one hairline row ── */}
      {logs.length > 0 && (
        <section
          className="mt-10 grid grid-cols-3 border-y border-border py-4 animate-reveal-up"
          style={{ animationDelay: "120ms" }}
        >
          {stats.map(({ label, value }, i) => (
            <div key={label} className={i > 0 ? "border-l border-border pl-4 md:pl-6" : ""}>
              <p className={`stat-md whitespace-nowrap ${value === "–" ? "!text-fg-muted" : ""}`}>
                {value}
              </p>
              <p className="caption mt-0.5">{label}</p>
            </div>
          ))}
        </section>
      )}

      {/* ── Volume trend — this screen's detail chart ── */}
      {volumeTrend.length > 0 && (
        <section
          className="mt-12 animate-reveal-up"
          style={{ animationDelay: "180ms" }}
        >
          <p className="eyebrow mb-4">Volume trend</p>
          <div className="h-[180px]">
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
                  formatter={(v: number) => [`${v.toLocaleString()} ${units}`, "Volume"]}
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
          </div>
        </section>
      )}

      {/* ── Personal records — index rows ── */}
      {prs.length > 0 && (
        <section
          className="mt-12 animate-reveal-up"
          style={{ animationDelay: "240ms" }}
        >
          <p className="eyebrow mb-3">Personal records</p>
          <div className="divide-y divide-border border-y border-border">
            {visiblePRs.map((pr) => {
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
                      <span className="!text-fg-faint"> · {relativeDay(pr.lastImproved)}</span>
                    </p>
                  </div>
                  {pr.maxE1RM !== null && (
                    <div className="shrink-0 text-right">
                      <p className="stat-lg whitespace-nowrap">
                        <b>{Math.round(pr.maxE1RM)}</b>
                        <span className="text-fg-muted"> {units}</span>
                      </p>
                      <p className="caption !text-fg-faint">e1RM</p>
                    </div>
                  )}
                </div>
              );
            })}
            {prs.length > PR_VISIBLE_COUNT && (
              <button
                type="button"
                onClick={() => setShowAllPRs((v) => !v)}
                className="caption w-full py-3 text-left !text-fg-muted transition hover:!text-fg"
              >
                {showAllPRs ? "Show fewer" : `Show all ${prs.length}`}
              </button>
            )}
          </div>
        </section>
      )}

      {/* ── Muscle coverage — where the dashboard's index row lands ── */}
      {coverage.hasHistory && (
        <section
          id="coverage"
          className="mt-12 animate-reveal-up"
          style={{ animationDelay: "300ms" }}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <p className="eyebrow">Muscle coverage</p>
            <p className="caption !text-fg-faint">days since trained</p>
          </div>
          <MuscleMap activation={getMuscleActivation(logs, 7)} className="mb-5" />
          <div className="divide-y divide-border border-y border-border">
            {coverage.neglected.map(({ muscle, days }) => (
              <div key={muscle} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm font-semibold text-fg">
                  {labelForMuscle(muscle)}
                </span>
                <span className="mono text-sm text-fg-muted">
                  {days === null
                    ? "no record"
                    : days === 0
                      ? "today"
                      : `${days} day${days === 1 ? "" : "s"}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Progress;
