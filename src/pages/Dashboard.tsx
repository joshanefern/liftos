import { GoldButton } from "@/components/GoldButton";
import { useUser } from "@/context/UserContext";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import {
  getConsistency,
  getStreak,
  getTopLifts,
  getVolumeTrend,
  getWeekStats,
} from "@/lib/workoutStats";
import { ArrowRight, Brain, Dumbbell, Sparkles, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

const today = new Date();
const dayLabel = today.toLocaleDateString("en-US", { weekday: "long" });
const dateLabel = today.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const suggestedPrompts = [
  "What should I train today?",
  "Build me a 4-day split",
  "Why is my bench stalling?",
];

const Dashboard = () => {
  const { profile, user } = useUser();
  const { state } = useLocation();
  const { logs } = useWorkoutLogs();

  const firstName = profile?.first_name ?? "";
  const frequency = profile?.frequency ?? "–";
  const units = profile?.units ?? "lb";

  const isNewUser = user
    ? Date.now() - new Date(user.created_at).getTime() < 60 * 60 * 1000
    : false;
  const firstTimeNav = state?.firstTime === true;

  const greeting =
    isNewUser || firstTimeNav
      ? `Welcome to LiftOS${firstName ? `, ${firstName}` : ""}`
      : `Welcome back${firstName ? `, ${firstName}` : ""}`;

  const weekStats = useMemo(() => getWeekStats(logs), [logs]);
  const streak = useMemo(() => getStreak(logs), [logs]);
  const consistency = useMemo(() => getConsistency(logs, profile?.frequency ?? null), [logs, profile?.frequency]);
  const volumeTrend = useMemo(() => getVolumeTrend(logs), [logs]);
  const topLifts = useMemo(() => getTopLifts(logs), [logs]);

  const lastLog = logs[0] ?? null;

  return (
    <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">

      {/* ── Header ── */}
      <div className="relative mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between animate-reveal-up">
        <div>
          <p className="label-xs mb-2">{dayLabel}, {dateLabel}</p>
          <h1 className="heading-lg">{greeting}</h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground/50">
            {weekStats.sessions === 0
              ? "0 sessions this week · log your first workout to start tracking"
              : `${weekStats.sessions} session${weekStats.sessions === 1 ? "" : "s"} this week · ${weekStats.totalVolume.toLocaleString()} ${units} volume`}
          </p>
        </div>
        <GoldButton to="/workouts">
          <Dumbbell size={16} />
          Start workout
        </GoldButton>
      </div>

      {/* ── This week ── */}
      <div className="relative mb-8 overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.04] px-5 pt-5 pb-4 animate-reveal-up">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
        <div className="mb-5 flex items-center gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-foreground/30 mb-0.5">This week</p>
            <p className="text-sm font-semibold">
              {weekStats.sessions}{" "}
              <span className="font-normal text-foreground/30">/ {frequency} target</span>
            </p>
          </div>
          <div className="h-8 w-px bg-white/[0.08]" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-foreground/30 mb-0.5">Consistency</p>
            <p className={`text-sm font-semibold ${consistency > 0 ? "" : "text-foreground/30"}`}>
              {consistency > 0 ? `${consistency}%` : "–"}
            </p>
          </div>
          <div className="h-8 w-px bg-white/[0.08]" />
          <div>
            <p className="text-[10px] uppercase tracking-widest text-foreground/30 mb-0.5">Streak</p>
            <p className={`text-sm font-semibold ${streak > 0 ? "" : "text-foreground/30"}`}>
              {streak > 0 ? `${streak} day${streak === 1 ? "" : "s"}` : "0 days"}
            </p>
          </div>
        </div>
        <div className="flex gap-1.5">
          {DAYS.map((day, index) => {
            const worked = weekStats.workedDayIndices.includes(index);
            return (
              <div key={day} className="flex flex-1 flex-col items-center gap-1.5">
                <div className={`h-1.5 w-full rounded-full transition-colors ${worked ? "bg-emerald-400/70" : "bg-white/[0.07]"}`} />
                <span className="text-[9px] font-medium uppercase tracking-widest text-white/30">
                  {day}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Volume trend + AI Coach ── */}
      <section className="mb-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">

        {/* Volume trend */}
        <div className="relative overflow-hidden rounded-[1.25rem] bg-[linear-gradient(135deg,rgba(184,147,66,0.07),rgba(184,147,66,0.03))] border border-gold/20 p-5 md:p-6 glow-gold animate-reveal-up flex flex-col">
          <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(184,147,66,0.22),transparent)]" />
          <div className="mb-1 flex items-center justify-between">
            <p className="label-xs !text-gold">Volume trend</p>
            <span className="text-xs text-gold/50">8 weeks</span>
          </div>

          {volumeTrend.length > 0 ? (
            <>
              <p className="mb-4 text-2xl font-semibold tracking-tight">
                {(volumeTrend.at(-1)?.volume ?? 0).toLocaleString()}{" "}
                <span className="text-base font-normal text-foreground/40">{units}</span>
              </p>
              <div className="flex-1 min-h-[100px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={volumeTrend} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                    <defs>
                      <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#b89342" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#b89342" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 9, fill: "rgba(184,147,66,0.5)" }}
                      axisLine={false}
                      tickLine={false}
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
                      stroke="#b89342"
                      fill="url(#goldGrad)"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : (
            <>
              <p className="mb-4 text-2xl font-semibold tracking-tight text-foreground/30">No data yet</p>
              <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-[1rem] border border-gold/10 bg-gold/[0.04] py-10">
                <TrendingUp size={22} className="text-gold/30" />
                <p className="text-sm text-foreground/30">Log your first workout to start tracking volume</p>
                <GoldButton to="/workouts" className="mt-1">
                  <Dumbbell size={14} />
                  Go to workouts
                </GoldButton>
              </div>
            </>
          )}
        </div>

        {/* AI Coach */}
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
            Your coach knows your training profile. Ask anything — what to train, how to progress, or what's holding you back.
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

      {/* ── Insight + Top lifts ── */}
      <section className="grid gap-6 xl:grid-cols-2">

        {/* Today's insight */}
        <div className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6 animate-reveal-up">
          <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
          <div className="mb-4 flex items-center gap-2">
            <Sparkles size={14} className="text-sky-300" />
            <p className="label-xs !text-sky-300">Today's insight</p>
          </div>
          {lastLog ? (
            <>
              <p className="text-sm leading-relaxed text-foreground/60">
                Last session: <span className="text-foreground font-medium">{lastLog.name}</span> —{" "}
                {lastLog.completed_sets} sets, {lastLog.total_volume.toLocaleString()} {units} volume
                {lastLog.duration_minutes ? `, ${lastLog.duration_minutes} min` : ""}.
              </p>
              <Link
                to="/progress"
                className="mt-5 inline-flex items-center gap-1.5 text-xs text-sky-300/60 transition hover:text-sky-300"
              >
                View progress <ArrowRight size={11} />
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-foreground/30">
                Complete your first workout and your coach will start generating daily insights based on your training patterns.
              </p>
              <Link
                to="/coach"
                className="mt-5 inline-flex items-center gap-1.5 text-xs text-sky-300/60 transition hover:text-sky-300"
              >
                Ask the coach <ArrowRight size={11} />
              </Link>
            </>
          )}
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
          {topLifts.length > 0 ? (
            <div className="space-y-3">
              {topLifts.map((lift) => (
                <div key={lift.name} className="flex items-center justify-between rounded-[1rem] bg-white/[0.03] px-4 py-3 text-sm">
                  <span className="text-foreground/60 truncate">{lift.name}</span>
                  <span className="ml-4 shrink-0 font-semibold mono">
                    {lift.weight} {units} × {lift.reps}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-[0.875rem] border border-white/8 bg-white/[0.03]">
                <TrendingUp size={16} className="text-foreground/20" />
              </div>
              <p className="text-sm text-foreground/30">No lifts tracked yet</p>
              <p className="text-xs text-foreground/20">Log sets to build your lift history</p>
            </div>
          )}
        </div>
      </section>

    </div>
  );
};

export default Dashboard;
