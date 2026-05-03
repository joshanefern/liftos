import { CalendarDays, Clock3, Flame, Target, TrendingUp } from "lucide-react";

type CalanderDay = {
  day: number;
  weekday: string;
  volume: number;
  targetDelta: number;
  sessions: number;
  duration: number;
  readiness: "High" | "Steady" | "Low";
};

const monthDays: CalanderDay[] = [
  { day: 1, weekday: "Mon", volume: 0, targetDelta: 0, sessions: 0, duration: 0, readiness: "Low" },
  { day: 2, weekday: "Tue", volume: 6840, targetDelta: 740, sessions: 1, duration: 54, readiness: "High" },
  { day: 3, weekday: "Wed", volume: 0, targetDelta: -200, sessions: 0, duration: 0, readiness: "Steady" },
  { day: 4, weekday: "Thu", volume: 8120, targetDelta: 1180, sessions: 1, duration: 62, readiness: "High" },
  { day: 5, weekday: "Fri", volume: 4920, targetDelta: -320, sessions: 1, duration: 41, readiness: "Steady" },
  { day: 6, weekday: "Sat", volume: 0, targetDelta: 0, sessions: 0, duration: 0, readiness: "Low" },
  { day: 7, weekday: "Sun", volume: 0, targetDelta: 0, sessions: 0, duration: 0, readiness: "Low" },
  { day: 8, weekday: "Mon", volume: 7560, targetDelta: 930, sessions: 1, duration: 57, readiness: "High" },
  { day: 9, weekday: "Tue", volume: 0, targetDelta: -180, sessions: 0, duration: 0, readiness: "Steady" },
  { day: 10, weekday: "Wed", volume: 9340, targetDelta: 1440, sessions: 1, duration: 68, readiness: "High" },
  { day: 11, weekday: "Thu", volume: 5280, targetDelta: -120, sessions: 1, duration: 43, readiness: "Steady" },
  { day: 12, weekday: "Fri", volume: 0, targetDelta: 0, sessions: 0, duration: 0, readiness: "Low" },
  { day: 13, weekday: "Sat", volume: 4320, targetDelta: -480, sessions: 1, duration: 38, readiness: "Low" },
  { day: 14, weekday: "Sun", volume: 0, targetDelta: 0, sessions: 0, duration: 0, readiness: "Low" },
  { day: 15, weekday: "Mon", volume: 10120, targetDelta: 1680, sessions: 1, duration: 72, readiness: "High" },
  { day: 16, weekday: "Tue", volume: 0, targetDelta: -150, sessions: 0, duration: 0, readiness: "Steady" },
  { day: 17, weekday: "Wed", volume: 7640, targetDelta: 860, sessions: 1, duration: 55, readiness: "High" },
  { day: 18, weekday: "Thu", volume: 6980, targetDelta: 320, sessions: 1, duration: 49, readiness: "Steady" },
  { day: 19, weekday: "Fri", volume: 0, targetDelta: 0, sessions: 0, duration: 0, readiness: "Low" },
  { day: 20, weekday: "Sat", volume: 3720, targetDelta: -820, sessions: 1, duration: 34, readiness: "Low" },
  { day: 21, weekday: "Sun", volume: 0, targetDelta: 0, sessions: 0, duration: 0, readiness: "Low" },
  { day: 22, weekday: "Mon", volume: 9480, targetDelta: 1320, sessions: 1, duration: 66, readiness: "High" },
  { day: 23, weekday: "Tue", volume: 0, targetDelta: -160, sessions: 0, duration: 0, readiness: "Steady" },
  { day: 24, weekday: "Wed", volume: 8240, targetDelta: 1010, sessions: 1, duration: 58, readiness: "High" },
  { day: 25, weekday: "Thu", volume: 5880, targetDelta: -90, sessions: 1, duration: 46, readiness: "Steady" },
  { day: 26, weekday: "Fri", volume: 0, targetDelta: 0, sessions: 0, duration: 0, readiness: "Low" },
  { day: 27, weekday: "Sat", volume: 4670, targetDelta: -540, sessions: 1, duration: 36, readiness: "Low" },
  { day: 28, weekday: "Sun", volume: 0, targetDelta: 0, sessions: 0, duration: 0, readiness: "Low" },
  { day: 29, weekday: "Mon", volume: 8900, targetDelta: 1240, sessions: 1, duration: 61, readiness: "High" },
  { day: 30, weekday: "Tue", volume: 0, targetDelta: -120, sessions: 0, duration: 0, readiness: "Steady" },
];

const statCards = [
  { label: "Month Volume", value: "101.9k lb", helper: "+8.4% vs plan", icon: Flame },
  { label: "Green Days", value: "14", helper: "Target beat days", icon: TrendingUp },
  { label: "Avg Session", value: "53 min", helper: "Across logged days", icon: Clock3 },
  { label: "Hit Rate", value: "82%", helper: "Plan adherence", icon: Target },
];

const weekdayHeaders = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const getTileTone = (day: CalanderDay) => {
  if (day.sessions === 0) return "border-white/[0.06] bg-white/[0.02]";
  if (day.targetDelta >= 800) return "border-emerald-300/25 bg-emerald-300/[0.07]";
  if (day.targetDelta >= 0) return "border-gold/25 bg-gold/10";
  return "border-white/8 bg-white/[0.03]";
};

