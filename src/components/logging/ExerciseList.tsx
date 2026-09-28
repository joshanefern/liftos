import { Check } from "lucide-react";
import { progressLabel, type SetsProgress } from "@/lib/sessionFocus";

export type ExerciseListItem = {
  id: string;
  name: string;
  progress: SetsProgress;
  /** The exercise the focus card is showing. */
  focused: boolean;
};

type Props = {
  items: ExerciseListItem[];
  onPick: (exerciseId: string) => void;
  /** The focus card above has just changed height, so these rows have
      just moved: the list ignores touches until the card takes them again. */
  settling?: boolean;
};

/**
 * Every exercise in the workout, one line each, in workout order. It is a
 * map, not a second logger: rows carry no inputs — tapping one points the
 * focus card at that exercise, which is the only place sets are logged.
 */
export const ExerciseList = ({ items, onPick, settling = false }: Props) => (
  <section
    aria-labelledby="session-exercise-list"
    className={settling ? "pointer-events-none" : undefined}
  >
    <h2 id="session-exercise-list" className="eyebrow mb-2 px-1">
      All exercises · <span className="mono">{items.length}</span>
    </h2>
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onPick(item.id)}
            aria-current={item.focused ? "true" : undefined}
            className="flex min-h-[60px] w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-foreground/[0.03] active:bg-foreground/[0.05] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
          >
            {/* Progress sits under the name, not beside it, so a long
                exercise name keeps the row's width and wraps cleanly. */}
            <span className="min-w-0 flex-1">
              <span className="block break-words text-[15px] font-medium capitalize leading-snug text-fg">
                {item.name}
              </span>
              <span className="mono mt-0.5 block text-[12px] leading-4 text-fg-muted">
                {progressLabel(item.progress)}
              </span>
            </span>
            {item.focused && (
              <span className="shrink-0 rounded-full bg-primary/[0.12] px-2 py-1 text-[10px] font-semibold uppercase leading-none tracking-[0.12em] text-primary">
                Now
              </span>
            )}
            <span
              aria-hidden
              className={
                item.progress.complete
                  ? "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  : "h-5 w-5 shrink-0"
              }
            >
              {item.progress.complete && <Check size={12} strokeWidth={2.6} />}
            </span>
            {item.progress.complete && <span className="sr-only">Complete</span>}
          </button>
        </li>
      ))}
    </ul>
  </section>
);
