import { useUser } from "@/context/UserContext";
import { normalizeExerciseName } from "@/lib/prs";
import { supabase } from "@/lib/supabase";
import { useCallback, useEffect, useState } from "react";

/* ── Pinned exercise notes — one persistent note per exercise name, pinned
     to the top of that exercise's logging card every session (seat heights,
     grip widths, cues). Cross-device via exercise_notes (RLS: own rows).
     Saves are optimistic: the note sticks in the UI immediately and the
     upsert follows; a failed write just means the next load shows the old
     note — never a blocked workout. ── */

export const useExerciseNotes = () => {
  const { user } = useUser();
  const [notes, setNotes] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!user) {
      setNotes(new Map());
      return;
    }
    let cancelled = false;
    supabase
      .from("exercise_notes")
      .select("exercise_key, note")
      .then(({ data }) => {
        if (cancelled || !data) return;
        setNotes(new Map(data.map((r) => [r.exercise_key as string, r.note as string])));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const noteFor = useCallback(
    (exerciseName: string): string | null =>
      notes.get(normalizeExerciseName(exerciseName)) ?? null,
    [notes],
  );

  /** Save (or clear, with an empty string) the pinned note for an exercise. */
  const saveNote = useCallback(async (exerciseName: string, note: string) => {
    const key = normalizeExerciseName(exerciseName);
    if (!key) return;
    const trimmed = note.trim().slice(0, 2000);
    setNotes((current) => {
      const next = new Map(current);
      if (trimmed) next.set(key, trimmed);
      else next.delete(key);
      return next;
    });
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return;
    if (trimmed) {
      await supabase
        .from("exercise_notes")
        .upsert(
          { user_id: authUser.id, exercise_key: key, note: trimmed, updated_at: new Date().toISOString() },
          { onConflict: "user_id,exercise_key" },
        );
    } else {
      await supabase.from("exercise_notes").delete().eq("exercise_key", key);
    }
  }, []);

  return { noteFor, saveNote };
};
