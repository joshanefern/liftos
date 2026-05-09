import { useUser } from "@/context/UserContext";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { GoldButton } from "@/components/GoldButton";
import { getLogsByDay, getMonthStats } from "@/lib/workoutStats";
import { CalendarDays, Dumbbell } from "lucide-react";
import { useMemo } from "react";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const buildMonthDays = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(year, month, i + 1);
    const weekdayIndex = (date.getDay() + 6) % 7; // Mon=0
    return { day: i + 1, weekday: WEEKDAYS[weekdayIndex], date };
  });
};

const Calander = () => {
  const { profile } = useUser();
  const { logs } = useWorkoutLogs();
  const monthDays = useMemo(() => buildMonthDays(), []);
  const units = profile?.units ?? "lb";

  const now = new Date();
  const monthName = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const logsByDay = useMemo(() => getLogsByDay(logs), [logs]);
  const monthStats = useMemo(() => getMonthStats(logs), [logs]);

  const getDayLogs = (date: Date) => {
    const key = new Date(date);
    key.setHours(0, 0, 0, 0);
    return logsByDay[key.getTime()] ?? [];
  };

  return (
    <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(110,231,183,0.06),transparent_60%)]" />

      <div className="relative mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between animate-reveal-up">
        <div>
          <p className="label-xs mb-2">Performance Ledger</p>
          <h1 className="heading-lg">Calendar</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/50">
            A month-view training ledger. Each day fills in as you log workouts — volume, duration, and whether you beat your plan.
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3">
          <CalendarDays size={17} className="text-emerald-300" />
          <div>
            <p className="text-sm font-semibold">{monthName}</p>
            <p className="text-xs text-foreground/30">
              {monthStats.count > 0 ? `${monthStats.count} session${monthStats.count === 1 ? "" : "s"} logged` : profile?.frequency ? `${profile.frequency} target` : "No workouts yet"}
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <section className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[
          { label: "Month Volume", value: monthStats.volume > 0 ? `${(monthStats.volume / 1000).toFixed(1)}k ${units}` : "–" },
          { label: "Active Days", value: monthStats.count > 0 ? String(monthStats.count) : "–" },
          { label: "Avg Session", value: monthStats.avgSets > 0 ? `${monthStats.avgSets} sets` : "–" },
          { label: "Hit Rate", value: "–" },
        ].map((item, i) => (
          <article
            key={item.label}
            className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-4 md:p-5 animate-reveal-up"
            style={{ animationDelay: `${i * 60 + 80}ms` }}
          >
            <div className="pointer-events-none absolute inset-x-[10%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,231,183,0.14),transparent)]" />
            <p className="mb-4 text-xs uppercase tracking-widest text-foreground/30">{item.label}</p>
            <p className={`mono text-2xl font-semibold ${item.value !== "–" ? "" : "text-foreground/20"}`}>{item.value}</p>
            <p className="mt-2 text-xs text-foreground/20">{item.value !== "–" ? "This month" : "No data yet"}</p>
          </article>
        ))}
      </section>

      {/* Calendar grid */}
      <section className="mb-8 relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-5 md:p-6 animate-reveal-up">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,231,183,0.16),transparent)]" />
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="label-xs mb-2">Monthly Grid</p>
            <h2 className="heading-md">Training days at a glance</h2>
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-foreground/50">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/8 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-300/80" />Trained
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/8 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-white/20" />Rest / off
            </span>
          </div>
        </div>

        <div className="mb-3 hidden grid-cols-7 gap-3 text-[11px] uppercase tracking-widest text-foreground/30 md:grid">
          {WEEKDAYS.map((d) => <span key={d} className="px-1">{d}</span>)}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-7">
          {monthDays.map((day) => {
            const dayLogs = getDayLogs(day.date);
            const hasSessions = dayLogs.length > 0;
            const totalVol = dayLogs.reduce((s, l) => s + l.total_volume, 0);

            return (
              <article
                key={day.day}
                className={`min-h-[132px] rounded-[1rem] border p-3 transition-colors ${
                  hasSessions
                    ? "border-emerald-300/20 bg-emerald-300/[0.04]"
                    : "border-white/[0.06] bg-white/[0.02]"
                }`}
              >
                <div className="mb-4 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-foreground/30 md:hidden">{day.weekday}</p>
                    <p className={`mt-1 text-base font-semibold ${hasSessions ? "text-emerald-300" : ""}`}>{day.day}</p>
                  </div>
                  {hasSessions && (
                    <span className="h-2 w-2 rounded-full bg-emerald-300/80 mt-2" />
                  )}
                </div>
                <div className="space-y-1.5">
                  {hasSessions ? (
                    <>
                      <p className="mono text-sm font-semibold text-emerald-300/80">
                        {totalVol > 0 ? `${(totalVol / 1000).toFixed(1)}k ${units}` : `${dayLogs[0].completed_sets} sets`}
                      </p>
                      <p className="text-[11px] text-foreground/40 truncate">{dayLogs[0].name}</p>
                      {dayLogs.length > 1 && (
                        <p className="text-[10px] text-foreground/30">+{dayLogs.length - 1} more</p>
                      )}
                    </>
                  ) : (
                    <>
                      <p className="mono text-lg font-semibold text-foreground/20">–</p>
                      <p className="text-[11px] text-foreground/20">No session logged</p>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* CTA — only when no data */}
      {monthStats.count === 0 && (
        <section className="relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-5 md:p-6 animate-reveal-up">
          <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] border border-emerald-300/20 bg-emerald-300/[0.07]">
              <CalendarDays size={20} className="text-emerald-300/60" />
            </div>
            <div>
              <h2 className="heading-md mb-2">Your ledger starts here</h2>
              <p className="max-w-sm text-sm leading-relaxed text-foreground/40">
                Every workout you log will fill in this calendar with volume, duration, and plan adherence. Start building your record.
              </p>
            </div>
            <GoldButton to="/workouts" className="mt-2">
              <Dumbbell size={15} />
              Log your first workout
            </GoldButton>
          </div>
        </section>
      )}
    </div>
  );
};

export default Calander;
