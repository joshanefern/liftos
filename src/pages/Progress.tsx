import { useUser } from "@/context/UserContext";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { GoldButton } from "@/components/GoldButton";
import {
  getMonthStats,
  getTopLifts,
  getVolumeTrend,
} from "@/lib/workoutStats";
import { Award, BarChart3, CalendarCheck, Dumbbell, Flame, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const Progress = () => {
  const { profile } = useUser();
  const { logs } = useWorkoutLogs();
  const units = profile?.units ?? "lb";

  const monthStats = useMemo(() => getMonthStats(logs), [logs]);
  const volumeTrend = useMemo(() => getVolumeTrend(logs), [logs]);
  const topLifts = useMemo(() => getTopLifts(logs), [logs]);

  const eightWeekVolume = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 56);
    return logs
      .filter((l) => new Date(l.finished_at) >= cutoff)
      .reduce((s, l) => s + l.total_volume, 0);
  }, [logs]);

  const prsThisBlock = topLifts.length;

  const metrics = [
    { icon: Flame, label: "8-week volume", value: eightWeekVolume > 0 ? `${(eightWeekVolume / 1000).toFixed(1)}k ${units}` : "–" },
    { icon: Dumbbell, label: "Avg hard sets", value: monthStats.avgSets > 0 ? String(monthStats.avgSets) : "–" },
    { icon: CalendarCheck, label: "Monthly workouts", value: monthStats.count > 0 ? String(monthStats.count) : "–" },
    { icon: Award, label: "PRs this block", value: prsThisBlock > 0 ? String(prsThisBlock) : "–" },
  ];

  return (
    <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(110,231,183,0.06),transparent_60%)]" />

      <div className="relative mb-8 animate-reveal-up">
        <p className="label-xs mb-2">Analytics</p>
        <h1 className="heading-lg">Progress</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/50">
          Chart-first training feedback grounded in logged work: volume, set distribution, personal records, and consistency.
        </p>
      </div>

      {/* Metric cards */}
      <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {metrics.map(({ icon: Icon, label, value }, i) => (
          <article
            key={label}
            className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-4 md:p-5 animate-reveal-up"
            style={{ animationDelay: `${i * 60 + 80}ms` }}
          >
            <div className="pointer-events-none absolute inset-x-[10%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent)]" />
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-foreground/30">{label}</span>
              <Icon size={15} className={value !== "–" ? "text-emerald-300/60" : "text-foreground/20"} />
            </div>
            <p className={`mono text-2xl font-semibold ${value !== "–" ? "" : "text-foreground/20"}`}>{value}</p>
            <p className="mt-2 text-xs text-foreground/20">{value !== "–" ? "This block" : "No data yet"}</p>
          </article>
        ))}
      </section>

      {/* Volume trend chart */}
      <section className="relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-5 md:p-6 animate-reveal-up mb-8">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,231,183,0.18),transparent)]" />
        <p className="label-xs mb-2 !text-emerald-300">Volume Trend</p>
        <h2 className="heading-md mb-6">8-week training volume</h2>

        {volumeTrend.length > 0 ? (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={volumeTrend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="emeraldGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6ee7b7" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6ee7b7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0d1125",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "0.75rem",
                    fontSize: 12,
                    color: "#fff",
                  }}
                  formatter={(v: number) => [`${v.toLocaleString()} ${units}`, "Volume"]}
                />
                <Area
                  type="monotone"
                  dataKey="volume"
                  stroke="#6ee7b7"
                  fill="url(#emeraldGrad)"
                  strokeWidth={1.5}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-[1.1rem] border border-emerald-300/20 bg-emerald-300/[0.07]">
              <BarChart3 size={22} className="text-emerald-300/60" />
            </div>
            <div>
              <h2 className="heading-md mb-2">No workouts logged yet</h2>
              <p className="max-w-sm text-sm leading-relaxed text-foreground/40">
                Your volume trend and personal records will appear here as you log workouts. All weights display in {units}.
              </p>
            </div>
            <GoldButton to="/workouts" className="mt-2">
              <Dumbbell size={15} />
              Log your first workout
            </GoldButton>
          </div>
        )}
      </section>

      {/* PRs */}
      <section className="mt-0">
        <div className="mb-4">
          <p className="label-xs mb-2">Personal Records</p>
          <h2 className="heading-md">Exercise-specific progress</h2>
        </div>
        <div className="relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-5 md:p-6">
          {topLifts.length > 0 ? (
            <div className="divide-y divide-white/[0.06]">
              {topLifts.map((lift, i) => (
                <div key={lift.name} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gold/20 bg-gold/10 text-xs font-semibold text-gold">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium">{lift.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold mono">{lift.weight} {units}</p>
                    <p className="text-xs text-foreground/30">× {lift.reps} reps</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-[0.875rem] border border-white/8 bg-white/[0.03]">
                <TrendingUp size={16} className="text-foreground/20" />
              </div>
              <p className="text-sm text-foreground/30">No records yet</p>
              <p className="text-xs text-foreground/20">PRs are tracked automatically as you log sets</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Progress;
