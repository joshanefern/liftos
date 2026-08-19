import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";

/* ── Native dictation bridge (ios/App/App/SpeechPlugin.swift).
   Press-and-hold: startListening on pointer-down, stopListening on
   release resolves with the final transcript; partials stream via the
   "speechPartial" event for the live overlay. ── */

type SpeechPluginIface = {
  isAvailable(): Promise<{ available: boolean; onDevice: boolean }>;
  requestSpeechPermissions(): Promise<{ speech: boolean; microphone: boolean }>;
  startListening(options: { contextualStrings?: string[] }): Promise<{ started: boolean }>;
  stopListening(): Promise<{ transcript: string }>;
  cancelListening(): Promise<void>;
  addListener(
    eventName: "speechPartial",
    listener: (data: { transcript: string }) => void,
  ): Promise<PluginListenerHandle>;
};

const Speech = registerPlugin<SpeechPluginIface>("Speech");

/** Voice logging is iOS-native only (SFSpeechRecognizer). */
export const speechSupported = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

let permissionsGranted: boolean | null = null;

/** Ask once per app boot; iOS shows each sheet only the first time ever. */
export const ensureSpeechPermissions = async (): Promise<boolean> => {
  if (!speechSupported()) return false;
  if (permissionsGranted !== null) return permissionsGranted;
  try {
    const result = await Speech.requestSpeechPermissions();
    permissionsGranted = result.speech && result.microphone;
  } catch {
    permissionsGranted = false;
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
