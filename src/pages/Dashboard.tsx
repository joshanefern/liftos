import MetricCard from "@/components/MetricCard";
import { DailySummaryCard, SuggestedWorkoutCard, WeeklySummaryCard } from "@/components/SummaryCards";
import { currentUser, dailySummary, recentWorkouts, weeklySummary, weeklyTrend } from "@/data/liftosMock";
import { Activity, ArrowRight, CalendarCheck, Dumbbell, Flame, Layers, Timer } from "lucide-react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const Dashboard = () => (
  <div className="min-h-screen max-w-7xl p-6 md:p-10 lg:p-12">
    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between animate-reveal-up">
      <div>
        <p className="label-xs mb-2">Tuesday, Apr 21</p>
        <h1 className="heading-lg">Good morning, {currentUser.name}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
          Today is about keeping momentum high without burying recovery. Your week is balanced and the next best move is clear.
        </p>
      </div>
      <Link
        to="/workouts/active"
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-gold px-5 py-3 text-sm font-semibold text-background transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-gold/60"
      >
        <Dumbbell size={17} />
        Start workout
      </Link>
    </div>

    <section className="mb-8 grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
      <div className="rounded-xl gradient-surface border border-border/20 p-6 md:p-8 glow-gold animate-reveal-up">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-4 flex items-center gap-2 text-gold">
              <Activity size={17} />
              <span className="label-xs !text-gold">Training Readout</span>
            </div>
            <h2 className="text-3xl font-semibold tracking-tight md:text-5xl">5 sessions logged</h2>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-[hsl(var(--text-secondary))]">
              You are 92% consistent this week with volume trending up 2.2% over last week. Chest and back are on target;
              lower body needs one clean session to close the loop.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:w-64">
            <div className="rounded-lg surface-3 p-4">
              <p className="mono text-2xl font-semibold">87</p>
              <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">Hard sets</p>
            </div>
            <div className="rounded-lg surface-3 p-4">
              <p className="mono text-2xl font-semibold">92%</p>
              <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">Consistency</p>
            </div>
          </div>
        </div>

        <div className="mt-8 h-52">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyTrend} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="dashboardVolume" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(43 56% 52%)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="hsl(43 56% 52%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(0 0% 35%)" }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(0 0% 35%)" }} />
              <Tooltip
                cursor={false}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-border/50 surface-2 px-3 py-2 shadow-lg">
                      <p className="mb-1 text-xs text-[hsl(var(--text-tertiary))]">{label}</p>
                      <p className="text-sm font-medium text-gold">{Number(payload[0].value).toLocaleString()} lb</p>
                    </div>
                  ) : null
                }
              />
              <Area type="monotone" dataKey="volume" stroke="hsl(43 56% 52%)" strokeWidth={2} fill="url(#dashboardVolume)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <SuggestedWorkoutCard />
    </section>

    <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard icon={Flame} label="Weekly volume" value={92480} suffix=" lb" helper="+2.2%" delay={100} />
      <MetricCard icon={CalendarCheck} label="Frequency" value={5} suffix="/5" helper="On plan" delay={160} />
      <MetricCard icon={Layers} label="Total sets" value={87} helper="Target 82-92" delay={220} />
      <MetricCard icon={Timer} label="Avg duration" value={56} suffix=" min" helper="Efficient" delay={280} />
    </section>

    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <section className="rounded-xl surface-2 border border-border/20 p-5 md:p-6 animate-reveal-up">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="label-xs mb-2">Recent Workouts</p>
            <h2 className="heading-md">What you did recently</h2>
          </div>
          <Link to="/workouts" className="text-sm text-gold hover:underline">View all</Link>
        </div>
        <div className="space-y-3">
          {recentWorkouts.map((workout) => (
            <div key={workout.name} className="flex items-center justify-between gap-4 rounded-lg border border-border/20 bg-background/35 p-4">
              <div>
                <p className="text-sm font-semibold">{workout.name}</p>
                <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">{workout.focus} · {workout.date}</p>
              </div>
              <div className="hidden text-right sm:block">
                <p className="mono text-sm text-gold">{workout.volume.toLocaleString()} lb</p>
                <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">{workout.sets} sets · {workout.duration}m</p>
              </div>
              <ArrowRight size={15} className="text-[hsl(var(--text-tertiary))]" />
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6">
        <DailySummaryCard summary={dailySummary} compact />
        <WeeklySummaryCard summary={weeklySummary} />
      </div>
    </div>
  </div>
);

export default Dashboard;
