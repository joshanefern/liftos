import { exerciseNameSuggestions } from "@/lib/exerciseNames";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

/** Tappable name suggestions under an exercise input, drawn from the
    lifter's own history and saved workouts — prefix matches first, so
    "rec" surfaces "Recline Curl" before typos take root. Parents render
    this only while the input is focused; onMouseDown beats the blur.

    `singleRow`: one line that scrolls sideways instead of wrapping, for a
    place that must keep its height as the lifter types (a sheet held
    above the keyboard has a fixed height — a second row would push its
    button under the keyboard). */
const ExerciseNameSuggestions = ({
  query,
  onPick,
  singleRow = false,
}: {
  query: string;
  onPick: (name: string) => void;
  singleRow?: boolean;
}) => {
  const { logs } = useWorkoutLogs();
  const { templates } = useWorkoutTemplates();
  const suggestions = useMemo(
    () => exerciseNameSuggestions(logs, templates, query),
    [logs, templates, query],
  );
  if (suggestions.length === 0) return null;
  return (
    <div
      className={cn(
        "flex gap-1.5",
        singleRow
          ? // py: room for the chips' taller hit areas inside the scroller.
            "overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "mt-1.5 flex-wrap",
      )}
    >
      {suggestions.map((name) => (
        <button
          key={name}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(name);
          }}
          className={cn(
            // The hit area reaches 44px tall without making the chip any
            // bigger.
            "relative inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 text-[12px] font-medium text-fg-soft transition after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] hover:border-fg-soft hover:text-fg",
            singleRow && "shrink-0 whitespace-nowrap",
          )}
        >
          {name}
        </button>
      ))}
    </div>
  );
};

export default ExerciseNameSuggestions;
