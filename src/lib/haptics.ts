import { Capacitor } from "@capacitor/core";

/* ── The app's four haptic moments — and only these (research: haptics on
     every interaction reads as noise; four semantic patterns read as
     craft). Native-gated dynamic imports; every call is fire-and-forget
     and silently no-ops on web. ──
     1. Set logged        → light tick        (tapHaptic)
     2. Rest almost over  → medium nudge      (warnHaptic, 10s mark)
     3. Rest complete     → existing pulse in useRestTimer
     4. Session finished  → success notification (successHaptic)          */

export const tapHaptic = (): void => {
  if (!Capacitor.isNativePlatform()) return;
  void import("@capacitor/haptics")
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => {});
};

export const warnHaptic = (): void => {
  if (!Capacitor.isNativePlatform()) return;
  void import("@capacitor/haptics")
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Medium }))
    .catch(() => {});
};

export const successHaptic = (): void => {
  if (!Capacitor.isNativePlatform()) return;
  void import("@capacitor/haptics")
    .then(({ Haptics, NotificationType }) =>
      Haptics.notification({ type: NotificationType.Success }),
    )
    .catch(() => {});
};
