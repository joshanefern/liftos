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
    className="relative overflow-hidden rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 animate-reveal-up"
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="pointer-events-none absolute inset-x-[12%] top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent)]" />
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="flex h-8 w-8 items-center justify-center rounded-[0.75rem] border border-gold/20 bg-gold/10">
        <Icon size={15} className="text-gold" />
      </div>
      {helper && <span className="text-xs text-foreground/30">{helper}</span>}
    </div>
    <p className="text-2xl font-semibold tracking-tight mono">
      <CountUp end={value} decimals={decimals} suffix={suffix} />
    </p>
    <p className="mt-1 text-xs text-foreground/30">{label}</p>
  </div>
);

export default MetricCard;
