import { supabase } from "@/lib/supabase";
import type { VoiceIntent } from "@/lib/voiceApply";

/* ── Interpreter client. The voice-log edge function sees ONLY the
   transcript, the session's exercise names (+ tracking) and units —
   nothing else leaves the device. ── */

export type SessionExerciseRef = { name: string; tracking: "reps" | "time" };

export const interpretUtterance = async (
  transcript: string,
  exercises: SessionExerciseRef[],
  units: string,
): Promise<VoiceIntent> => {
  const { data, error } = await supabase.functions.invoke("voice-log", {
    body: { transcript, exercises, units },
  });
  if (error) throw error;
  const intent = data as VoiceIntent;
  if (!intent || !["sets", "note", "both", "unclear"].includes(intent.kind)) {
    return { kind: "unclear", note: null, actions: [], confidence: 0 };
  }
  return intent;
};
