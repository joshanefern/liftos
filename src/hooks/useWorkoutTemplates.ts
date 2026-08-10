import { supabase } from "@/lib/supabase";
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
  save: (template: { id: string | null; name: string; exercises: WorkoutExercise[] }) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const WorkoutTemplatesContext = createContext<WorkoutTemplatesContextValue | null>(null);

export const WorkoutTemplatesProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useUser();
  const [templates, setTemplates] = useState<SupabaseTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("workout_templates")
      .select("id, name, exercises, created_at")
      .order("created_at", { ascending: false });
    setTemplates((data as SupabaseTemplate[]) ?? []);
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
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
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
    await supabase.from("workout_templates").delete().eq("id", id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  return createElement(
    WorkoutTemplatesContext.Provider,
    { value: { templates, loading, save, remove } },
    children,
  );
};

export const useWorkoutTemplates = () => {
  const ctx = useContext(WorkoutTemplatesContext);
  if (!ctx) throw new Error("useWorkoutTemplates must be used within WorkoutTemplatesProvider");
  return ctx;
};
