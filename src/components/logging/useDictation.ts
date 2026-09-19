import { useEffect, useRef, useState } from "react";
import type { PluginListenerHandle } from "@capacitor/core";
import {
  cancelListening,
  ensureSpeechPermissions,
  onSpeechError,
  onSpeechPartial,
  speechSupported,
  startListening,
  stopListening,
  voiceDiag,
} from "@/lib/speech";
import { chooseTranscript, longerOf } from "@/lib/voiceTranscript";

/* ── Reusable tap-to-dictate.
   The same native session the logger's pill uses — live partials, a
   silence endpoint, the truncated-final guard — packaged so any screen
   (the workout builder, notes, the coach) can take a transcript without
   owning the voice UI. The caller decides what the words mean. ── */

// Jarvis-style: a short pause hands the caller what was said SO FAR (rows
// land immediately), the mic stays open, and more speech becomes the next
// chunk. The session closes on its own once a longer silence passes.
const SILENCE_FIRE_MS = 2000; // pause → emit the new chunk, keep listening
const LATE_GRACE_MS = 8000; // no more speech for this long → close the mic
const EMPTY_CANCEL_MS = 8000;
const HARD_CAP_MS = 180_000; // native chains segments; this is the safety net

export type DictationState =
  | { at: "idle" }
  | { at: "starting" }
  | { at: "listening"; partial: string }
  | { at: "blocked"; reason: string };

export const useDictation = (onTranscript: (transcript: string) => void) => {
  const [state, setState] = useState<DictationState>({ at: "idle" });
  const active = useRef(false);
  const partialRef = useRef<PluginListenerHandle | null>(null);
  const errorRef = useRef<PluginListenerHandle | null>(null);
  const watchdog = useRef(0);
  const last = useRef("");
  const longest = useRef("");
  const lastChangeAt = useRef(0);
  const startedAt = useRef(0);
  // Everything already handed to the caller — the next chunk is what
  // follows it. Recognizers revise earlier words, so prefer prefix-strip
  // and fall back to a length cut.
  const emitted = useRef("");
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  useEffect(
    () => () => {
      partialRef.current?.remove();
      errorRef.current?.remove();
      window.clearInterval(watchdog.current);
      void cancelListening().catch(() => {});
    },
    [],
  );

  const teardownListeners = (): void => {
    window.clearInterval(watchdog.current);
    partialRef.current?.remove();
    partialRef.current = null;
    errorRef.current?.remove();
    errorRef.current = null;
  };

  /** Hand the caller the words since the last emit. */
  const emitChunk = (transcript: string): void => {
    const prev = emitted.current;
    const chunk = (
      prev && transcript.startsWith(prev)
        ? transcript.slice(prev.length)
        : prev
          ? transcript.slice(Math.min(prev.length, transcript.length))
          : transcript
    ).trim();
    emitted.current = transcript;
    voiceDiag(`dictation: chunk (${chunk.length} chars, total ${transcript.length})`);
    if (chunk.length >= 3) onTranscriptRef.current(chunk);
  };

  const finish = async (): Promise<void> => {
    if (!active.current) return;
    active.current = false;
    let transcript = "";
    try {
      transcript = (await stopListening()).transcript.trim();
    } catch {
      /* the longest partial still counts */
    }
    teardownListeners();
    transcript = chooseTranscript(transcript, longerOf(last.current, longest.current));
    setState({ at: "idle" });
    if (transcript !== emitted.current) emitChunk(transcript);
  };

  const cancel = (): void => {
    active.current = false;
    teardownListeners();
    void cancelListening().catch(() => {});
    setState({ at: "idle" });
  };

  const start = async (): Promise<void> => {
    if (active.current) {
      void finish();
      return;
    }
    active.current = true;
    setState({ at: "starting" });
    voiceDiag("dictation: begin");
    const granted = await ensureSpeechPermissions();
    if (!granted) {
      active.current = false;
      setState({
        at: "blocked",
        reason: "Microphone or Speech Recognition is off for LiftOS — allow both in iOS Settings.",
      });
      return;
    }
    last.current = "";
    longest.current = "";
    emitted.current = "";
    startedAt.current = Date.now();
    lastChangeAt.current = Date.now();
    setState({ at: "listening", partial: "" });
    partialRef.current = await onSpeechPartial((t) => {
      if (t !== last.current) {
        last.current = t;
        longest.current = longerOf(t, longest.current);
        lastChangeAt.current = Date.now();
      }
      setState((cur) => (cur.at === "listening" ? { at: "listening", partial: t } : cur));
    });
    errorRef.current = await onSpeechError(() => {
      if (!active.current) return;
      if (last.current.trim().length >= 3) void finish();
      else cancel();
    });
    watchdog.current = window.setInterval(() => {
      if (!active.current) return;
      const idle = Date.now() - lastChangeAt.current;
      const total = Date.now() - startedAt.current;
      const current = longerOf(last.current, longest.current).trim();
      const heard = current.length >= 3;
      const unemitted = current !== emitted.current;
      if (total >= HARD_CAP_MS) void finish();
      else if (heard && unemitted && idle >= SILENCE_FIRE_MS) emitChunk(current);
      else if (heard && !unemitted && idle >= SILENCE_FIRE_MS + LATE_GRACE_MS) void finish();
      else if (!heard && total >= EMPTY_CANCEL_MS) cancel();
    }, 250);
    try {
      await startListening([]);
    } catch (err) {
      active.current = false;
      teardownListeners();
      setState({
        at: "blocked",
        reason: `Voice couldn’t start (${err instanceof Error ? err.message : String(err)}).`,
      });
    }
  };

  return { state, start, cancel, supported: speechSupported() };
};
