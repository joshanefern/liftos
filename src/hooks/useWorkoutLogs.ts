import { supabase } from "@/lib/supabase";
import type { WorkoutExercise } from "@/data/liftosMock";
import { useCallback, useEffect, useState } from "react";

export type WorkoutLog = {
  id: string;
  template_id: string | null;
  name: string;
  exercises: WorkoutExercise[];
  notes: string | null;
  started_at: string | null;
  finished_at: string;
  duration_minutes: number | null;
  total_sets: number;
  completed_sets: number;
  total_volume: number;
  created_at: string;
};

export type NewWorkoutLog = Omit<WorkoutLog, "id" | "created_at">;

export const useWorkoutLogs = () => {
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("workout_logs")
      .select("*")
      .order("finished_at", { ascending: false })
      .limit(200);
    setLogs((data as WorkoutLog[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (log: NewWorkoutLog) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("workout_logs")
      .insert({ ...log, user_id: user.id })
      .select()
      .single();
    if (error) throw error;
    setLogs((prev) => [data as WorkoutLog, ...prev]);
    return data as WorkoutLog;
  };

  return { logs, loading, save, reload: load };
};
