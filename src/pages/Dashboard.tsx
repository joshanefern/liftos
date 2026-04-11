import CountUp from "@/components/CountUp";
import WeeklyChart from "@/components/WeeklyChart";
import RecentWorkouts from "@/components/RecentWorkouts";
import { Activity, Timer, Weight, Zap } from "lucide-react";

const miniStats = [
  { icon: Weight, label: "Volume", value: 12480, suffix: " kg", decimals: 0 },
  { icon: Timer, label: "Time", value: 4.2, suffix: " hrs", decimals: 1 },
  { icon: Zap, label: "Sessions", value: 5, suffix: "", decimals: 0 },
];

const Dashboard = () => {
  return (
    <div className="min-h-screen p-6 md:p-10 lg:p-12 max-w-5xl">
      {/* Header */}
      <div className="mb-12 animate-reveal-up">
        <p className="label-xs mb-2">Saturday, Mar 22</p>
        <h1 className="heading-lg">Good morning</h1>
      </div>

      {/* Hero metric */}
      <div className="mb-14 animate-reveal-up" style={{ animationDelay: "100ms" }}>
        <div className="relative rounded-2xl gradient-surface p-8 md:p-10 glow-gold border border-border/30">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Activity size={16} className="text-gold" />
                <span className="label-xs !text-gold">Strain Score</span>
              </div>
              <div className="heading-hero text-foreground">
                <CountUp end={84.7} decimals={1} className="text-foreground" />
              </div>
              <p className="text-sm text-[hsl(var(--text-secondary))] mt-3">
                <span className="text-gold">↑ 12%</span> vs last week
              </p>
            </div>

            {/* Ring indicator */}
            <div className="hidden md:block">
              <svg width="100" height="100" viewBox="0 0 100 100" className="animate-reveal-scale" style={{ animationDelay: "400ms" }}>
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke="hsl(var(--surface-3))"
                  strokeWidth="6"
                />
                <circle
                  cx="50" cy="50" r="42"
                  fill="none"
                  stroke="hsl(var(--gold))"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${0.847 * 2 * Math.PI * 42} ${2 * Math.PI * 42}`}
                  transform="rotate(-90 50 50)"
                  className="animate-draw-line"
                  style={{ filter: "drop-shadow(0 0 6px hsl(43 56% 52% / 0.3))" }}
                />
                <text
                  x="50" y="50"
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="hsl(var(--gold))"
                  fontSize="13"
                  fontWeight="600"
                  fontFamily="Inter"
                >
                  85%
                </text>
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-4 md:gap-6 mb-14">
        {miniStats.map((stat, i) => (
          <div
            key={stat.label}
            className="rounded-xl surface-2 p-5 border border-border/20 glow-gold-hover animate-reveal-up"
            style={{ animationDelay: `${i * 80 + 200}ms` }}
          >
            <stat.icon size={15} className="text-[hsl(var(--text-tertiary))] mb-3" />
            <p className="text-xl md:text-2xl font-semibold tracking-tight font-mono">
              <CountUp end={stat.value} decimals={stat.decimals} suffix={stat.suffix} />
            </p>
            <p className="text-xs text-[hsl(var(--text-tertiary))] mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl surface-2 p-6 md:p-8 border border-border/20 mb-14 animate-reveal-up" style={{ animationDelay: "300ms" }}>
        <WeeklyChart />
      </div>

      {/* Recent workouts */}
      <div className="animate-reveal-up" style={{ animationDelay: "350ms" }}>
        <RecentWorkouts />
      </div>
    </div>
  );
};

export default Dashboard;
