import CountUp from "@/components/CountUp";
import { LucideIcon } from "lucide-react";

type MetricCardProps = {
  icon: LucideIcon;
  label: string;
  value: number;
  suffix?: string;
  helper?: string;
  decimals?: number;
  delay?: number;
};

const MetricCard = ({ icon: Icon, label, value, suffix = "", helper, decimals = 0, delay = 0 }: MetricCardProps) => (
  <div
    className="rounded-xl surface-2 p-5 border border-border/20 animate-reveal-up"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="mb-4 flex items-center justify-between gap-3">
      <Icon size={16} className="text-gold" />
      {helper && <span className="text-xs text-[hsl(var(--text-tertiary))]">{helper}</span>}
    </div>
    <p className="text-2xl font-semibold tracking-tight mono">
      <CountUp end={value} decimals={decimals} suffix={suffix} />
    </p>
    <p className="mt-1 text-xs text-[hsl(var(--text-tertiary))]">{label}</p>
  </div>
);

export default MetricCard;