const Calander = () => (
  <div className="relative min-h-screen max-w-7xl p-6 md:p-10 lg:p-12">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(110,231,183,0.06),transparent_60%)]" />

    <div className="relative mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between animate-reveal-up">
      <div>
        <p className="label-xs mb-2">Performance Ledger</p>
        <h1 className="heading-lg">Calendar</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/50">
          A month-view training ledger built for fast scanning. Read each day like a fitness PnL tile: volume, lift
          quality, and whether you beat the plan.
        </p>
      </div>
      <div className="flex items-center gap-3 rounded-[1rem] border border-white/10 bg-white/[0.04] px-4 py-3">
        <CalendarDays size={17} className="text-emerald-300" />
        <div>
          <p className="text-sm font-semibold">April 2026</p>
          <p className="text-xs text-foreground/30">22 planned training days</p>
        </div>
      </div>
    </div>

    <section className="mb-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
      {statCards.map((stat, index) => (
        <article
          key={stat.label}
          className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-4 md:p-5 animate-reveal-up"
          style={{ animationDelay: `${index * 60 + 80}ms` }}
        >
          <div className="pointer-events-none absolute inset-x-[10%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,231,183,0.14),transparent)]" />
          <div className="mb-4 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-foreground/30">{stat.label}</span>
            <stat.icon size={16} className="text-emerald-300" />
          </div>
          <p className="mono text-2xl font-semibold">{stat.value}</p>
          <p className="mt-2 text-xs text-foreground/50">{stat.helper}</p>
        </article>
      ))}
    </section>

    <section className="mb-8 relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-5 md:p-6 animate-reveal-up">
      <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,231,183,0.16),transparent)]" />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="label-xs mb-2">Monthly Grid</p>
          <h2 className="heading-md">Training days at a glance</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-foreground/50">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/8 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-300/80" />
            Beat plan
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/8 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-gold/80" />
            On plan
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/8 px-3 py-1.5">
            <span className="h-2 w-2 rounded-full bg-white/20" />
            Rest / miss
          </span>
        </div>
      </div>

      <div className="mb-3 hidden grid-cols-7 gap-3 text-[11px] uppercase tracking-widest text-foreground/30 md:grid">
        {weekdayHeaders.map((weekday) => (
          <span key={weekday} className="px-1">
            {weekday}
          </span>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-7">
        {monthDays.map((day) => (
          <article
            key={day.day}
            className={`min-h-[132px] rounded-[1rem] border p-3 transition-colors ${getTileTone(day)}`}
          >
            <div className="mb-4 flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] uppercase tracking-widest text-foreground/30 md:hidden">{day.weekday}</p>
                <p className="mt-1 text-base font-semibold">{day.day}</p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                  day.targetDelta > 0
                    ? "bg-emerald-300/15 text-emerald-300"
                    : day.targetDelta < 0
                      ? "bg-white/[0.05] text-foreground/50"
                      : "bg-white/[0.04] text-foreground/30"
                }`}
              >
                {day.targetDelta > 0 ? "+" : ""}
                {day.targetDelta.toLocaleString()}
              </span>
            </div>

            <div className="space-y-1.5">
              <p className={`mono text-lg font-semibold ${day.sessions ? "text-foreground" : "text-foreground/30"}`}>
                {day.sessions ? `${(day.volume / 1000).toFixed(1)}k` : "--"}
              </p>
              <p className="text-[11px] text-foreground/30">
                {day.sessions ? `${day.sessions} session${day.sessions > 1 ? "s" : ""} • ${day.duration} min` : "Recovery / off day"}
              </p>
              <p className="text-[11px] text-foreground/50">{day.readiness} readiness</p>
            </div>
          </article>
        ))}
      </div>
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] animate-reveal-up">
      <div className="relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-5 md:p-6">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,231,183,0.14),transparent)]" />
        <p className="label-xs mb-2">Best Streak</p>
        <h2 className="heading-md">Four green sessions in a row</h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-foreground/50">
          Your cleanest stretch came from April 15 to April 18, where volume stayed above plan without pushing session
          duration too far.
        </p>
        <div className="mt-6 space-y-3">
          {[
            ["Top day", "Apr 15", "10.1k lb"],
            ["Sharpest session", "Apr 24", "+1,010 vs target"],
            ["Most efficient", "Apr 11", "41 min / 5.3k lb"],
          ].map(([label, date, value]) => (
            <div key={label} className="flex items-center justify-between rounded-[1rem] border border-white/8 bg-white/[0.02] px-4 py-3 text-sm">
              <div>
                <p className="font-semibold">{label}</p>
                <p className="mt-1 text-xs text-foreground/30">{date}</p>
              </div>
              <span className="mono font-semibold text-emerald-300">{value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[1.25rem] border border-white/10 bg-white/[0.04] p-5 md:p-6">
        <div className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(110,231,183,0.14),transparent)]" />
        <p className="label-xs mb-2">Read</p>
        <h2 className="heading-md">What the month is saying</h2>
        <div className="mt-4 space-y-4 text-sm leading-relaxed text-foreground/50">
          <p>
            The calendar is strongest when Monday and Wednesday are both green. That is where your best volume carries
            into the rest of the week.
          </p>
          <p>
            Weekend sessions are usually lighter and shorter. That is fine, but your bigger wins still come from
            keeping the midweek lifts intact.
          </p>
          <p>
            If you want this page to feel even more like a trading calendar, the next move would be adding month tabs
            and click-through day drilldowns.
          </p>
        </div>
      </div>
    </section>
  </div>
);

export default Calander;
