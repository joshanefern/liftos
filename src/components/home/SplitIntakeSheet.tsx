import { useMemo, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ChevronDown, Sparkles } from "lucide-react";
import type { IntakeNotes, ScheduleDay } from "@/lib/coachSetup";

/* ── The experienced lifter's 30-second intake. They already know how they
   train — we only ask WHEN (day chips) and WHAT each day hits (focus,
   pre-filled from the standard split for that many days so most people
   never touch it), plus two short optional lines: lifts the week must
   include, and anything to avoid. ── */

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
  onBuild: (schedule: ScheduleDay[], notes: IntakeNotes) => void;
};

const FIELD_CLASS =
  "h-11 w-full rounded-[10px] border border-border bg-background px-3 text-sm text-fg outline-none transition placeholder:text-fg-muted focus:border-primary/60";

export const SplitIntakeSheet = ({ open, onOpenChange, building, onBuild }: Props) => {
  const [selected, setSelected] = useState<string[]>([]);
  // Focus per day: only days the user explicitly changed; the rest follow
  // the default pattern for however many days are selected.
  const [manual, setManual] = useState<Record<string, string>>({});
  // The one day whose focus list is open — a select that expands in place,
  // so every option is on screen and nothing scrolls sideways.
  const [editing, setEditing] = useState<string | null>(null);
  const [mustHave, setMustHave] = useState("");
  const [avoid, setAvoid] = useState("");

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
        setEditing((e) => (e === day ? null : e));
      }
      return removing ? current.filter((d) => d !== day) : [...current, day];
    });
  };

  const chooseFocus = (day: string, option: string): void => {
    setManual((m) => ({ ...m, [day]: option }));
    setEditing(null);
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* Everything but the day list is shrink-0: when the sheet hits its
          height cap on a short phone, only the list gives way (and scrolls),
          so the Build button is never pushed off-screen. */}
      <DrawerContent className="px-6 pb-[calc(1.5rem+var(--safe-bottom))]">
        <p className="eyebrow mt-3 shrink-0 pr-12 !text-primary">Your routine</p>
        <DrawerTitle className="heading-md mt-2 shrink-0 text-fg">
          Pick your days — the coach fills in the work.
        </DrawerTitle>
        <DrawerDescription className="mt-1 shrink-0 text-[13px] leading-5 text-fg-muted">
          Each day starts with the usual split for that many days. Tap a focus to
          change it.
        </DrawerDescription>

        {/* Which days */}
        <div className="mt-4 flex shrink-0 justify-between gap-1.5">
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

        {/* What each day hits. One row per day: the day name and a pill
            showing its focus. Tapping the pill opens the full list as a
            wrapping grid under that row — one day open at a time, so the
            list never grows past a screen. data-vaul-no-drag keeps the
            list's own scroll from turning into a half-dismissed sheet. */}
        {schedule.length > 0 && (
          <div
            data-vaul-no-drag
            className="mt-4 min-h-[5.5rem] flex-auto space-y-1.5 overflow-y-auto overscroll-contain"
          >
            {schedule.map(({ day, focus }) => {
              const isOpen = editing === day;
              return (
                <div key={day} className="rounded-[12px] border border-border">
                  <div className="flex min-h-11 items-center justify-between gap-3 px-3">
                    <p className="text-[13px] font-semibold text-fg">{day}</p>
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={`${day} focus: ${focus}. Change`}
                      onClick={() => setEditing(isOpen ? null : day)}
                      className={`relative inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-[12.5px] font-semibold transition after:absolute after:-inset-1 after:content-[''] ${
                        isOpen
                          ? "border-primary/60 text-fg"
                          : "border-border text-fg"
                      }`}
                    >
                      {focus}
                      <ChevronDown
                        size={14}
                        className={`text-fg-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </div>
                  {isOpen && (
                    <div
                      role="group"
                      aria-label={`Focus for ${day}`}
                      className="flex flex-wrap gap-1.5 border-t border-border px-3 py-3"
                    >
                      {FOCUSES.map((option) => (
                        <button
                          key={option}
                          type="button"
                          aria-pressed={focus === option}
                          onClick={() => chooseFocus(day, option)}
                          className={`relative min-h-9 rounded-full px-3 text-[12.5px] font-semibold transition after:absolute after:-inset-1 after:content-[''] ${
                            focus === option
                              ? "bg-primary text-primary-foreground"
                              : "border border-border text-fg-muted"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Two short lines the coach reads as separate instructions. */}
        <div className="mt-4 grid shrink-0 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-fg">
              Must-have lifts
              <span className="ml-1.5 font-medium text-fg-muted">optional</span>
            </span>
            <input
              value={mustHave}
              onChange={(e) => setMustHave(e.target.value)}
              placeholder="Front squat, weighted pull-ups…"
              className={FIELD_CLASS}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-semibold text-fg">
              Avoid (injuries, equipment)
              <span className="ml-1.5 font-medium text-fg-muted">optional</span>
            </span>
            <input
              value={avoid}
              onChange={(e) => setAvoid(e.target.value)}
              placeholder="Bad shoulder, no cables…"
              className={FIELD_CLASS}
            />
          </label>
        </div>

        <button
          type="button"
          disabled={schedule.length === 0 || building}
          onClick={() => onBuild(schedule, { mustHave, avoid })}
          className="mt-4 inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-[14px] font-semibold text-primary-foreground transition hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
        >
          <Sparkles size={15} />
          {building
            ? "Building your week…"
            : schedule.length > 0
              ? `Build my ${schedule.length}-day week`
              : "Pick at least one day"}
        </button>
      </DrawerContent>
    </Drawer>
  );
};
