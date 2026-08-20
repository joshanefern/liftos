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
    // Page through EVERYTHING: all-time PRs and trends computed over a
    // "newest 200" window silently regress records once history outgrows
    // it. Pages of 500, with a 10k-log sanity ceiling (~50 years of daily
    // training) so a runaway account can't hang the boot.
    const PAGE = 500;
    const MAX_LOGS = 10_000;
    const all: WorkoutLog[] = [];
    for (let from = 0; from < MAX_LOGS; from += PAGE) {
      const { data, error } = await supabase
        .from("workout_logs")
        .select("*")
        .order("finished_at", { ascending: false })
        .range(from, from + PAGE - 1);
      // A failed page keeps the stale cache — blanking every screen to the
      // empty state on a network hiccup would read as data loss.
      if (error || !data) {
        if (all.length === 0) {
          setLoading(false);
          return;
        }
        break;
      }
      all.push(...(data as WorkoutLog[]));
      if (data.length < PAGE) break;
    }
    setLogs(all);
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
    // Cached session, no network round-trip — and THROW when it's absent.
    // Returning null here once made a gym-dead-spot finish read as success:
    // the logger cleared its local backup and the whole workout vanished.
    // Throwing routes into the caller's catch (toast + progress preserved).
    const { data: { session } } = await supabase.auth.getSession();
    const authUser = session?.user;
    if (!authUser) throw new Error("no authenticated session");
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
