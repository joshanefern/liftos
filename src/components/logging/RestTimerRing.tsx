import { cn } from "@/lib/utils";

const formatMmSs = (seconds: number): string => {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

type Props = {
  /** Seconds left on the clock. */
  remaining: number;
  /** 0..1 fraction of the rest period still left. */
  progress: number;
  /** Outer diameter in px. */
  size?: number;
  strokeWidth?: number;
  /** Brief accent celebration when the rest period just finished. */
  pulse?: boolean;
  /** Ring only: the caller prints the countdown beside it, so the ring
      drops its own numerals and leaves the announcing to that text. */
  bare?: boolean;
  className?: string;
};

/**
 * Signature radial rest countdown: a flat terracotta ring that drains as the
 * rest period elapses, mm:ss in mono at the center. Pure SVG stroke-dashoffset
 * — no rAF loop; the parent's 250 ms state tick drives it.
 * Strokes are set via style (not attributes) so the theme tokens resolve.
 */
export const RestTimerRing = ({
  remaining,
  progress,
  size = 96,
  strokeWidth = 5,
  pulse = false,
  bare = false,
  className,
}: Props) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role={bare ? undefined : "timer"}
      aria-label={bare ? undefined : `Rest: ${formatMmSs(remaining)} remaining`}
      aria-hidden={bare ? true : undefined}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          style={{ stroke: "hsl(var(--border))" }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          style={{
            stroke: "hsl(var(--chart-line))",
            transition: "stroke-dashoffset 250ms linear",
          }}
        />
      </svg>
      {/* The ping scales to twice the ring — motion, so it is left out
          for a lifter who asked for less; the tint alone marks the end. */}
      {pulse && (
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-primary/20 motion-safe:animate-ping"
        />
      )}
      {!bare && (
        <span
          className={cn(
            "mono absolute inset-0 flex items-center justify-center font-semibold tabular-nums",
            size >= 80 ? "text-lg" : "text-[11px]",
            pulse ? "text-primary" : "text-fg",
          )}
        >
          {formatMmSs(remaining)}
        </span>
      )}
    </div>
  );
};
