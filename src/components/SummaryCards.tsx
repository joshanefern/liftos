import { ArrowRight, CalendarDays, CheckCircle2, Gauge, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

type DailySummary = {
  workoutName: string;
  totalExercises: number;
  totalSets: number;
  totalVolume: number;
  duration: number;
  insight: string;
  tomorrow: string;
};

type WeeklySummary = {
  workoutsCompleted: number;
  totalSets: number;
  totalVolume: number;
  strongestTrend: string;
  consistencyScore: number;
  insight: string;
};

export const DailySummaryCard = ({ summary, compact = false }: { summary: DailySummary; compact?: boolean }) => (
  <section className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6">
    <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(125,211,252,0.18),transparent)]" />
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <p className="label-xs mb-2">Daily Summary</p>
        <h2 className="heading-md">{summary.workoutName}</h2>
      </div>
      <CheckCircle2 size={20} className="text-sky-300" />
    </div>

    <div className="grid grid-cols-3 gap-3">
      {[
        { label: "Exercises", value: summary.totalExercises },
        { label: "Sets", value: summary.totalSets },
        { label: "Volume", value: `${summary.totalVolume.toLocaleString()} lb` },
      ].map((item) => (
        <div key={item.label} className="rounded-[1rem] bg-white/[0.03] p-3">
          <p className="text-sm font-semibold mono">{item.value}</p>
          <p className="mt-1 text-[11px] text-foreground/30">{item.label}</p>
        </div>
      ))}
    </div>

    <div className="mt-5 rounded-[1rem] border border-sky-300/15 bg-sky-300/[0.04] p-4">
      <div className="mb-2 flex items-center gap-2 text-sky-300">
        <Sparkles size={14} />
        <span className="text-xs font-medium uppercase tracking-widest">Insight</span>
      </div>
      <p className="text-sm leading-relaxed text-foreground/50">{summary.insight}</p>
      {!compact && (
        <p className="mt-3 text-sm leading-relaxed text-foreground/50">{summary.tomorrow}</p>
      )}
    </div>
  </section>
);

export const WeeklySummaryCard = ({ summary }: { summary: WeeklySummary }) => (
  <section className="relative overflow-hidden rounded-[1.25rem] bg-[linear-gradient(135deg,rgba(184,147,66,0.07),rgba(184,147,66,0.03))] border border-gold/20 p-5 md:p-6 glow-gold">
    <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(184,147,66,0.22),transparent)]" />
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <p className="label-xs mb-2">Weekly Summary</p>
        <h2 className="heading-md">Training week is on pace</h2>
      </div>
      <Gauge size={20} className="text-gold" />
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-[1rem] bg-white/[0.03] p-4">
        <p className="text-2xl font-semibold mono">{summary.workoutsCompleted}</p>
        <p className="mt-1 text-xs text-foreground/30">Workouts</p>
      </div>
      <div className="rounded-[1rem] bg-white/[0.03] p-4">
        <p className="text-2xl font-semibold mono">{summary.totalSets}</p>
        <p className="mt-1 text-xs text-foreground/30">Hard sets</p>
      </div>
      <div className="rounded-[1rem] bg-white/[0.03] p-4">
        <p className="text-2xl font-semibold mono">{summary.consistencyScore}%</p>
        <p className="mt-1 text-xs text-foreground/30">Consistency</p>
      </div>
    </div>

    <div className="mt-5 space-y-3 text-sm leading-relaxed text-foreground/50">
      <p>{summary.strongestTrend}</p>
      <p>{summary.insight}</p>
    </div>
  </section>
);

export const SuggestedWorkoutCard = () => (
  <section className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6">
    <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="mb-3 flex items-center gap-2 text-gold">
          <CalendarDays size={16} />
          <span className="label-xs !text-gold">Suggested Next</span>
        </div>
        <h2 className="heading-md">Pull Hypertrophy</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/50">
          Back volume is slightly under target, while chest and triceps were trained today. This keeps the week balanced.
        </p>
      </div>
    </div>
    <Link
      to="/workouts/active"
      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,rgba(215,181,99,1),rgba(184,147,66,1))] px-4 py-3 text-sm font-medium text-background transition hover:opacity-90 active:scale-[0.97] focus:outline-none focus:ring-2 focus:ring-gold/60"
    >
      Start suggested workout
      <ArrowRight size={15} />
    </Link>
  </section>
);
