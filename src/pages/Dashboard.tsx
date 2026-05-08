import MetricCard from "@/components/MetricCard";
import { GoldButton } from "@/components/GoldButton";
import {
  consistencyData,
  currentUser,
  dailySummary,
  exerciseProgress,
  weeklySummary,
  weeklyTrend,
} from "@/data/liftosMock";
import { ArrowRight, Dumbbell, Flame, CalendarCheck, Layers, Timer, Sparkles, TrendingUp, Brain } from "lucide-react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const today = new Date();
const dayLabel = today.toLocaleDateString("en-US", { weekday: "long" });
const dateLabel = today.toLocaleDateString("en-US", { month: "short", day: "numeric" });

const suggestedPrompts = [
  "What should I train today?",
  "Build me a 4-day split",
  "Why is my bench stalling?",
];

const Dashboard = () => (
  <div className="relative min-h-screen max-w-7xl p-6 md:p-10 lg:p-12">

    {/* ── Header ── */}
    <div className="relative mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between animate-reveal-up">
      <div>
        <p className="label-xs mb-2">{dayLabel}, {dateLabel}</p>
        <h1 className="heading-lg">Good morning, {currentUser.name}</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground/50">
          {weeklySummary.workoutsCompleted} sessions this week · {weeklySummary.totalSets} sets · {weeklySummary.consistencyScore}% consistency
        </p>
      </div>
      <GoldButton to="/workouts/active">
        <Dumbbell size={16} />
        Start workout
      </GoldButton>
    </div>

    {/* ── This week ── */}
    <div className="relative mb-8 overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-5 pt-5 pb-4 animate-reveal-up">
      <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />

      {/* Stats row */}
      <div className="mb-5 flex items-center gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-foreground/30 mb-0.5">This week</p>
          <p className="text-sm font-semibold">{weeklySummary.workoutsCompleted} <span className="font-normal text-foreground/30">/ {currentUser.frequency} sessions</span></p>
        </div>
        <div className="h-8 w-px bg-white/[0.08]" />
        <div>
          <p className="text-[10px] uppercase tracking-widest text-foreground/30 mb-0.5">Consistency</p>
          <p className="text-sm font-semibold">{weeklySummary.consistencyScore}%</p>
        </div>
        <div className="h-8 w-px bg-white/[0.08]" />
        <div>
          <p className="text-[10px] uppercase tracking-widest text-foreground/30 mb-0.5">Streak</p>
          <p className="text-sm font-semibold">{weeklySummary.workoutsCompleted} days</p>
        </div>
      </div>

      {/* Day track */}
      <div className="flex gap-1.5">
        {consistencyData.map((day) => (
          <div key={day.day} className="flex flex-1 flex-col items-center gap-1.5">
            <div className={`h-1.5 w-full rounded-full transition-all ${
              day.trained
                ? "bg-[linear-gradient(90deg,rgba(52,211,153,0.85),rgba(16,185,129,0.6))] shadow-[0_0_6px_rgba(52,211,153,0.2)]"
                : "bg-white/[0.07]"
            }`} />
            <span className={`text-[9px] font-medium uppercase tracking-widest ${day.trained ? "text-emerald-400/50" : "text-foreground/20"}`}>
              {day.day}
            </span>
          </div>
        ))}
      </div>
    </div>

    {/* ── Metric cards ── */}
    <section className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <MetricCard icon={Flame} label="Weekly volume" value={weeklySummary.totalVolume} suffix=" lb" helper="+2.2%" delay={0} />
      <MetricCard icon={CalendarCheck} label="Sessions" value={weeklySummary.workoutsCompleted} suffix={`/${currentUser.frequency}`} helper="On plan" delay={60} />
      <MetricCard icon={Layers} label="Total sets" value={weeklySummary.totalSets} helper="Target 82–92" delay={120} />
      <MetricCard icon={Timer} label="Avg duration" value={56} suffix=" min" helper="Efficient" delay={180} />
    </section>

    {/* ── Volume trend + Not sure where to start ── */}
    <section className="mb-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">

      {/* Volume trend */}
      <div className="relative overflow-hidden rounded-[1.25rem] bg-[linear-gradient(135deg,rgba(184,147,66,0.07),rgba(184,147,66,0.03))] border border-gold/20 p-5 md:p-6 glow-gold animate-reveal-up">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(184,147,66,0.22),transparent)]" />
        <div className="mb-1 flex items-center justify-between">
          <p className="label-xs !text-gold">Volume trend</p>
          <span className="text-xs text-gold/50">8 weeks</span>
        </div>
        <p className="mb-5 text-2xl font-semibold tracking-tight">
          {weeklySummary.totalVolume.toLocaleString()}{" "}
          <span className="text-sm font-normal text-foreground/40">lb this week</span>
        </p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
              <defs>
                <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(43 56% 52%)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="hsl(43 56% 52%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "rgba(235,228,215,0.28)" }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "rgba(235,228,215,0.28)" }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                cursor={false}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-[0.875rem] border border-white/10 bg-[#0d1020] px-3 py-2 shadow-lg">
                      <p className="mb-0.5 text-[10px] text-foreground/30">{label}</p>
                      <p className="text-sm font-semibold text-gold">{Number(payload[0].value).toLocaleString()} lb</p>
                    </div>
                  ) : null
                }
              />
              <Area type="monotone" dataKey="volume" stroke="hsl(43 56% 52%)" strokeWidth={1.5} fill="url(#volGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Not sure where to start */}
      <div className="relative overflow-hidden rounded-[1.25rem] border border-sky-300/15 bg-sky-300/[0.03] p-5 md:p-6 flex flex-col animate-reveal-up">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(125,211,252,0.18),transparent)]" />
        <div className="mb-4 flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[0.75rem] border border-sky-300/20 bg-sky-300/10">
            <Brain size={15} className="text-sky-300" />
          </div>
          <p className="label-xs !text-sky-300">AI Coach</p>
        </div>
        <h2 className="heading-md mb-2">Not sure where to start?</h2>
        <p className="text-sm leading-relaxed text-foreground/45 mb-6">
          Your coach knows your training history. Ask anything — what to train, how to progress, or what's holding you back.
        </p>
        <div className="mb-6 flex flex-wrap gap-2">
          {suggestedPrompts.map((prompt) => (
            <Link
              key={prompt}
              to="/coach"
              className="rounded-full border border-sky-300/15 bg-sky-300/[0.06] px-3 py-1.5 text-[11px] text-sky-300/70 transition hover:border-sky-300/30 hover:text-sky-300"
            >
              {prompt}
            </Link>
          ))}
        </div>
        <Link
          to="/coach"
          className="mt-auto inline-flex items-center gap-2 text-sm font-medium text-sky-300 transition hover:text-sky-200"
        >
          Open coach <ArrowRight size={14} />
        </Link>
      </div>
    </section>

    {/* ── Insight + Lift progress ── */}
    <section className="grid gap-6 xl:grid-cols-2">

      {/* Today's insight */}
      <div className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6 animate-reveal-up">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
        <div className="mb-4 flex items-center gap-2">
          <Sparkles size={14} className="text-sky-300" />
          <p className="label-xs !text-sky-300">Today's insight</p>
        </div>
        <p className="text-sm leading-relaxed text-foreground/60">{dailySummary.insight}</p>
        <p className="mt-3 text-sm leading-relaxed text-foreground/40">{dailySummary.tomorrow}</p>
        <Link
          to="/coach"
          className="mt-5 inline-flex items-center gap-1.5 text-xs text-sky-300/60 transition hover:text-sky-300"
        >
          Ask the coach <ArrowRight size={11} />
        </Link>
      </div>

      {/* Top lifts */}
      <div className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6 animate-reveal-up">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
        <div className="mb-5 flex items-center justify-between">
          <p className="label-xs">Top lifts</p>
          <Link to="/progress" className="text-xs text-foreground/40 transition hover:text-gold">
            Full progress <ArrowRight size={11} className="inline" />
          </Link>
        </div>
        <div className="space-y-2.5">
          {exerciseProgress.map((lift) => (
            <div key={lift.lift} className="flex items-center justify-between gap-4 rounded-[1rem] border border-white/8 bg-white/[0.03] px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[0.6rem] border border-gold/20 bg-gold/[0.08]">
                  <TrendingUp size={12} className="text-gold" />
                </div>
                <p className="text-sm font-medium truncate">{lift.lift}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold mono">{lift.current} lb</p>
                <p className="mt-0.5 text-xs text-emerald-400">{lift.trend}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>

  </div>
);

export default Dashboard;
