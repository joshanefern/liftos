import { DeferredInput } from "@/components/review/DeferredInput";
import { NameAutocomplete } from "@/components/review/NameAutocomplete";
import type { EditableCardioBlock } from "@/lib/review/buildEditable";
import {
  formatDistance,
  formatDurationMmSs,
  isMetricUnits,
  parseDistanceToMeters,
  parseDurationToSeconds,
} from "@/lib/review/inputFormatters";
import { cn } from "@/lib/utils";
import { Activity, Trash2, Watch } from "lucide-react";
import { useState } from "react";

type Props = {
  value: EditableCardioBlock;
  units: string;
  exerciseNameOptions: string[];
  /** Captured duration from Strava aggregates (seconds, canonical string). */
  capturedDurationSeconds?: string | null;
  onChange: (next: EditableCardioBlock) => void;
  onRemove: () => void;
};

const sanitizeInt = (raw: string, maxLen?: number): string => {
  const cleaned = raw.replace(/\D/g, "");
  return maxLen ? cleaned.slice(0, maxLen) : cleaned;
};

export const CardioBlock = ({
  value,
  units,
  exerciseNameOptions,
  capturedDurationSeconds,
  onChange,
  onRemove,
}: Props) => {
  const profileMetric = isMetricUnits(units);
  const [distanceOverride, setDistanceOverride] = useState<"mi" | "km" | null>(null);
  const displayMetric = distanceOverride === null ? profileMetric : distanceOverride === "km";
  const displayUnit: "mi" | "km" = displayMetric ? "km" : "mi";

  const setField = <K extends keyof EditableCardioBlock>(
    key: K,
    next: EditableCardioBlock[K],
  ): void => {
    onChange({ ...value, [key]: next });
  };

  const canApplyWatchDuration =
    capturedDurationSeconds != null &&
    capturedDurationSeconds !== "" &&
    capturedDurationSeconds !== value.duration_s;

  return (
    <article className="rule-hairline pt-3.5 animate-reveal-up">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.75rem] border border-border bg-secondary text-gold"
          >
            <Activity size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <NameAutocomplete
              value={value.name}
              options={exerciseNameOptions}
              placeholder="Outdoor run, treadmill, bike…"
              onChange={(name) => setField("name", name)}
            />
            <p className="caption mt-0.5">Cardio summary</p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove cardio block"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.75rem] border border-border text-fg-muted transition hover:border-destructive/40 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30"
        >
          <Trash2 size={14} />
        </button>
      </header>

      <div className="space-y-3">
        {/* Duration row */}
        <div>
          <FieldLabel>Duration</FieldLabel>
          <div className="flex items-stretch gap-2">
            <div className="flex h-11 min-w-0 flex-1 items-center rounded-lg border border-border px-3 transition focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
              <DeferredInput
                type="text"
                inputMode="numeric"
                placeholder="—"
                canonical={value.duration_s}
                format={formatDurationMmSs}
                parse={parseDurationToSeconds}
                onCommit={(v) => setField("duration_s", v)}
                className="h-full w-full bg-transparent text-[15px] font-semibold tabular-nums outline-none placeholder:font-medium placeholder:text-fg-faint"
              />
              <span className="ml-2 shrink-0 text-[11px] uppercase tracking-wider text-fg-faint">
                mm:ss
              </span>
            </div>
            {capturedDurationSeconds != null && capturedDurationSeconds !== "" && (
              <button
                type="button"
                onClick={() => setField("duration_s", capturedDurationSeconds)}
                disabled={!canApplyWatchDuration}
                className={cn(
                  "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition focus:outline-none focus:ring-2",
                  canApplyWatchDuration
                    ? "border-primary/40 text-gold hover:bg-primary/10 focus:ring-primary/40"
                    : "border-border text-fg-faint",
                )}
              >
                <Watch size={13} />
                From watch
              </button>
            )}
          </div>
        </div>

        {/* Distance row with mi/km toggle */}
        <div>
          <div className="mb-1.5 flex items-center justify-between px-1">
            <FieldLabel className="!mb-0">Distance</FieldLabel>
            <UnitTogglePill value={displayUnit} onChange={setDistanceOverride} />
          </div>
          <div className="flex h-11 items-center rounded-lg border border-border px-3 transition focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
            <DeferredInput
              // Force remount when unit toggles so the display reformats from
              // canonical meters using the new unit. DeferredInput buffers
              // text locally and otherwise wouldn't notice the format change.
              key={displayUnit}
              type="text"
              inputMode="decimal"
              placeholder="—"
              canonical={value.distance_m}
              format={(meters) => formatDistance(meters, displayMetric)}
              parse={(raw) => parseDistanceToMeters(raw, displayMetric)}
              onCommit={(v) => setField("distance_m", v)}
              className="h-full w-full bg-transparent text-[15px] font-semibold tabular-nums outline-none placeholder:font-medium placeholder:text-fg-faint"
            />
            <span className="ml-2 shrink-0 text-[11px] uppercase tracking-wider text-fg-faint">
              {displayUnit}
            </span>
          </div>
        </div>

        {/* HR + Calories side-by-side */}
        <div className="grid grid-cols-2 gap-3">
          <SmallField label="Avg HR" suffix="bpm">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={3}
              value={value.avg_hr}
              onChange={(e) => setField("avg_hr", sanitizeInt(e.target.value, 3))}
              placeholder="—"
              className="h-full w-full bg-transparent text-[15px] font-semibold tabular-nums outline-none placeholder:font-medium placeholder:text-fg-faint"
            />
          </SmallField>
          <SmallField label="Calories" suffix="kcal">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={value.calories}
              onChange={(e) => setField("calories", sanitizeInt(e.target.value))}
              placeholder="—"
              className="h-full w-full bg-transparent text-[15px] font-semibold tabular-nums outline-none placeholder:font-medium placeholder:text-fg-faint"
            />
          </SmallField>
        </div>
      </div>
    </article>
  );
};

const FieldLabel = ({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) => (
  <p className={cn("eyebrow mb-1.5 !text-[10px]", className)}>
    {children}
  </p>
);

const SmallField = ({
  label,
  suffix,
  children,
}: {
  label: string;
  suffix: string;
  children: React.ReactNode;
}) => (
  <div>
    <FieldLabel>{label}</FieldLabel>
    <div className="flex h-11 items-center rounded-lg border border-border px-3 transition focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20">
      {children}
      <span className="ml-2 shrink-0 text-[11px] uppercase tracking-wider text-fg-faint">
        {suffix}
      </span>
    </div>
  </div>
);

const UnitTogglePill = ({
  value,
  onChange,
}: {
  value: "mi" | "km";
  onChange: (v: "mi" | "km") => void;
}) => (
  <div className="inline-flex shrink-0 rounded-full border border-border bg-secondary p-0.5 text-[10px] font-medium uppercase tracking-widest">
    {(["mi", "km"] as const).map((u) => (
      <button
        key={u}
        type="button"
        onClick={() => onChange(u)}
        className={cn(
          "rounded-full px-2 py-0.5 transition",
          value === u ? "bg-primary/15 text-gold" : "text-fg-faint hover:text-fg-muted",
        )}
      >
        {u}
      </button>
    ))}
  </div>
);
