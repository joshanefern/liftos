import MetricCard from "@/components/MetricCard";
import { WeeklySummaryCard } from "@/components/SummaryCards";
import { consistencyData, exerciseProgress, muscleGroupData, weeklySummary, weeklyTrend } from "@/data/liftosMock";
import { Award, CalendarCheck, Dumbbell, Flame, TrendingUp } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type ChartPayloadItem = {
  dataKey?: string;
  name?: string;
  value?: string | number;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartPayloadItem[];
  label?: string | number;
};

const chartTooltip = ({ active, payload, label }: ChartTooltipProps) =>
  active && payload?.length ? (
    <div className="rounded-[1rem] border border-white/10 bg-white/[0.04] px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs text-foreground/30">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="text-sm font-medium text-emerald-300">
          {item.name ?? item.dataKey}: {Number(item.value).toLocaleString()}
        </p>
      ))}
    </div>
  ) : null;

const Progress = () => (
  <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(110,231,183,0.06),transparent_60%)]" />

    <div className="relative mb-8 animate-reveal-up">
      <p className="label-xs mb-2">Analytics</p>
      <h1 className="heading-lg">Progress</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/50">
        Chart-first training feedback grounded in logged work: volume, set distribution, personal records, and consistency.
      </p>
    </div>

    <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard icon={Flame} label="8-week volume" value={688920} suffix=" lb" helper="+24%" delay={80} />
      <MetricCard icon={Dumbbell} label="Avg hard sets" value={81.5} decimals={1} helper="Per week" delay={140} />
      <MetricCard icon={CalendarCheck} label="Monthly workouts" value={21} helper="5.2 / week" delay={200} />
      <MetricCard icon={Award} label="PRs this block" value={4} helper="All compounds" delay={260} />
    </section>

    <section className="mb-8 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6 animate-reveal-up">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,231,183,0.18),transparent)]" />
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-xs mb-2">Volume Trend</p>
            <h2 className="heading-md">Eight-week workload</h2>
          </div>
          <p className="text-sm text-emerald-300">+2.2% this week</p>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyTrend} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="progressVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(110,231,183)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="rgb(110,231,183)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "rgba(235,228,215,0.3)" }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "rgba(235,228,215,0.3)" }} />
              <Tooltip content={chartTooltip} cursor={false} />
              <Area name="Volume" type="monotone" dataKey="volume" stroke="rgb(110,231,183)" strokeWidth={2} fill="url(#progressVolume)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <WeeklySummaryCard summary={weeklySummary} />
    </section>

    <section className="mb-8 grid gap-6 xl:grid-cols-2">
      <div className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,231,183,0.14),transparent)]" />
        <p className="label-xs mb-2">Muscle Group Sets</p>
        <h2 className="heading-md mb-6">Weekly distribution</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={muscleGroupData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="group" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "rgba(235,228,215,0.3)" }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "rgba(235,228,215,0.3)" }} />
              <Tooltip content={chartTooltip} cursor={{ fill: "rgba(255,255,255,0.03)", opacity: 1 }} />
              <Bar dataKey="sets" name="Sets" fill="rgb(110,231,183)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="target" name="Target" fill="rgba(255,255,255,0.06)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,231,183,0.14),transparent)]" />
        <p className="label-xs mb-2">Consistency</p>
        <h2 className="heading-md mb-6">This week</h2>
        <div className="grid grid-cols-7 gap-2">
          {consistencyData.map((day) => (
            <div key={day.day} className="text-center">
              <div
                className={`mb-2 flex aspect-square items-center justify-center rounded-[0.875rem] border text-sm font-semibold ${
                  day.trained ? "border-emerald-300/40 bg-emerald-300/15 text-emerald-300" : "border-white/8 bg-white/[0.03] text-foreground/30"
                }`}
              >
                {day.day.slice(0, 1)}
              </div>
              <p className="text-[11px] text-foreground/30">{day.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-[1rem] border border-emerald-300/15 bg-emerald-300/[0.04] p-4">
          <div className="mb-2 flex items-center gap-2 text-emerald-300">
            <TrendingUp size={15} />
            <span className="text-xs font-medium uppercase tracking-widest">Coaching read</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground/50">
            Your best weeks happen when lower-body work lands before the weekend. Keep the next legs session on Thursday to avoid compressing volume.
          </p>
        </div>
      </div>
    </section>

    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="label-xs mb-2">Personal Records</p>
          <h2 className="heading-md">Exercise-specific progress</h2>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {exerciseProgress.map((lift) => (
          <article key={lift.lift} className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5">
            <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,231,183,0.14),transparent)]" />
            <p className="text-sm font-semibold">{lift.lift}</p>
            <p className="mt-4 mono text-3xl font-semibold text-emerald-300">{lift.current}</p>
            <p className="mt-1 text-xs text-foreground/30">Estimated 1RM, lb</p>
            <div className="mt-5 flex items-center justify-between rounded-[1rem] bg-white/[0.03] p-3 text-xs">
              <span className="text-foreground/30">Trend</span>
              <span className="font-semibold text-emerald-300">{lift.trend}</span>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-[1rem] bg-white/[0.03] p-3 text-xs">
              <span className="text-foreground/30">Block volume</span>
              <span className="font-semibold">{lift.volume.toLocaleString()} lb</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  </div>
);

export default Progress;
