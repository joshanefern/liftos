import { supabase } from "@/lib/supabase";
import { useUser } from "@/context/UserContext";
import type { WorkoutExercise } from "@/data/liftosMock";
import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";

export type WorkoutLogSource = "manual" | "review";

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
  source: WorkoutLogSource;
  captured_session_id: string | null;
  created_at: string;
};

export type NewWorkoutLog = Omit<WorkoutLog, "id" | "created_at">;

type WorkoutLogsContextValue = {
  logs: WorkoutLog[];
  loading: boolean;
  save: (log: NewWorkoutLog) => Promise<WorkoutLog | null>;
  reload: () => Promise<void>;
};

const WorkoutLogsContext = createContext<WorkoutLogsContextValue | null>(null);

export const WorkoutLogsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useUser();
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
    if (!user) {
      setLogs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [user, load]);

  const save = async (log: NewWorkoutLog) => {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return null;
    const { data, error } = await supabase
      .from("workout_logs")
      .insert({ ...log, user_id: authUser.id })
      .select()
      .single();
    if (error) throw error;
    setLogs((prev) => [data as WorkoutLog, ...prev]);
    return data as WorkoutLog;
  };

  return createElement(
    WorkoutLogsContext.Provider,
    { value: { logs, loading, save, reload: load } },
    children,
  );
};

export const useWorkoutLogs = () => {
  const ctx = useContext(WorkoutLogsContext);
  if (!ctx) throw new Error("useWorkoutLogs must be used within WorkoutLogsProvider");
  return ctx;
};
