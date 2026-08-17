import { SetInputRow } from "@/components/logging/SetInputRow";
import { useEnterAdvance } from "@/components/logging/useEnterAdvance";
import { DeferredInput } from "@/components/review/DeferredInput";
import { NameAutocomplete } from "@/components/review/NameAutocomplete";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DETECTION_THRESHOLDS } from "@/lib/capture";
import type { EditableGroup, EditableSet } from "@/lib/review/buildEditable";
import { newEmptySet } from "@/lib/review/buildEditable";
import {
  formatDistance,
  formatDurationMmSs,
  isMetricUnits,
  parseDistanceToMeters,
  parseDurationToSeconds,
} from "@/lib/review/inputFormatters";
import { Activity, MoreVertical, Plus, Trash2 } from "lucide-react";

type Props = {
  group: EditableGroup;
  isFirst: boolean;
  exerciseNameOptions: string[];
  unitsLabel: string;
  weightPlaceholderFor: (name: string) => number | null;
  repsPlaceholderFor: (name: string) => number | null;
  onChange: (next: EditableGroup) => void;
  onMergeUp: () => void;
  onSplit: () => void;
  onDelete: () => void;
};

export const ExerciseGroupCard = ({
  group,
  isFirst,
  exerciseNameOptions,
  unitsLabel,
  weightPlaceholderFor,
  repsPlaceholderFor,
  onChange,
  onMergeUp,
  onSplit,
  onDelete,
}: Props) => {
  const isCardio = group.kind === "cardio";
  const lowConfidence =
    !isCardio &&
    (group.group_confidence ?? 1) < DETECTION_THRESHOLDS.CONFIDENCE_FLAG;
  const isMetric = isMetricUnits(unitsLabel);
  const distanceUnit = isMetric ? "km" : "mi";

  const exerciseWeightHint = weightPlaceholderFor(group.name);
  const exerciseRepsHint = repsPlaceholderFor(group.name);

  const updateSet = (id: string, key: keyof EditableSet, value: string | boolean): void => {
    onChange({
      ...group,
      sets: group.sets.map((s) => (s.id === id ? { ...s, [key]: value } : s)),
    });
  };

  const addSet = (): void => {
    onChange({ ...group, sets: [...group.sets, newEmptySet(group.id)] });
  };

  const cardioSet = isCardio ? group.sets[0] : undefined;

  // Enter-key focus auto-advance: reps → weight → next set's reps.
  const { registerRepsRef, registerWeightRef, focusWeight, focusNextReps } =
    useEnterAdvance(group.sets.map((s) => s.id));

  return (
    <article className="rule-hairline pt-3.5 animate-reveal-up">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {isCardio ? (
            <span
              aria-hidden
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-secondary text-fg-muted"
            >
              <Activity size={11} />
            </span>
          ) : (
            <ConfidenceDot low={lowConfidence} />
          )}
          <div className="min-w-0 flex-1">
            <NameAutocomplete
              value={group.name}
              options={exerciseNameOptions}
              placeholder={isCardio ? "Cardio name" : "Name this exercise"}
              onChange={(name) => onChange({ ...group, name })}
            />
            <p className="caption mt-0.5 !text-fg-faint">
              {isCardio
                ? "Cardio block"
                : `${group.sets.length} set${group.sets.length === 1 ? "" : "s"}${
                    lowConfidence ? " · low confidence — please verify" : ""
                  }`}
            </p>
          </div>
        </div>

        {isCardio ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete cardio block"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[0.75rem] border border-border text-fg-muted transition hover:border-destructive/40 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-destructive/30"
          >
            <Trash2 size={14} />
          </button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Group actions"
                className="inline-flex h-9 w-9 items-center justify-center rounded-[0.75rem] border border-border text-fg-muted transition hover:border-primary/40 hover:text-gold focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <MoreVertical size={14} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="border border-border bg-popover">
              <DropdownMenuItem onClick={onMergeUp} disabled={isFirst}>
                Merge with above
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onSplit} disabled={group.sets.length < 2}>
                Split into two
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="!text-destructive">
                Delete group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>

      {isCardio && cardioSet ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="eyebrow mb-2 block !text-[10px]">Duration (mm:ss)</span>
            <DeferredInput
              type="text"
              inputMode="numeric"
              placeholder="—"
              canonical={cardioSet.duration_seconds ?? ""}
              format={formatDurationMmSs}
              parse={parseDurationToSeconds}
              onCommit={(v) => updateSet(cardioSet.id, "duration_seconds", v)}
              className="h-11 w-full rounded-lg border border-border bg-transparent px-3 text-sm outline-none transition placeholder:text-fg-faint focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block min-w-0">
            <span className="eyebrow mb-2 block !text-[10px]">Distance ({distanceUnit})</span>
            <DeferredInput
              type="text"
              inputMode="decimal"
              placeholder="—"
              canonical={cardioSet.distance_m ?? ""}
              format={(meters) => formatDistance(meters, isMetric)}
              parse={(raw) => parseDistanceToMeters(raw, isMetric)}
              onCommit={(v) => updateSet(cardioSet.id, "distance_m", v)}
              className="h-11 w-full rounded-lg border border-border bg-transparent px-3 text-sm outline-none transition placeholder:text-fg-faint focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
          </label>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            {group.sets.map((set, idx) => {
              const prevSet = idx > 0 ? group.sets[idx - 1] : null;
              const repsHint = prevSet?.reps?.trim()
                ? Number(prevSet.reps)
                : exerciseRepsHint;
              const weightHint = prevSet?.weight?.trim()
                ? Number(prevSet.weight)
                : exerciseWeightHint;

              // Done-tap & weight-Enter share intent: toggle, and if marking
              // done (not un-marking), advance focus to next set's reps.
              const onDoneTap = () => {
                const becomingDone = !set.done;
                updateSet(set.id, "done", becomingDone);
                if (becomingDone) focusNextReps(set.id);
              };

              return (
                <SetInputRow
                  key={set.id}
                  idx={idx}
                  showLabels={idx === 0}
                  reps={set.reps}
                  weight={set.weight}
                  done={!!set.done}
                  unitsLabel={unitsLabel}
                  repsHint={repsHint}
                  weightHint={weightHint}
                  registerRepsRef={registerRepsRef(set.id)}
                  registerWeightRef={registerWeightRef(set.id)}
                  onRepsChange={(v) => updateSet(set.id, "reps", v)}
                  onWeightChange={(v) => updateSet(set.id, "weight", v)}
                  onRepsEnter={() => focusWeight(set.id)}
                  onDoneTap={onDoneTap}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={addSet}
            className="mt-2.5 inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs text-fg-muted transition hover:border-primary/40 hover:text-fg"
          >
            <Plus size={13} />
            Add set
          </button>
        </>
      )}
    </article>
  );
};

const ConfidenceDot = ({ low }: { low: boolean }) => (
  <span
    aria-hidden
    title={low ? "Low detection confidence" : "High detection confidence"}
    className={`h-2.5 w-2.5 shrink-0 rounded-full ${
      low ? "border border-foreground/25" : "bg-gold"
    }`}
  />
);
