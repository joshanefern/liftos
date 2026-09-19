import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";

/* ── Native dictation bridge (ios/App/App/SpeechPlugin.swift).
   Tap-to-speak: startListening begins a session, stopListening resolves
   with the final transcript; partials stream via "speechPartial" for the
   live overlay, and a recognizer that dies mid-listen emits "speechError"
   instead of going silent. ── */

interface SpeechPluginIface {
  isAvailable(): Promise<{ available: boolean; onDevice: boolean }>;
  requestSpeechPermissions(): Promise<{ speech: boolean; microphone: boolean }>;
  startListening(options: { contextualStrings?: string[] }): Promise<{ started: boolean }>;
  stopListening(): Promise<{ transcript: string }>;
  cancelListening(): Promise<void>;
  logDiag(options: { line: string }): Promise<void>;
  readDiag(): Promise<{ text: string }>;
  addListener(
    eventName: "speechPartial",
    listener: (data: { transcript: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "speechError",
    listener: (data: { message: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const Speech = registerPlugin<SpeechPluginIface>("Speech");

/** Voice logging is iOS-native only (SFSpeechRecognizer). The DEV escape
    hatch renders the pill in a browser so layout can be QA'd without a
    simulator — STT itself still needs the device. */
export const speechSupported = (): boolean =>
  (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") ||
  (import.meta.env.DEV && window.localStorage.getItem("liftos-voice-dev") === "1");

let permissionsGranted: boolean | null = null;

/** One breadcrumb, two sinks: the JS console and the native diag file
    (Documents/voice-diag.log) that `devicectl device copy from` can pull
    off a physical iPhone — console streaming from a device is unreliable. */
export const voiceDiag = (line: string): void => {
  console.log(`[voice] ${line}`);
  if (Capacitor.isNativePlatform()) {
    Speech.logDiag({ line }).catch(() => {});
  }
};

/** The whole native diag file — surfaced in-app for screenshot support. */
export const readVoiceDiag = async (): Promise<string> => {
  if (!Capacitor.isNativePlatform()) return "";
  try {
    return (await Speech.readDiag()).text;
  } catch (err) {
    return `readDiag failed: ${err instanceof Error ? err.message : String(err)}`;
  }
};

/** Ask once per app boot; iOS shows each sheet only the first time ever.
    Every outcome logs — these breadcrumbs surface in a captured native
    console and are the fastest route to "why did voice do nothing". */
export const ensureSpeechPermissions = async (): Promise<boolean> => {
  if (!speechSupported()) return false;
  if (permissionsGranted !== null) return permissionsGranted;
  try {
    const result = await Speech.requestSpeechPermissions();
    permissionsGranted = result.speech && result.microphone;
    voiceDiag(`permissions: speech=${result.speech} microphone=${result.microphone}`);
  } catch (err) {
    permissionsGranted = false;
    voiceDiag(`permission request FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
  return permissionsGranted;
};

export const startListening = (contextualStrings: string[]): Promise<{ started: boolean }> =>
  Speech.startListening({ contextualStrings });

export const stopListening = (): Promise<{ transcript: string }> => Speech.stopListening();

export const cancelListening = (): Promise<void> => Speech.cancelListening();

export const onSpeechPartial = (
  listener: (transcript: string) => void,
): Promise<PluginListenerHandle> =>
  Speech.addListener("speechPartial", (data) => listener(data.transcript ?? ""));

export const onSpeechError = (
  listener: (message: string) => void,
): Promise<PluginListenerHandle> =>
  Speech.addListener("speechError", (data) => listener(data.message ?? ""));
