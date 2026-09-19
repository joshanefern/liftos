import { Capacitor } from "@capacitor/core";

/* ── The app's haptic vocabulary — a handful of semantic patterns, never a
     buzz on every touch (research: haptics on every interaction reads as
     noise; a few consistent ones read as craft). Native-gated dynamic
     imports; every call is fire-and-forget and silently no-ops on web. ──
     1. Set logged / primary CTA → light tick          (tapHaptic)
     2. Tab or segment switch    → selection tick      (selectionHaptic)
     3. Rest almost over         → medium nudge        (warnHaptic, 10s mark)
     4. Rest complete            → existing pulse in useRestTimer
     5. Session finished         → success notification (successHaptic)   */

export const tapHaptic = (): void => {
  if (!Capacitor.isNativePlatform()) return;
  void import("@capacitor/haptics")
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: ImpactStyle.Light }))
    .catch(() => {});
};

/* The iOS selection tick — a notch lighter than a Light impact, the feel of
   a segmented control or tab switching under the thumb. UISelectionFeedback
   needs its generator prepared: start → changed → end, or nothing fires. */
export const selectionHaptic = (): void => {
  if (!Capacitor.isNativePlatform()) return;
  void import("@capacitor/haptics")
    .then(async ({ Haptics }) => {
      await Haptics.selectionStart();
      await Haptics.selectionChanged();
      await Haptics.selectionEnd();
    })
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
