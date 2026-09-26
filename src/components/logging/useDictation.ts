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

// Jarvis-style: a short pause hands the caller EVERYTHING said so far (the
// cumulative transcript), the mic stays open, and the next pause hands over
// the longer version — the caller supersedes what it built from the last
// one. Cumulative, not chunked: recognizers revise earlier words, so
// diffing "what's new" produced duplicate rows on a real iPhone. The
// session closes on its own once a longer silence passes.
const SILENCE_FIRE_MS = 2000; // pause → emit the new chunk, keep listening
const LATE_GRACE_MS = 8000; // no more speech for this long → close the mic
const EMPTY_CANCEL_MS = 8000;
const HARD_CAP_MS = 180_000; // native chains segments; this is the safety net

export type DictationState =
  | { at: "idle" }
  | { at: "starting" }
  | { at: "listening"; partial: string }
  | { at: "blocked"; reason: string };

export const useDictation = (
  onTranscript: (transcript: string, sessionId: number) => void,
) => {
  const [state, setState] = useState<DictationState>({ at: "idle" });
  const active = useRef(false);
  const partialRef = useRef<PluginListenerHandle | null>(null);
  const errorRef = useRef<PluginListenerHandle | null>(null);
  const watchdog = useRef(0);
  const last = useRef("");
  const longest = useRef("");
  const lastChangeAt = useRef(0);
  const startedAt = useRef(0);
  // The transcript last handed to the caller; only a changed one re-emits.
  const emitted = useRef("");
  // Bumped per tap-to-start so the caller can tell a new dictation from a
  // revision of the current one.
  const sessionId = useRef(0);
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

  /** Hand the caller the whole transcript so far. */
  const emit = (transcript: string): void => {
    const text = transcript.trim();
    if (text === emitted.current) return;
    emitted.current = text;
    voiceDiag(`dictation: emit #${sessionId.current} (${text.length} chars)`);
    if (text.length >= 3) onTranscriptRef.current(text, sessionId.current);
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
    emit(transcript);
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
    sessionId.current += 1;
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
      else if (heard && unemitted && idle >= SILENCE_FIRE_MS) emit(current);
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
