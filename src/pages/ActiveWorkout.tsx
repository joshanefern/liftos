import ActiveWorkoutLogger from "@/components/ActiveWorkoutLogger";
import { CTAButton } from "@/components/GoldButton";
import type { WorkoutExercise } from "@/data/liftosMock";

export type ActiveSession = {
  name: string;
  exercises: WorkoutExercise[];
  templateId?: string;
  startedAt: string;
};

const ACTIVE_WORKOUT_STORAGE_KEY = "liftos_active_workout_session";

const getActiveSession = (): ActiveSession | null => {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as ActiveSession) : null;
  } catch {
    return null;
  }
};

const ActiveWorkout = () => {
  const session = getActiveSession();

  if (!session) {
    return (
      <div className="relative min-h-screen w-full max-w-7xl mx-auto p-6 md:p-10 lg:p-12">
        <header className="relative animate-reveal-up">
          <p className="eyebrow">Workout log</p>
        </header>

        {/* The Number: a clock that hasn't started */}
        <section className="relative mt-12 animate-reveal-up md:mt-20">
          <p className="stat-hero whitespace-nowrap !text-6xl !text-fg-muted md:!text-7xl">
            00:00
          </p>
          <p className="eyebrow mt-4">No active session</p>
          <p className="body-sm mt-4 max-w-sm">
            Start a routine from your library and this page becomes your live
            workout log.
          </p>
          <CTAButton to="/workouts" className="mt-8">
            Go to workouts
          </CTAButton>
        </section>
      </div>
    );
  }

  return <ActiveWorkoutLogger session={session} />;
};

export default ActiveWorkout;
