import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import {
  beforeDiffers,
  formatImprovementPct,
  IMPROVEMENT_EMPTY_BODY,
  improvementCaption,
  improvementIntro,
  improvementPending,
  liftChangeLine,
  shownLiftPcts,
  skippedSummary,
  usualBeforeAt,
  workoutDate,
} from "@/lib/improvementCopy";
import type { ImprovementBreakdown } from "@/lib/strengthTrend";

/* ── What the Improvement tile means. The tile stays ONE number (the
   owner's call — per-lift rows inside the card were removed at his
   demand); the explanation lives here, one tap away: the tile echoed at
   the top, one plain sentence, the two dates, each lift's best set before
   → now with its own %, what did not count, and how the page's top number
   differs. Without a number it says what will appear and when — and, for
   a returning lifter whose latest workout had nothing to compare, which
   lifts did not count and why. ── */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null, or a breakdown with no number, before anything can be compared. */
  breakdown: ImprovementBreakdown | null;
  units: string;
  /** "The +9% at the top of the page is a longer view: …" — or null. */
  heroNote: string | null;
};

export const ImprovementSheet = ({ open, onOpenChange, breakdown, units, heroNote }: Props) => {
  const pct = breakdown?.pct ?? null;
  // The rows' %s are chosen so their average rounds to the number above.
  const data =
    breakdown && pct !== null
      ? { breakdown, pct, shown: shownLiftPcts(breakdown.lifts, pct) }
      : null;
  const caption = data ? improvementCaption(data.breakdown.latest.name) : null;
  const notCounted = data ? skippedSummary(data.breakdown.skipped) : null;
  // "Before" is the day most lifts were last done; a lift last done on
  // another day says so on its own line.
  const beforeAt = data ? usualBeforeAt(data.breakdown.lifts) : null;
  const pending = data ? null : improvementPending(breakdown);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="pb-0">
        <div
          className={`shrink-0 px-6 pr-14 pt-2 ${
            data ? "" : "pb-[calc(1.75rem+var(--safe-bottom))]"
          }`}
        >
          <DrawerTitle className="eyebrow !text-primary">Improvement</DrawerTitle>
          {data && caption ? (
            <>
              {/* The tile, echoed — so there is no doubt this explains it. */}
              <p
                className={`mt-2 stat-scoreboard text-[40px] leading-[44px] tabular-nums ${
                  data.pct > 0 ? "text-primary" : "text-fg"
                }`}
              >
                {formatImprovementPct(data.pct)}
              </p>
              <p className="text-[15px] font-semibold leading-5 text-fg">
                {caption.workout} {caption.against}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[17px] font-semibold leading-6 tracking-tight text-fg">
              {pending?.title}
            </p>
          )}
          <DrawerDescription className="mt-2 text-[13px] leading-5 text-fg-soft">
            {data ? improvementIntro(data.breakdown) : IMPROVEMENT_EMPTY_BODY}
          </DrawerDescription>
          {pending?.notCounted && (
            <div className="mt-3 space-y-1.5 text-[12px] leading-[18px] text-fg-muted">
              <p>{pending.notCounted}</p>
              {pending.next && <p>{pending.next}</p>}
            </div>
          )}
        </div>

        {data && (
          /* The one scroller: a long workout outgrows a small phone. Marked
             no-drag so scrolling the lifts never half-dismisses the sheet —
             the header, grabber, X and backdrop still close it. */
          <div
            data-vaul-no-drag
            className="min-h-0 flex-auto overflow-y-auto overscroll-contain px-6 pb-[calc(1.5rem+var(--safe-bottom))]"
          >
            <dl className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <dt className="eyebrow !text-[10px]">This time</dt>
                <dd className="mono mt-1 text-[13px] font-medium text-fg">
                  {workoutDate(data.breakdown.latest.finishedAt)}
                </dd>
              </div>
              {beforeAt && (
                <div>
                  <dt className="eyebrow !text-[10px]">Before</dt>
                  <dd className="mono mt-1 text-[13px] font-medium text-fg">
                    {workoutDate(beforeAt)}
                  </dd>
                </div>
              )}
            </dl>

            <ul className="mt-3 divide-y divide-border border-y border-border">
              {data.breakdown.lifts.map((lift, i) => (
                <li key={lift.name} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-fg">{lift.name}</p>
                    <p className="mono mt-0.5 text-[12px] leading-4 text-fg-muted">
                      {liftChangeLine(lift, units, beforeDiffers(lift, beforeAt))}
                    </p>
                  </div>
                  <p
                    className={`stat-scoreboard shrink-0 text-[20px] leading-6 tabular-nums ${
                      data.shown.values[i] > 0 ? "text-primary" : "text-fg"
                    }`}
                  >
                    {formatImprovementPct(data.shown.values[i], data.shown.decimals)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="mt-3 space-y-1.5 text-[12px] leading-[18px] text-fg-muted">
              {data.breakdown.lifts.length > 1 && (
                <p>
                  {formatImprovementPct(data.pct)} is the average of these{" "}
                  {data.breakdown.lifts.length} lifts.
                </p>
              )}
              {notCounted && <p>{notCounted}</p>}
              {heroNote && <p>{heroNote}</p>}
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
};
