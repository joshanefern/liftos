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
    <div className="rounded-lg border border-border/50 surface-2 px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs text-[hsl(var(--text-tertiary))]">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="text-sm font-medium text-gold">
          {item.name ?? item.dataKey}: {Number(item.value).toLocaleString()}
        </p>
      ))}
    </div>
  ) : null;

const Progress = () => (
  <div className="min-h-screen max-w-7xl p-6 md:p-10 lg:p-12">
    <div className="mb-8 animate-reveal-up">
      <p className="label-xs mb-2">Analytics</p>
      <h1 className="heading-lg">Progress</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
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
      <div className="rounded-xl surface-2 border border-border/20 p-5 md:p-6 animate-reveal-up">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="label-xs mb-2">Volume Trend</p>
            <h2 className="heading-md">Eight-week workload</h2>
          </div>
          <p className="text-sm text-gold">+2.2% this week</p>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyTrend} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="progressVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(43 56% 52%)" stopOpacity={0.24} />
                  <stop offset="100%" stopColor="hsl(43 56% 52%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.3} vertical={false} />
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(0 0% 35%)" }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(0 0% 35%)" }} />
              <Tooltip content={chartTooltip} cursor={false} />
              <Area name="Volume" type="monotone" dataKey="volume" stroke="hsl(43 56% 52%)" strokeWidth={2} fill="url(#progressVolume)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <WeeklySummaryCard summary={weeklySummary} />
    </section>

    <section className="mb-8 grid gap-6 xl:grid-cols-2">
      <div className="rounded-xl surface-2 border border-border/20 p-5 md:p-6">
        <p className="label-xs mb-2">Muscle Group Sets</p>
        <h2 className="heading-md mb-6">Weekly distribution</h2>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={muscleGroupData} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.25} vertical={false} />
              <XAxis dataKey="group" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(0 0% 35%)" }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(0 0% 35%)" }} />
              <Tooltip content={chartTooltip} cursor={{ fill: "hsl(var(--surface-3))", opacity: 0.25 }} />
              <Bar dataKey="sets" name="Sets" fill="hsl(43 56% 52%)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="target" name="Target" fill="hsl(var(--surface-3))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl surface-2 border border-border/20 p-5 md:p-6">
        <p className="label-xs mb-2">Consistency</p>
        <h2 className="heading-md mb-6">This week</h2>
        <div className="grid grid-cols-7 gap-2">
          {consistencyData.map((day) => (
            <div key={day.day} className="text-center">
              <div
                className={`mb-2 flex aspect-square items-center justify-center rounded-lg border text-sm font-semibold ${
                  day.trained ? "border-gold bg-gold text-background" : "border-border/20 surface-3 text-[hsl(var(--text-tertiary))]"
                }`}
              >
                {day.day.slice(0, 1)}
              </div>
              <p className="text-[11px] text-[hsl(var(--text-tertiary))]">{day.label}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 rounded-lg border border-border/20 bg-background/35 p-4">
          <div className="mb-2 flex items-center gap-2 text-gold">
            <TrendingUp size={15} />
            <span className="text-xs font-medium uppercase tracking-widest">Coaching read</span>
          </div>
          <p className="text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
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
          <article key={lift.lift} className="rounded-xl surface-2 border border-border/20 p-5">
            <p className="text-sm font-semibold">{lift.lift}</p>
            <p className="mt-4 mono text-3xl font-semibold text-gold">{lift.current}</p>
            <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">Estimated 1RM, lb</p>
            <div className="mt-5 flex items-center justify-between rounded-lg surface-3 p-3 text-xs">
              <span className="text-[hsl(var(--text-tertiary))]">Trend</span>
              <span className="font-semibold text-gold">{lift.trend}</span>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg surface-3 p-3 text-xs">
              <span className="text-[hsl(var(--text-tertiary))]">Block volume</span>
              <span className="font-semibold">{lift.volume.toLocaleString()} lb</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  </div>
);

export default Progress;
