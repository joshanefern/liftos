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
    <div className="rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-5 md:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="label-xs mb-2">Template Builder</p>
          <input
            value={draft.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            className="w-full bg-transparent text-xl font-semibold outline-none focus:text-gold"
          />
          <p className="mt-2 text-sm text-foreground/30">
            {draft.split} split · {draft.duration} min · {totalSets} planned sets
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSave(draft)}
          className="inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,rgba(215,181,99,1),rgba(184,147,66,1))] px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-gold/60"
        >
          <Save size={16} />
          Save
        </button>
      </div>

      <div className="space-y-4">
        {draft.exercises.map((exercise, exerciseIndex) => (
          <div key={exercise.id} className="rounded-[1rem] border border-white/8 bg-white/[0.03] p-4">
            <div className="mb-4 grid gap-3 md:grid-cols-[1.2fr_0.8fr_1fr_auto]">
              <input
                value={exercise.name}
                aria-label="Exercise name"
                onChange={(event) => {
                  const exercises = [...draft.exercises];
                  exercises[exerciseIndex] = { ...exercise, name: event.target.value };
                  setDraft({ ...draft, exercises });
                }}
                className="rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-gold/50"
              />
              <input
                value={exercise.category}
                aria-label="Exercise category"
                onChange={(event) => {
                  const exercises = [...draft.exercises];
                  exercises[exerciseIndex] = { ...exercise, category: event.target.value };
                  setDraft({ ...draft, exercises });
                }}
                className="rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-gold/50"
              />
              <input
                value={exercise.target}
                aria-label="Exercise target"
                onChange={(event) => {
                  const exercises = [...draft.exercises];
                  exercises[exerciseIndex] = { ...exercise, target: event.target.value };
                  setDraft({ ...draft, exercises });
                }}
                className="rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-gold/50"
              />
              <button
                type="button"
                aria-label="Remove exercise"
                onClick={() => setDraft({ ...draft, exercises: draft.exercises.filter((item) => item.id !== exercise.id) })}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[0.875rem] border border-white/8 text-foreground/30 transition hover:border-destructive/40 hover:text-destructive"
              >
                <Trash2 size={15} />
              </button>
            </div>

            <div className="space-y-2">
              {exercise.sets.map((set, setIndex) => (
                <div key={set.id} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                  <span className="text-xs text-foreground/30">Set {setIndex + 1}</span>
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
                    className="rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-gold/50"
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
                    className="rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 py-2 text-sm outline-none focus:border-gold/50"
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
                    className="inline-flex h-10 w-10 items-center justify-center rounded-[0.875rem] text-foreground/30 transition hover:text-destructive"
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
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/8 px-3 py-2 text-xs text-foreground/50 transition hover:border-gold/30 hover:text-foreground"
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
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/8 px-4 py-2.5 text-sm text-foreground/50 transition hover:border-gold/30 hover:text-foreground"
      >
        <Plus size={16} />
        Add exercise
      </button>
    </div>
  );
};

export default WorkoutTemplateEditor;
