import { RestTimerRing } from "@/components/logging/RestTimerRing";
import { formatRestClock, setPosition } from "@/lib/sessionFocus";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

type Props = {
  /** Seconds left. */
  remaining: number;
  /** 0..1 fraction of the rest still left. */
  progress: number;
  /** The countdown just reached zero — show the "Rest complete" cue. */
  finished: boolean;
  /** Set when the card shows a different exercise from the one resting:
      the rest is named by its exercise, and there is no "Next:" line —
      that set is not this card's. */
  ownerName?: string | null;
  nextName: string;
  /** 1-based among the next exercise's working sets. */
  nextOrdinal: number;
  nextTotal: number;
  onExtend: () => void;
  onSkip: () => void;
  /** The countdown's label opens the rest timer setting. */
  onOpenSettings: () => void;
};

const actionClass =
  "relative inline-flex min-h-9 items-center justify-center rounded-full border border-border bg-card px-3.5 text-[12.5px] font-semibold text-fg-soft transition after:absolute after:-inset-1 after:content-[''] hover:border-fg-soft hover:text-fg active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/**
 * Rest, inside the workout flow: it sits in the focus card directly UNDER
 * the "Complete set" of the set it is a rest before. Nothing above it
 * depends on it, so the set's cells and the primary button hold their
 * place when the rest starts, is extended, skipped, or runs out — and
 * logging early needs no detour through the timer.
 *
 * The block keeps one height for as long as it is mounted: at zero the
 * action row goes invisible and inert instead of being removed, so the
 * "Rest complete" beat moves nothing on the page.
 *
 * The "Next" line wraps rather than truncates — a long exercise name is
 * exactly the case where a cut-off line would hide what is coming.
 *
 * "Rest · m:ss" is also the way to the rest timer setting (on/off and
 * length): the one place someone looking at a countdown would reach for.
 */
export const RestBlock = ({
  remaining,
  progress,
  finished,
  ownerName = null,
  nextName,
  nextOrdinal,
  nextTotal,
  onExtend,
  onSkip,
  onOpenSettings,
}: Props) => (
  <div
    className={cn(
      "rounded-[14px] border px-3.5 py-3 transition-colors",
      finished ? "border-primary/60 bg-primary/[0.08]" : "border-border bg-secondary/60",
    )}
  >
    <div className="flex items-center gap-3">
      <RestTimerRing
        bare
        remaining={remaining}
        progress={finished ? 0 : progress}
        size={40}
        strokeWidth={4}
        pulse={finished}
      />
      <div className="min-w-0 flex-1">
        {/* No live-region role here: the logger announces the end of rest
            from a region that outlives this block. */}
        {finished ? (
          <p className="break-words text-[15px] font-semibold leading-5 text-primary">
            {ownerName !== null ? (
              <>
                <span className="capitalize">{ownerName}</span> rest complete.
              </>
            ) : (
              "Rest complete — lift."
            )}
          </p>
        ) : (
          // The hit area grows to 44px tall without moving a pixel of the
          // block (after:) — mostly upward, into the block's own padding,
          // so it barely reaches the "Next" line and never the button above.
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={`${ownerName !== null ? `${ownerName} rest` : "Rest"}, ${formatRestClock(remaining)} left. Rest timer settings`}
            className="relative -ml-1 inline-flex max-w-full items-center gap-1 rounded-md px-1 text-left text-[15px] font-semibold leading-5 text-fg after:absolute after:-inset-x-1 after:-bottom-2 after:-top-4 after:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="min-w-0 break-words">
              {ownerName !== null ? (
                <>
                  <span className="capitalize">{ownerName}</span> rest
                </>
              ) : (
                "Rest"
              )}{" "}
              · <span className="mono tabular-nums">{formatRestClock(remaining)}</span>
            </span>
            <ChevronRight aria-hidden size={14} strokeWidth={2.4} className="shrink-0 text-fg-muted" />
          </button>
        )}
        {ownerName === null && (
          <p className="mt-0.5 break-words text-[12.5px] leading-[18px] text-fg-muted">
            Next: <span className="capitalize text-fg-soft">{nextName}</span>,{" "}
            <span className="mono">{setPosition(nextOrdinal, nextTotal)}</span>
          </p>
        )}
      </div>
    </div>
    <div
      aria-hidden={finished ? true : undefined}
      className={cn("mt-2.5 flex flex-wrap items-center gap-2", finished && "invisible")}
    >
      <button
        type="button"
        onClick={onExtend}
        disabled={finished}
        tabIndex={finished ? -1 : undefined}
        className={actionClass}
      >
        +30 sec
      </button>
      <button
        type="button"
        onClick={onSkip}
        disabled={finished}
        tabIndex={finished ? -1 : undefined}
        className={actionClass}
      >
        Skip rest
      </button>
    </div>
  </div>
);
