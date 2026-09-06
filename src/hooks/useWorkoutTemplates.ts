import { supabase } from "@/lib/supabase";

/** Saved-workout cap. Quick-start sessions and the calendar log are
    unlimited — only the SAVED library is bounded. */
export const MAX_TEMPLATES = 7;
export const TEMPLATE_LIMIT_ERROR = "TEMPLATE_LIMIT";
import { useUser } from "@/context/UserContext";
import type { WorkoutExercise } from "@/data/liftosMock";
import { createContext, createElement, useCallback, useContext, useEffect, useState } from "react";

export type SupabaseTemplate = {
  id: string;
  name: string;
  exercises: WorkoutExercise[];
  created_at: string;
};

type WorkoutTemplatesContextValue = {
  templates: SupabaseTemplate[];
  loading: boolean;
  /** Last load attempt failed — an empty library must not read as new. */
  loadFailed: boolean;
  save: (template: { id: string | null; name: string; exercises: WorkoutExercise[] }) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const WorkoutTemplatesContext = createContext<WorkoutTemplatesContextValue | null>(null);

export const WorkoutTemplatesProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useUser();
  const [templates, setTemplates] = useState<SupabaseTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("workout_templates")
      .select("id, name, exercises, created_at")
      .order("created_at", { ascending: false });
    // A failed reload keeps the stale cache — blanking the library to the
    // "No saved workouts yet" state on a network hiccup reads as data loss.
    if (data) setTemplates(data as SupabaseTemplate[]);
    setLoadFailed(!data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    load();
  }, [user, load]);

  const save = async (template: { id: string | null; name: string; exercises: WorkoutExercise[] }) => {
    // Cached session + throw on absence — a silent return here made offline
    // saves toast success while writing nothing.
    const { data: { session } } = await supabase.auth.getSession();
    const authUser = session?.user;
    if (!authUser) throw new Error("no authenticated session");
    if (!template.id) {
      // Hard cap on SAVED workouts — a library of 100 half-workouts is
      // noise, and every list in the app assumes a scannable handful.
      // Updates are always allowed; only net-new saves count.
      const { count } = await supabase
        .from("workout_templates")
        .select("id", { count: "exact", head: true });
      if ((count ?? 0) >= MAX_TEMPLATES) throw new Error(TEMPLATE_LIMIT_ERROR);
    }
    if (template.id) {
      const { error } = await supabase
        .from("workout_templates")
        .update({ name: template.name, exercises: template.exercises, updated_at: new Date().toISOString() })
        .eq("id", template.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("workout_templates")
        .insert({ name: template.name, exercises: template.exercises, user_id: authUser.id });
      if (error) throw error;
    }
    await load();
  };

  const remove = async (id: string) => {
    // Throw on failure BEFORE touching local state — otherwise the row
    // vanishes from the UI and resurrects on next launch.
    const { error } = await supabase.from("workout_templates").delete().eq("id", id);
    if (error) throw error;
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  return createElement(
    WorkoutTemplatesContext.Provider,
    { value: { templates, loading, loadFailed, save, remove } },
    children,
  );
};

export const useWorkoutTemplates = () => {
  const ctx = useContext(WorkoutTemplatesContext);
  if (!ctx) throw new Error("useWorkoutTemplates must be used within WorkoutTemplatesProvider");
  return ctx;
};
