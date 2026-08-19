import { formatHoldInput, sanitizeHold } from "@/lib/exerciseTracking";
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
 *   - effort="time" swaps the reps column for a hold-duration field (planks,
 *     hangs, carries) — bare digits read as seconds ("90" → 1:30); the weight
 *     column stays for loaded holds and reads bodyweight when empty
 *
 *   Three cells and a check — no steppers, no chrome (owner's brief:
 *   minimal; plate math still opens from a filled weight value).
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
  /** "reps" (default) or "time" — which effort column this row shows. */
  effort?: "reps" | "time";
  /** Workout-mode register: larger condensed numerals, taller rows —
      arm's-length legibility on the black scoreboard. */
  scoreboard?: boolean;
  reps: string;
  weight: string;
  done: boolean;
  unitsLabel: string;
  repsHint: number | null;
  weightHint: number | null;
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
  effort = "reps",
  scoreboard = false,
  reps,
  weight,
  done,
  unitsLabel,
  repsHint,
  weightHint,
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
  const isTimed = effort === "time";
  const repsEmpty = reps === "";
  const weightEmpty = weight === "";
  // In time mode the "reps" channel carries the hold text — hints are seconds.
  const formatEffortHint = (n: number): string =>
    isTimed ? formatHoldInput(n) : String(n);
  const sanitizeEffort = isTimed ? sanitizeHold : sanitizeReps;

  const handleRepsClick = (e: MouseEvent<HTMLInputElement>) => {
    if (repsEmpty && repsHint !== null) {
      onRepsChange(formatEffortHint(repsHint));
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

  return (
    <div className="space-y-1">
      {showLabels && (
        <div className="grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.2fr)_36px] items-end gap-2 px-1 text-[10px] uppercase tracking-widest text-fg-muted">
          <span>Set</span>
          <span>{isTimed ? "Time" : "Reps"}</span>
          <span>Weight</span>
          <span />
        </div>
      )}
      <div
        className={cn(
          "grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1.2fr)_36px] items-center gap-2 rounded-[0.875rem] py-0.5 transition",
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
          <span className="text-center text-xs text-fg-muted">{idx + 1}</span>
        )}

        {/* Effort: reps, or hold time ("90" reads as seconds → 1:30) */}
        <NumericInput
          ref={registerRepsRef}
          scoreboard={scoreboard}
          value={reps}
          hint={repsHint}
          formatHint={formatEffortHint}
          onChange={(v) => onRepsChange(sanitizeEffort(v))}
          onClickEmpty={handleRepsClick}
          onKeyDown={handleRepsKey}
          inputMode="numeric"
          pattern={isTimed ? undefined : "[0-9]*"}
          ariaLabel={
            isWarmup
              ? `Warm-up set ${isTimed ? "time" : "reps"}`
              : `Set ${idx + 1} ${isTimed ? "time" : "reps"}`
          }
          align="center"
          muted={isWarmup}
        />

        {/* Weight — same quiet cell as the effort column */}
        <NumericInput
          ref={registerWeightRef}
          scoreboard={scoreboard}
          value={weight}
          hint={weightHint}
          emptyPlaceholder={isTimed ? "BW" : undefined}
          onChange={(v) => onWeightChange(sanitizeWeight(v))}
          onClickEmpty={handleWeightClick}
          onMouseDown={handleWeightMouseDown}
          onKeyDown={handleWeightKey}
          inputMode="decimal"
          ariaLabel={isWarmup ? "Warm-up set weight" : `Set ${idx + 1} weight`}
          align="center"
          suffix={unitsLabel}
          muted={isWarmup}
        />

        {/* Done toggle — warm-ups complete in quiet ink, never terracotta */}
        <button
          ref={registerDoneRef}
          type="button"
          onClick={onDoneTap}
          aria-label={done ? "Mark set incomplete" : "Mark set done"}
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-full border transition after:absolute after:-inset-1 after:content-[''] focus:outline-none focus:ring-2",
            done && isWarmup && "border-border bg-secondary text-fg-soft focus:ring-primary/30",
            done && !isWarmup && "check-pop border-primary bg-primary text-primary-foreground focus:ring-primary/40",
            !done &&
              (isWarmup
                ? "border-border bg-secondary text-fg-muted hover:text-fg-soft focus:ring-primary/30"
                : "border-border bg-secondary text-fg-muted hover:border-primary/50 hover:text-primary focus:ring-primary/30"),
          )}
        >
          {/* keyed remount replays the 200ms draw each completion */}
          <Check
            key={done ? "done" : "todo"}
            size={14}
            strokeWidth={2.5}
            className={done && !isWarmup ? "check-draw" : undefined}
          />
        </button>
      </div>
    </div>
  );
};

// ── NumericInput (inline placeholder + optional suffix) ─────────────────────

type NumericInputProps = {
  scoreboard?: boolean;
  value: string;
  hint: number | null;
  /** How to render the hint as placeholder text (default: weight formatting). */
  formatHint?: (n: number) => string;
  /** Placeholder when there is no hint at all (default "—"; "BW" for hold weights). */
  emptyPlaceholder?: string;
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
      scoreboard,
      value,
      hint,
      formatHint,
      emptyPlaceholder,
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
    const placeholder =
      hint !== null
        ? (formatHint ?? formatWeightForDisplay)(hint)
        : (emptyPlaceholder ?? "—");
    return (
      <div
        className={cn(
          scoreboard ? "relative flex h-12 min-w-0 flex-1 items-center" : "relative flex h-11 min-w-0 flex-1 items-center",
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
            scoreboard
              ? suffix
                ? "stat-scoreboard pl-1 pr-6 text-[22px]"
                : "stat-scoreboard px-2 text-[22px]"
              : suffix
                ? "pl-1 pr-6 text-[15px]"
                : "px-2 text-[15px]",
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
