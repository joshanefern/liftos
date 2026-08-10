import { CTAButton } from "@/components/GoldButton";
import { WorkoutTemplate } from "@/data/liftosMock";
import { Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

type WorkoutTemplateEditorProps = {
  template: WorkoutTemplate;
  onSave: (template: WorkoutTemplate) => void;
};

const WorkoutTemplateEditor = ({ template, onSave }: WorkoutTemplateEditorProps) => {
  const [draft, setDraft] = useState(template);
  const totalSets = useMemo(
    () => draft.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0),
    [draft.exercises],
  );

  const addExercise = () => {
    setDraft((current) => ({
      ...current,
      exercises: [
        ...current.exercises,
        {
          id: `exercise-${Date.now()}`,
          name: "New Exercise",
          category: "Accessory",
          target: "Add target",
          sets: [{ id: `set-${Date.now()}`, reps: 10, weight: 50 }],
        },
      ],
    }));
  };

  return (
    <div className="rounded-[14px] border border-border bg-card p-4 md:p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-1.5">Template Builder</p>
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            className="w-full bg-transparent text-xl font-semibold text-fg outline-none focus:text-primary"
          />
          <p className="mt-1 text-sm text-fg-muted">
            {draft.split} split · {draft.duration} min · {totalSets} planned sets
          </p>
        </div>
        <CTAButton onClick={() => onSave(draft)}>
          <Save size={16} />
          Save
        </CTAButton>
      </div>

      <div className="divide-y divide-border border-t border-border">
        {draft.exercises.map((exercise, exerciseIndex) => (
          <div key={exercise.id} className="py-3.5">
            <div className="mb-3 grid gap-2 md:grid-cols-[1.2fr_0.8fr_1fr_auto] md:gap-3">
              <input
                value={exercise.name}
                aria-label="Exercise name"
                onChange={(event) => {
                  const exercises = [...draft.exercises];
                  exercises[exerciseIndex] = { ...exercise, name: event.target.value };
                  setDraft({ ...draft, exercises });
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg outline-none transition focus:border-primary"
              />
              <input
                value={exercise.category}
                aria-label="Exercise category"
                onChange={(event) => {
                  const exercises = [...draft.exercises];
                  exercises[exerciseIndex] = { ...exercise, category: event.target.value };
                  setDraft({ ...draft, exercises });
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg outline-none transition focus:border-primary"
              />
              <input
                value={exercise.target}
                aria-label="Exercise target"
                onChange={(event) => {
                  const exercises = [...draft.exercises];
                  exercises[exerciseIndex] = { ...exercise, target: event.target.value };
                  setDraft({ ...draft, exercises });
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg outline-none transition focus:border-primary"
              />
              <button
                type="button"
                aria-label="Remove exercise"
                onClick={() => setDraft({ ...draft, exercises: draft.exercises.filter((item) => item.id !== exercise.id) })}
                className="inline-flex h-11 w-11 items-center justify-center justify-self-end rounded-[0.875rem] border border-border text-fg-muted transition hover:border-destructive/40 hover:text-destructive"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <div className="space-y-2">
              {exercise.sets.map((set, setIndex) => (
                <div key={set.id} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                  <span className="text-xs text-fg-muted">Set {setIndex + 1}</span>
                  <input
                    type="number"
                    value={set.reps}
                    aria-label="Reps"
                    onChange={(event) => {
                      const exercises = [...draft.exercises];
                      const sets = [...exercise.sets];
                      sets[setIndex] = { ...set, reps: Number(event.target.value) };
                      exercises[exerciseIndex] = { ...exercise, sets };
                      setDraft({ ...draft, exercises });
                    }}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg outline-none transition focus:border-primary"
                  />
                  <input
                    type="number"
                    value={set.weight}
                    aria-label="Weight"
                    onChange={(event) => {
                      const exercises = [...draft.exercises];
                      const sets = [...exercise.sets];
                      sets[setIndex] = { ...set, weight: Number(event.target.value) };
                      exercises[exerciseIndex] = { ...exercise, sets };
                      setDraft({ ...draft, exercises });
                    }}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-fg outline-none transition focus:border-primary"
                  />
                  <button
                    type="button"
                    aria-label="Remove set"
                    onClick={() => {
                      const exercises = [...draft.exercises];
                      exercises[exerciseIndex] = {
                        ...exercise,
                        sets: exercise.sets.filter((item) => item.id !== set.id),
                      };
                      setDraft({ ...draft, exercises });
                    }}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-[0.875rem] text-fg-muted transition hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                const exercises = [...draft.exercises];
                exercises[exerciseIndex] = {
                  ...exercise,
                  sets: [...exercise.sets, { id: `set-${Date.now()}`, reps: 10, weight: 50 }],
                };
                setDraft({ ...draft, exercises });
              }}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-xs text-fg-muted transition hover:bg-secondary hover:text-fg"
            >
              <Plus size={14} />
              Add set
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addExercise}
        className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 text-sm text-fg-muted transition hover:bg-secondary hover:text-fg"
      >
        <Plus size={16} />
        Add exercise
      </button>
    </div>
  );
};

export default WorkoutTemplateEditor;
