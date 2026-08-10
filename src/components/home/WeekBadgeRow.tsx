import { Check } from "lucide-react";

/* Seven circular day badges for the current Monday→Sunday week, drawn for
   the hero ink panel (bg-foreground/text-background context — every color
   here is relative to the panel, so the row auto-inverts with the theme).
   Week convention matches getWeekStats: Mon=0 … Sun=6, local midnight. */

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type Props = {
  /** Mon=0 … Sun=6 indices of days with a logged session (WeekStats.workedDayIndices). */
  workedDayIndices: number[];
};

export const WeekBadgeRow = ({ workedDayIndices }: Props) => {
  const now = new Date();
  const todayIdx = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - todayIdx);
  const worked = new Set(workedDayIndices);

  return (
    <div role="list" aria-label="Training days this week" className="flex gap-1.5">
      {DAY_NAMES.map((dayName, i) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const trained = worked.has(i);
        const isToday = i === todayIdx;
        const label = `${dayName} ${date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}, ${trained ? "trained" : "no session"}`;

        const shape =
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums";
        const tone = trained
          ? "bg-primary"
          : isToday
            ? "border-[1.5px] border-background text-background"
            : "bg-background/10 text-background/40";

        return (
          <span key={dayName} role="listitem" aria-label={label} className={`${shape} ${tone}`}>
            {trained ? (
              <Check size={14} strokeWidth={2.5} className="text-background" aria-hidden />
            ) : (
              date.getDate()
            )}
          </span>
        );
      })}
    </div>
  );
};
