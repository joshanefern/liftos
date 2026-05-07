import ActiveWorkoutLogger from "@/components/ActiveWorkoutLogger";
import { GoldButton } from "@/components/GoldButton";
import { WorkoutTemplate } from "@/data/liftosMock";
import { Dumbbell } from "lucide-react";
import { Link } from "react-router-dom";

const ACTIVE_WORKOUT_STORAGE_KEY = "liftos_active_workout_session";

const getActiveTemplate = (): WorkoutTemplate | null => {
  if (typeof window === "undefined") return null;

  try {
    const saved = window.localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as WorkoutTemplate) : null;
  } catch {
    return null;
  }
};

const ActiveWorkout = () => {
  const template = getActiveTemplate();

  if (!template) {
    return (
      <div className="relative min-h-screen max-w-7xl p-6 md:p-10 lg:p-12">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-[radial-gradient(circle_at_50%_0%,rgba(184,147,66,0.07),transparent_60%)]" />
        <div className="relative mb-8 animate-reveal-up">
          <p className="label-xs mb-2">Workout Log</p>
          <h1 className="heading-lg">No workout started</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/50">
            Start a workout from your library to begin logging sets, reps, and weight.
          </p>
        </div>

        <section className="relative overflow-hidden border-y border-white/8 py-16 animate-reveal-up md:py-20">
          <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
            <Dumbbell
              className="h-40 w-40 translate-x-[2px] translate-y-[2px] text-foreground/[0.03]"
              strokeWidth={1.25}
            />
          </div>
          <div className="relative mx-auto flex max-w-xl flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[0.875rem] border border-gold/20 bg-gold/10">
              <Dumbbell className="h-[18px] w-[18px] translate-x-[0.5px] translate-y-[0.5px] text-gold" strokeWidth={1.9} />
            </div>
            <p className="label-xs mt-5 mb-2">Workout Log</p>
            <h2 className="text-xl font-semibold tracking-tight">No workout started</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-foreground/50">
              Start a routine from your workout library and this page will turn into your live workout log.
            </p>
            <GoldButton to="/workouts" className="mt-6">
              Go to workouts
            </GoldButton>
          </div>
        </section>
      </div>
    );
  }

  return <ActiveWorkoutLogger template={template} />;
};

export default ActiveWorkout;
