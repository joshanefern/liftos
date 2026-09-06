import { useMemo, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Sparkles } from "lucide-react";
import type { ScheduleDay } from "@/lib/coachSetup";

/* ── The experienced lifter's 30-second intake. They already know how they
   train — we only ask WHEN (day chips) and WHAT each day hits (focus,
   pre-filled from the standard split for that many days so most people
   never touch it). One optional line for must-haves/injuries. ── */

const WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const FOCUSES = [
  "Push",
  "Pull",
  "Legs",
  "Upper",
  "Lower",
  "Full body",
  "Chest",
  "Back",
  "Shoulders",
  "Arms",
  "Core",
];

/** The standard split for N training days — the prefill that saves taps. */
const defaultPattern = (count: number): string[] => {
  switch (count) {
    case 1:
      return ["Full body"];
    case 2:
      return ["Upper", "Lower"];
    case 3:
      return ["Push", "Pull", "Legs"];
    case 4:
      return ["Upper", "Lower", "Upper", "Lower"];
    case 5:
      return ["Push", "Pull", "Legs", "Upper", "Lower"];
    case 6:
      return ["Push", "Pull", "Legs", "Push", "Pull", "Legs"];
    default:
      return ["Push", "Pull", "Legs", "Push", "Pull", "Legs", "Full body"];
  }
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  building: boolean;
  onBuild: (schedule: ScheduleDay[], notes: string) => void;
};

export const SplitIntakeSheet = ({ open, onOpenChange, building, onBuild }: Props) => {
  const [selected, setSelected] = useState<string[]>([]);
  // Focus per day: only days the user explicitly changed; the rest follow
  // the default pattern for however many days are selected.
  const [manual, setManual] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");

  const schedule = useMemo((): ScheduleDay[] => {
    const ordered = WEEK.filter((d) => selected.includes(d));
    const pattern = defaultPattern(ordered.length);
    return ordered.map((day, i) => ({
      day,
      focus: manual[day] ?? pattern[i] ?? "Full body",
    }));
  }, [selected, manual]);

  const toggleDay = (day: string): void => {
    setSelected((current) => {
      const removing = current.includes(day);
      // A deselected day forfeits its manual pin — reselecting it later (in
      // a possibly different day count) starts from the pattern again.
      if (removing) {
        setManual(({ [day]: _dropped, ...rest }) => rest);
      }
      return removing ? current.filter((d) => d !== day) : [...current, day];
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-6 pb-[calc(1.5rem+var(--safe-bottom))]">
        <p className="eyebrow mt-4 !text-primary">Your split</p>
        <DrawerTitle className="heading-md mt-2 text-fg">
          Pick your days — the coach fills in the work.
        </DrawerTitle>
        <DrawerDescription className="mt-1 text-[13px] leading-5 text-fg-muted">
          Each day is prefilled with the standard split for that many days —
          change any of them.
        </DrawerDescription>

        {/* Which days */}
        <div className="mt-4 flex justify-between gap-1.5">
          {WEEK.map((day) => {
            const active = selected.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                aria-pressed={active}
                aria-label={day}
                className={`relative flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-semibold transition after:absolute after:-inset-1 after:content-[''] ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-fg-muted"
                }`}
              >
                {day.slice(0, 2)}
              </button>
            );
          })}
        </div>

        {/* What each day hits — prefilled from the standard split */}
        {schedule.length > 0 && (
          <div className="mt-4 max-h-[38vh] space-y-2 overflow-y-auto">
            {schedule.map(({ day, focus }) => (
              <div key={day} className="flex items-center gap-3">
                <p className="w-20 shrink-0 text-[13px] font-semibold text-fg">{day}</p>
                <div className="scrollbar-none flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                  {FOCUSES.map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={focus === option}
                      aria-label={`${day}: ${option}`}
                      onClick={() =>
                        setManual((m) => {
                          // Tapping the pinned chip un-pins it — the day
                          // follows the pattern again.
                          if (m[day] === option) {
                            const { [day]: _dropped, ...rest } = m;
                            return rest;
                          }
                          return { ...m, [day]: option };
                        })
                      }
                      className={`min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-[12.5px] font-semibold transition ${
                        focus === option
                          ? "bg-foreground text-background"
                          : "border border-border text-fg-muted"
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          aria-label="Anything the coach should know (optional)"
          placeholder="Anything else? Must-have lifts, injuries… (optional)"
          className="mt-4 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-fg outline-none transition placeholder:text-fg-muted focus:border-primary/60"
        />

        <button
          type="button"
          disabled={schedule.length === 0 || building}
          onClick={() => onBuild(schedule, notes)}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-primary text-[14px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          <Sparkles size={15} />
          {building
            ? "Building your split…"
            : schedule.length > 0
              ? `Build my ${schedule.length}-day split`
              : "Pick at least one day"}
        </button>
      </DrawerContent>
    </Drawer>
  );
};
