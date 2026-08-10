import { HoldStepper, roundToStep } from "@/components/logging/HoldStepper";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { forwardRef, type KeyboardEvent, type MouseEvent } from "react";

/**
 * Shared set-entry row used by both the session-review screen and the live
 * workout logger:
 *
 *   - tap-to-fill inputs — an empty input shows its hint as placeholder and a
 *     single tap commits it (then selects, so typing overwrites)
 *   - Enter-key focus auto-advance: reps → weight → done-toggle (weight-Enter
 *     marks done; the parent decides whether to move focus to the next set)
 *   - press-and-hold accelerating weight steppers (5 lb / 2.5 kg per tap,
 *     doubled step on auto-repeat while held)
 */

export const sanitizeReps = (raw: string): string => raw.replace(/\D/g, "");

export const sanitizeWeight = (raw: string): string => {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${whole}.${rest.join("")}` : whole;
};

export const formatWeightForDisplay = (n: number): string => {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace(/\.0$/, "");
};

export type SetInputRowProps = {
  idx: number;
  showLabels: boolean;
  reps: string;
  weight: string;
  done: boolean;
  unitsLabel: string;
  repsHint: number | null;
  weightHint: number | null;
  isMetric: boolean;
  /** Renders the quiet warm-up variant: W chip, muted values, no terracotta. */
  isWarmup?: boolean;
  registerRepsRef: (el: HTMLInputElement | null) => void;
  registerWeightRef: (el: HTMLInputElement | null) => void;
  registerDoneRef?: (el: HTMLButtonElement | null) => void;
  onRepsChange: (v: string) => void;
  onWeightChange: (v: string) => void;
  onRepsEnter: () => void;
  onDoneTap: () => void;
  /**
   * Optional override for Enter pressed in the weight field. Defaults to
   * onDoneTap — pass a distinct handler when keyboard-driven completion
   * should also advance focus while a thumb tap should not.
   */
  onWeightEnter?: () => void;
  /**
   * When provided, tapping an unfocused weight VALUE (> 0) fires this instead
   * of focusing the input — the logger opens plate math here. Empty fields
   * keep tap-to-fill, and a focused input keeps normal caret taps, so the
   * typing path (tap-to-fill → select → overwrite) survives.
   */
  onWeightValueTap?: (weight: number) => void;
};

export const SetInputRow = ({
  idx,
  showLabels,
  reps,
  weight,
  done,
  unitsLabel,
  repsHint,
  weightHint,
  isMetric,
  isWarmup = false,
  registerRepsRef,
  registerWeightRef,
  registerDoneRef,
  onRepsChange,
  onWeightChange,
  onRepsEnter,
  onDoneTap,
  onWeightEnter,
  onWeightValueTap,
}: SetInputRowProps) => {
  const repsEmpty = reps === "";
  const weightEmpty = weight === "";

  const handleRepsClick = (e: MouseEvent<HTMLInputElement>) => {
    if (repsEmpty && repsHint !== null) {
      onRepsChange(String(repsHint));
      const el = e.currentTarget;
      requestAnimationFrame(() => el?.select());
    }
  };
  const handleWeightClick = (e: MouseEvent<HTMLInputElement>) => {
    if (weightEmpty && weightHint !== null) {
      onWeightChange(String(weightHint));
      const el = e.currentTarget;
      requestAnimationFrame(() => el?.select());
    }
  };

  /** Mousedown (fires before focus) so plate math opens without popping the
      keyboard. Only intercepts a filled, unfocused value — see prop docs. */
  const handleWeightMouseDown = (e: MouseEvent<HTMLInputElement>) => {
    if (!onWeightValueTap || weightEmpty) return;
    if (document.activeElement === e.currentTarget) return;
    const parsed = parseFloat(weight);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    e.preventDefault();
    onWeightValueTap(parsed);
  };

  const handleRepsKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onRepsEnter();
    }
  };
  const handleWeightKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (onWeightEnter ?? onDoneTap)();
    }
    // Tab falls through to default browser handling — Done button is next in
    // DOM order so focus naturally lands there.
  };

  const handleStep = (delta: number) => {
    const curr = weight === "" ? (weightHint ?? 0) : parseFloat(weight);
    const base = Number.isFinite(curr) ? curr : 0;
    const step = Math.abs(delta);
    const next = Math.max(0, roundToStep(base + delta, step));
    onWeightChange(formatWeightForDisplay(next));
  };

  return (
    <div className="space-y-1">
      {showLabels && (
        <div className="grid grid-cols-[28px_minmax(0,0.8fr)_minmax(0,1.6fr)_36px] items-end gap-2 px-1 text-[10px] uppercase tracking-widest text-fg-muted">
          <span>Set</span>
          <span>Reps</span>
          <span>Weight</span>
          <span />
        </div>
      )}
      <div
        className={cn(
          "grid grid-cols-[28px_minmax(0,0.8fr)_minmax(0,1.6fr)_36px] items-center gap-2 rounded-[0.875rem] py-0.5 transition",
          done && (isWarmup ? "bg-secondary/60" : "bg-primary/[0.06]"),
        )}
      >
        {isWarmup ? (
          <span
            title="Warm-up set"
            className="mx-auto inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[9px] font-semibold uppercase text-fg-faint"
          >
            W
          </span>
        ) : (
          <span className={cn("text-center text-xs", done ? "text-primary" : "text-fg-muted")}>
            {idx + 1}
          </span>
        )}

        {/* Reps */}
        <NumericInput
          ref={registerRepsRef}
          value={reps}
          hint={repsHint}
          onChange={(v) => onRepsChange(sanitizeReps(v))}
          onClickEmpty={handleRepsClick}
          onKeyDown={handleRepsKey}
          inputMode="numeric"
          pattern="[0-9]*"
          ariaLabel={isWarmup ? "Warm-up set reps" : `Set ${idx + 1} reps`}
          align="center"
          muted={isWarmup}
        />

        {/* Weight cluster: [-] [value lb] [+] */}
        <div className="flex h-11 items-center gap-1 rounded-[0.875rem] bg-secondary px-1">
          <HoldStepper direction="down" isMetric={isMetric} onStep={handleStep} ariaLabel="Decrease weight" />
          <NumericInput
            ref={registerWeightRef}
            value={weight}
            hint={weightHint}
            onChange={(v) => onWeightChange(sanitizeWeight(v))}
            onClickEmpty={handleWeightClick}
            onMouseDown={handleWeightMouseDown}
            onKeyDown={handleWeightKey}
            inputMode="decimal"
            ariaLabel={isWarmup ? "Warm-up set weight" : `Set ${idx + 1} weight`}
            align="center"
            suffix={unitsLabel}
            transparent
            muted={isWarmup}
          />
          <HoldStepper direction="up" isMetric={isMetric} onStep={handleStep} ariaLabel="Increase weight" />
        </div>

        {/* Done toggle — warm-ups complete in quiet ink, never terracotta */}
        <button
          ref={registerDoneRef}
          type="button"
          onClick={onDoneTap}
          aria-label={done ? "Mark set incomplete" : "Mark set done"}
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition after:absolute after:-inset-1 after:content-[''] focus:outline-none focus:ring-2",
            done && isWarmup && "border-border bg-secondary text-fg-soft focus:ring-primary/30",
            done && !isWarmup && "border-primary bg-primary text-primary-foreground focus:ring-primary/40",
            !done &&
              (isWarmup
                ? "border-border bg-secondary text-fg-muted hover:text-fg-soft focus:ring-primary/30"
                : "border-border bg-secondary text-fg-muted hover:border-primary/50 hover:text-primary focus:ring-primary/30"),
          )}
        >
          <Check size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};

// ── NumericInput (inline placeholder + optional suffix) ─────────────────────

type NumericInputProps = {
  value: string;
  hint: number | null;
  onChange: (v: string) => void;
  onClickEmpty: (e: MouseEvent<HTMLInputElement>) => void;
  onMouseDown?: (e: MouseEvent<HTMLInputElement>) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputMode: "numeric" | "decimal";
  pattern?: string;
  ariaLabel: string;
  align: "center" | "left";
  suffix?: string;
  transparent?: boolean;
  /** Warm-up rows: value renders in the muted tier instead of full ink. */
  muted?: boolean;
};

const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  function NumericInput(
    {
      value,
      hint,
      onChange,
      onClickEmpty,
      onMouseDown,
      onKeyDown,
      inputMode,
      pattern,
      ariaLabel,
      align,
      suffix,
      transparent,
      muted,
    },
    ref,
  ) {
    const isEmpty = value === "";
    const placeholder = hint !== null ? formatWeightForDisplay(hint) : "—";
    return (
      <div
        className={cn(
          "relative flex h-11 min-w-0 flex-1 items-center",
          !transparent && "rounded-[0.875rem] bg-secondary",
          isEmpty && hint !== null && "group/hint",
        )}
      >
        <input
          ref={ref}
          type="text"
          inputMode={inputMode}
          pattern={pattern}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={isEmpty && hint !== null ? onClickEmpty : undefined}
          onMouseDown={onMouseDown}
          onKeyDown={onKeyDown}
          aria-label={ariaLabel}
          placeholder={placeholder}
          className={cn(
            "h-full w-full min-w-0 bg-transparent font-semibold tabular-nums outline-none placeholder:font-medium placeholder:text-fg-muted",
            muted && "font-medium text-fg-muted",
            align === "center" ? "text-center" : "px-3",
            suffix ? "pl-1 pr-6 text-[15px]" : "px-2 text-[15px]",
            "transition group-hover/hint:placeholder:text-primary/70 group-hover/hint:cursor-copy",
          )}
        />
        {suffix && (
          <span className="pointer-events-none absolute inset-y-0 right-1.5 flex items-center text-[10px] uppercase tracking-wider text-fg-muted">
            {suffix}
          </span>
        )}
      </div>
    );
  },
);
