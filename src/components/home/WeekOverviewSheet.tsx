import { OpenPill } from "@/components/home/OpenPill";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";
import type { WeekDay, WeekHeadline, WeekOverview } from "@/lib/weekOverview";
import { CalendarDays, ChevronsRight } from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router-dom";

/* The overview behind Home's "This week" card: the card's own headline,
   the week's totals, a row per day (each workout opens its detail), the
   records set, and the way to the Calendar. An overview, not a report —
   anything the week has not got is left out rather than shown as a zero. */

/** "1 of 4 planned workouts" in the card's type — the card and the sheet
    print the same line from the same object. */
export const WeekHeadlineLine = ({
  headline,
  className = "",
}: {
  headline: WeekHeadline;
  className?: string;
}) => (
  <span className={`flex items-baseline gap-1.5 ${className}`}>
    <span className="stat-scoreboard text-[28px] leading-8 tabular-nums text-fg">
      {headline.count}
    </span>
    {headline.planned !== null && (
      <span className="text-[15px] font-medium tabular-nums text-fg-muted">
        of {headline.planned}
      </span>
    )}
    <span className="text-[12px] font-medium text-fg-soft">{headline.noun}</span>
  </span>
);

const dayName = (day: WeekDay): string => (day.isToday ? "Today" : day.weekday);

const DayRow = ({ day }: { day: WeekDay }) => (
  <li className="flex items-start gap-3">
    {/* In px, like the type in it: the widest label ("Today May 28") is
        87px, so the rows line up, and a wider one grows its row instead of
        cutting anything off. */}
    <p className="flex min-w-[88px] shrink-0 items-baseline gap-1.5 whitespace-nowrap py-2 leading-5">
      <span
        className={`text-[13px] font-semibold ${day.isToday ? "text-primary" : "text-fg"}`}
      >
        {dayName(day)}
      </span>
      <span className="text-[12px] tabular-nums text-fg-muted">{day.dateLabel}</span>
    </p>
    <div className="min-w-0 flex-1">
      {day.workouts.map((workout) => (
        <Link
          key={workout.id}
          to={`/workouts/review/${workout.id}`}
          aria-label={`${workout.name}, ${day.longLabel}${
            workout.detail ? `, ${workout.detail}` : ""
          }. Open workout`}
          className="-mx-2 flex min-h-[44px] items-center justify-between gap-2 rounded-[10px] px-2 py-2 transition-colors active:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <span className="min-w-0">
            <span className="block break-words text-sm font-semibold leading-5 text-fg">
              {workout.name}
            </span>
            {workout.detail && (
              <span className="block text-[12px] leading-4 tabular-nums text-fg-muted">
                {/* Wraps only between parts, never inside "60 min". */}
                {workout.detail.split(" · ").map((part, i) => (
                  <Fragment key={part}>
                    {i > 0 && " · "}
                    <span className="whitespace-nowrap">{part}</span>
                  </Fragment>
                ))}
              </span>
            )}
          </span>
          <ChevronsRight size={15} aria-hidden className="shrink-0 text-fg-muted" />
        </Link>
      ))}
      {(day.status === "none" || day.status === "today") && (
        <p className="py-2 text-[13px] leading-5 text-fg-muted">
          {day.status === "today" ? "No workout logged yet" : "No workout logged"}
        </p>
      )}
    </div>
  </li>
);

export const WeekOverviewSheet = ({
  open,
  onOpenChange,
  week,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  week: WeekOverview;
}) => {
  const empty = week.headline.count === 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="pb-0">
        <div className="shrink-0 px-6 pb-3 pr-14 pt-2">
          <DrawerTitle className="heading-md text-fg">This week</DrawerTitle>
          <DrawerDescription className="mt-0.5 text-[13px] tabular-nums text-fg-muted">
            {week.rangeLabel}
          </DrawerDescription>
        </div>

        {/* The one scroller: a heavy week outgrows a small phone. Marked
            no-drag so scrolling the days never half-dismisses the sheet —
            the title strip, grabber, X and backdrop still close it. */}
        <div
          data-vaul-no-drag
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[calc(1.25rem+var(--safe-bottom))]"
        >
          {empty ? (
            <p className="text-sm leading-6 text-fg-soft">No workouts logged yet this week.</p>
          ) : (
            <>
              <WeekHeadlineLine headline={week.headline} />

              {/* Equal tiles in one row; a tile never narrower than its
                  number, so on a narrow screen the last one wraps below
                  rather than the number running out of its tile. */}
              {week.totals.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {week.totals.map((total) => (
                    <div
                      key={total.key}
                      className="min-w-max flex-1 rounded-[10px] bg-foreground/[0.04] px-3 py-2.5"
                    >
                      <p className="stat-scoreboard whitespace-nowrap text-[24px] leading-7 tabular-nums text-fg">
                        {total.value}
                      </p>
                      <p className="mt-0.5 text-[11px] font-medium leading-4 text-fg-soft">
                        {total.label}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <ol aria-label="Days this week" className="mt-3 divide-y divide-border">
                {week.days.map((day) => (
                  <DayRow key={day.index} day={day} />
                ))}
              </ol>

              {week.records.length > 0 && (
                <section aria-label="Personal records this week" className="mt-2 border-t border-border pt-3.5">
                  <p className="eyebrow">New personal records</p>
                  <ul className="mt-1">
                    {week.records.map((record) => (
                      <li
                        key={record.key}
                        className="flex min-h-[32px] items-center justify-between gap-3 py-1"
                      >
                        <span className="min-w-0 break-words text-sm leading-5 text-fg">
                          {record.exercise}{" "}
                          <span className="whitespace-nowrap text-[12px] text-fg-muted">
                            {dayName(week.days[record.dayIndex])}
                          </span>
                        </span>
                        <span className="mono shrink-0 text-[12px] text-fg-soft">
                          {record.value}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          <div className="mt-3 border-t border-border pt-1.5">
            <Link
              to="/calendar"
              className="flex min-h-11 items-center justify-between rounded-md text-sm font-semibold text-fg transition hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span className="flex items-center gap-2">
                <CalendarDays size={15} className="text-primary" />
                Calendar
              </span>
              <OpenPill />
            </Link>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
