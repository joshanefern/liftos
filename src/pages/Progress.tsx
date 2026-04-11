import CountUp from "@/components/CountUp";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

const monthlyData = [
  { week: "W1", volume: 8200, sessions: 4 },
  { week: "W2", volume: 9100, sessions: 5 },
  { week: "W3", volume: 8800, sessions: 4 },
  { week: "W4", volume: 10200, sessions: 5 },
  { week: "W5", volume: 11400, sessions: 6 },
  { week: "W6", volume: 10800, sessions: 5 },
  { week: "W7", volume: 12100, sessions: 5 },
  { week: "W8", volume: 12480, sessions: 5 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="surface-2 rounded-lg px-3 py-2 border border-border/50 shadow-lg">
      <p className="text-xs text-[hsl(var(--text-tertiary))] mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gold">{payload[0].value.toLocaleString()} kg</p>
    </div>
  );
};

const prs = [
  { lift: "Bench Press", weight: "102.5 kg", date: "Mar 18" },
  { lift: "Squat", weight: "145 kg", date: "Mar 12" },
  { lift: "Deadlift", weight: "180 kg", date: "Mar 5" },
  { lift: "Overhead Press", weight: "67.5 kg", date: "Feb 28" },
];

const Progress = () => (
  <div className="min-h-screen p-6 md:p-10 lg:p-12 max-w-5xl">
    <div className="mb-10 animate-reveal-up">
      <p className="label-xs mb-2">Analytics</p>
      <h1 className="heading-lg">Progress</h1>
    </div>

    {/* Summary stats */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
      {[
        { label: "Total Volume", value: 92580, suffix: " kg" },
        { label: "Avg Session", value: 47, suffix: " min" },
        { label: "Best Streak", value: 18, suffix: " days" },
        { label: "PRs This Month", value: 4, suffix: "" },
      ].map((s, i) => (
        <div
          key={s.label}
          className="rounded-xl surface-2 p-5 border border-border/20 animate-reveal-up"
          style={{ animationDelay: `${i * 80 + 100}ms` }}
        >
          <p className="text-xl font-semibold tracking-tight font-mono">
            <CountUp end={s.value} suffix={s.suffix} />
          </p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">{s.label}</p>
        </div>
      ))}
    </div>

    {/* Volume chart */}
    <div className="rounded-xl surface-2 p-6 md:p-8 border border-border/20 mb-12 animate-reveal-up" style={{ animationDelay: "250ms" }}>
      <p className="label-xs mb-6">Volume Trend (8 Weeks)</p>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthlyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(43 56% 52%)" stopOpacity={0.2} />
                <stop offset="100%" stopColor="hsl(43 56% 52%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(0 0% 35%)" }} dy={8} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "hsl(0 0% 35%)" }} />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            <Area type="monotone" dataKey="volume" stroke="hsl(43 56% 52%)" strokeWidth={2} fill="url(#goldGrad)" dot={false}
              activeDot={{ r: 4, fill: "hsl(43 56% 52%)", stroke: "hsl(0 0% 6%)", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>

    {/* PRs */}
    <div className="animate-reveal-up" style={{ animationDelay: "300ms" }}>
      <p className="label-xs mb-4">Personal Records</p>
      <div className="space-y-2">
        {prs.map((pr, i) => (
          <div key={pr.lift} className="flex items-center justify-between rounded-xl surface-2 border border-border/20 p-4 animate-reveal-up" style={{ animationDelay: `${i * 60 + 350}ms` }}>
            <span className="text-sm font-medium">{pr.lift}</span>
            <div className="flex items-center gap-4">
              <span className="text-sm font-mono text-gold">{pr.weight}</span>
              <span className="text-xs text-[hsl(var(--text-tertiary))]">{pr.date}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default Progress;
