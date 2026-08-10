/* Dot-matrix progress meter — a warm card with a single row of small
   circles, terracotta-filled for the completed fraction. Pure display:
   value/target arrive precomputed (see getWeeklyVolumeTarget). */

const DOTS = 22;

type Props = {
  value: number;
  target: number;
  /** Eyebrow label, rendered uppercase ("Weekly volume"). */
  label: string;
  /** Display unit for the value readout ("lb" | "kg"). */
  unit: string;
};

export const DotMatrixMeter = ({ value, target, label, unit }: Props) => {
  const filled =
    target > 0 ? Math.min(DOTS, Math.max(0, Math.round((value / target) * DOTS))) : 0;

  return (
    <section
      aria-label={`${label}: ${Math.round(value).toLocaleString()} of ${Math.round(
        target,
      ).toLocaleString()} ${unit}`}
      className="rounded-[14px] bg-card px-4 py-3 shadow-[0_4px_12px_rgba(60,36,18,0.10)] dark:shadow-[0_4px_14px_rgba(0,0,0,0.35)]"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
          {label}
        </p>
        <p className="text-xs tabular-nums">
          <span className="font-bold text-fg">{Math.round(value).toLocaleString()}</span>
          <span className="text-fg-muted">
            /{Math.round(target).toLocaleString()} {unit}
          </span>
        </p>
      </div>
      {/* max-w keeps the dots circular at desktop card widths; justify-between
          re-spreads the capped dots across the full row. */}
      <div aria-hidden className="mt-2.5 flex justify-between gap-1">
        {Array.from({ length: DOTS }, (_, i) => (
          <span
            key={i}
            className={`aspect-square max-h-[9px] max-w-[9px] flex-1 rounded-full ${
              i < filled ? "bg-primary" : "bg-secondary"
            }`}
          />
        ))}
      </div>
    </section>
  );
};
