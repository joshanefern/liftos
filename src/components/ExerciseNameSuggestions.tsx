import { exerciseNameSuggestions } from "@/lib/exerciseNames";
import { useWorkoutLogs } from "@/hooks/useWorkoutLogs";
import { useWorkoutTemplates } from "@/hooks/useWorkoutTemplates";
import { useMemo } from "react";

/** Tappable name suggestions under an exercise input, drawn from the
    lifter's own history and saved workouts — prefix matches first, so
    "rec" surfaces "Recline Curl" before typos take root. Parents render
    this only while the input is focused; onMouseDown beats the blur. */
const ExerciseNameSuggestions = ({
  query,
  onPick,
}: {
  query: string;
  onPick: (name: string) => void;
}) => {
  const { logs } = useWorkoutLogs();
  const { templates } = useWorkoutTemplates();
  const suggestions = useMemo(
    () => exerciseNameSuggestions(logs, templates, query),
    [logs, templates, query],
  );
  if (suggestions.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {suggestions.map((name) => (
        <button
          key={name}
          type="button"
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(name);
          }}
          className="inline-flex min-h-8 items-center rounded-full border border-border bg-card px-3 text-[12px] font-medium text-fg-soft transition hover:border-fg-soft hover:text-fg"
        >
          {name}
        </button>
      ))}
    </div>
  );
};

export default ExerciseNameSuggestions;
