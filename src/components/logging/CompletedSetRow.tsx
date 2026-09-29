import { Check } from "lucide-react";
import { unmarkLabel } from "@/lib/sessionFocus";
import { cn } from "@/lib/utils";

type Props = {
  /** 0-based position among working sets; unused for warm-ups. */
  idx: number;
  isWarmup?: boolean;
  /** "8 × 135 lb" — from lib/sessionFocus setSummary. */
  summary: string;
  /** The numbers were tapped: open this set's cells to fix them. */
  onOpen: () => void;
  /** The check was tapped: the set is not logged any more. */
  onUnmark: () => void;
};

/**
 * A logged set, folded to one line, as two controls. The numbers re-open
 * the set's cells (nothing logged is ever locked); the check un-marks it —
 * one tap, no confirm, numbers kept, the way a checkbox works.
 *
 * The check's hit area is 44px (after:) inside the row's own 44px, so the
 * row is no taller than a plain line. Column widths match SetInputRow's
 * grid so numbers and checks line up down the card.
 */
export const CompletedSetRow = ({ idx, isWarmup = false, summary, onOpen, onUnmark }: Props) => (
  <div className="-mx-1 grid min-h-11 w-[calc(100%+0.5rem)] grid-cols-[28px_minmax(0,1fr)_36px] items-center gap-2 px-1">
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${isWarmup ? "Warm-up set" : `Set ${idx + 1}`}, ${summary}. Edit`}
      className="col-span-2 grid min-h-11 grid-cols-[28px_minmax(0,1fr)] items-center gap-2 rounded-[0.875rem] text-left transition-colors hover:bg-foreground/[0.04] active:bg-foreground/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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
    </button>
    <button
      type="button"
      onClick={onUnmark}
      aria-label={unmarkLabel(idx + 1, isWarmup)}
      className={cn(
        "relative mx-auto inline-flex h-6 w-6 items-center justify-center rounded-full transition-transform after:absolute after:content-[''] active:scale-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        // after: is placed from inside the border, so the warm-up's ring
        // is paid back to keep both checks 44px.
        isWarmup
          ? "border border-foreground/50 bg-foreground/[0.08] text-fg-soft after:-inset-[calc(0.625rem+1px)]"
          : "bg-primary text-primary-foreground after:-inset-2.5",
      )}
    >
      <Check size={13} strokeWidth={2.6} />
    </button>
  </div>
);
