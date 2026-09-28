import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** 0-based position among working sets; unused for warm-ups. */
  idx: number;
  isWarmup?: boolean;
  /** "8 × 135 lb" — from lib/sessionFocus setSummary. */
  summary: string;
  /** Re-open the row: its cells come back, and it can be marked not done. */
  onOpen: () => void;
};

/**
 * A logged set, folded to one line. The whole row is the control — tapping
 * it re-opens the set, so nothing that was logged is ever locked.
 * Column widths match SetInputRow's grid so numbers line up down the card.
 */
export const CompletedSetRow = ({ idx, isWarmup = false, summary, onOpen }: Props) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label={`${isWarmup ? "Warm-up set" : `Set ${idx + 1}`}, ${summary}, done. Edit`}
    className="-mx-1 grid min-h-11 w-[calc(100%+0.5rem)] grid-cols-[28px_minmax(0,1fr)_36px] items-center gap-2 rounded-[0.875rem] px-1 text-left transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
  >
    {isWarmup ? (
      <span
        title="Warm-up set"
        className="mx-auto inline-flex h-5 w-5 items-center justify-center rounded-full border border-border text-[9px] font-semibold uppercase text-fg-faint"
      >
        W
      </span>
    ) : (
      <span className="text-center text-xs font-semibold tabular-nums text-primary">{idx + 1}</span>
    )}
    <span
      className={cn(
        "stat-scoreboard min-w-0 break-words pl-1 text-[18px] leading-tight",
        isWarmup ? "text-fg-muted" : "text-fg-soft",
      )}
    >
      {summary}
    </span>
    <span
      aria-hidden
      className={cn(
        "mx-auto inline-flex h-6 w-6 items-center justify-center rounded-full",
        isWarmup
          ? "border border-foreground/50 bg-foreground/[0.08] text-fg-soft"
          : "bg-primary text-primary-foreground",
      )}
    >
      <Check size={13} strokeWidth={2.6} />
    </span>
  </button>
);
