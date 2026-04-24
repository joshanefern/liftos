import ActiveWorkoutLogger from "@/components/ActiveWorkoutLogger";
import { WorkoutTemplate, workoutTemplates } from "@/data/liftosMock";

const getActiveTemplate = (): WorkoutTemplate => {
  if (typeof window === "undefined") return workoutTemplates[0];

  try {
    const saved = window.localStorage.getItem("liftos_active_workout_template");
    return saved ? (JSON.parse(saved) as WorkoutTemplate) : workoutTemplates[0];
  } catch {
    return workoutTemplates[0];
  }
};

const ActiveWorkout = () => <ActiveWorkoutLogger template={getActiveTemplate()} />;

export default ActiveWorkout;
