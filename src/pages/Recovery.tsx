import CountUp from "@/components/CountUp";
import { Moon, Droplets, Heart, Battery } from "lucide-react";

const metrics = [
  { icon: Moon, label: "Sleep", value: "7h 42m", sub: "92% quality" },
  { icon: Heart, label: "HRV", value: "68 ms", sub: "↑ 4 vs avg" },
  { icon: Droplets, label: "Hydration", value: "2.8 L", sub: "Target: 3.2 L" },
  { icon: Battery, label: "Readiness", value: "High", sub: "Ready to train" },
];

const recoveryTips = [
  "Your HRV is trending up — good adaptation. Consider a moderate session today.",
  "Sleep quality was strong. Deep sleep: 1h 48m (above average).",
  "Resting heart rate: 52 bpm, consistent with your 30-day average.",
];

const Recovery = () => (
  <div className="min-h-screen p-6 md:p-10 lg:p-12 max-w-5xl">
    <div className="mb-10 animate-reveal-up">
      <p className="label-xs mb-2">Wellness</p>
      <h1 className="heading-lg">Recovery</h1>
    </div>

    {/* Readiness hero */}
    <div className="rounded-2xl gradient-surface p-8 md:p-10 border border-border/30 glow-gold mb-12 animate-reveal-up" style={{ animationDelay: "100ms" }}>
      <div className="flex items-center gap-2 mb-4">
        <Battery size={16} className="text-gold" />
        <span className="label-xs !text-gold">Recovery Score</span>
      </div>
      <div className="text-6xl md:text-7xl font-semibold tracking-tighter">
        <CountUp end={88} className="text-foreground" />
        <span className="text-[hsl(var(--text-tertiary))] text-3xl ml-1">/ 100</span>
      </div>
      <p className="text-sm text-[hsl(var(--text-secondary))] mt-3">Your body is well recovered. Green light for intensity.</p>
    </div>

    {/* Metric cards */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
      {metrics.map((m, i) => (
        <div
          key={m.label}
          className="rounded-xl surface-2 p-5 border border-border/20 glow-gold-hover animate-reveal-up"
          style={{ animationDelay: `${i * 80 + 200}ms` }}
        >
          <m.icon size={15} className="text-[hsl(var(--text-tertiary))] mb-3" />
          <p className="text-lg font-semibold tracking-tight">{m.value}</p>
          <p className="text-xs text-[hsl(var(--text-tertiary))] mt-0.5">{m.label}</p>
          <p className="text-xs text-[hsl(var(--text-secondary))] mt-1">{m.sub}</p>
        </div>
      ))}
    </div>

    {/* Insights */}
    <div className="animate-reveal-up" style={{ animationDelay: "400ms" }}>
      <p className="label-xs mb-4">Insights</p>
      <div className="space-y-3">
        {recoveryTips.map((tip, i) => (
          <div key={i} className="rounded-xl surface-2 border border-border/20 p-4 text-sm text-[hsl(var(--text-secondary))] leading-relaxed">
            {tip}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default Recovery;
