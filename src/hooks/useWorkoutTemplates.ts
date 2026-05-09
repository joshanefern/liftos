import { supabase } from "@/lib/supabase";
import type { WorkoutExercise } from "@/data/liftosMock";
import { useCallback, useEffect, useState } from "react";

export type SupabaseTemplate = {
  id: string;
  name: string;
  exercises: WorkoutExercise[];
  created_at: string;
};

export const useWorkoutTemplates = () => {
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
    load();
  }, [load]);

  const save = async (template: { id: string | null; name: string; exercises: WorkoutExercise[] }) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (template.id) {
      const { error } = await supabase
        .from("workout_templates")
        .update({ name: template.name, exercises: template.exercises, updated_at: new Date().toISOString() })
        .eq("id", template.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("workout_templates")
        .insert({ name: template.name, exercises: template.exercises, user_id: user.id });
      if (error) throw error;
    }
    await load();
  };

  const remove = async (id: string) => {
    await supabase.from("workout_templates").delete().eq("id", id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  return { templates, loading, save, remove };
};
