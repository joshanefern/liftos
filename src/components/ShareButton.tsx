import { useState } from "react";
import { Share2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useTheme } from "@/context/ThemeContext";
import type { MuscleActivation } from "@/lib/muscleMap";
import { renderShareCard, type ShareCardSession } from "@/lib/shareCard";

type Props = {
  log: ShareCardSession;
  activations?: MuscleActivation[];
  prCount?: number;
  className?: string;
};

const successHaptic = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, NotificationType } = await import("@capacitor/haptics");
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    /* plugin unavailable — ignore */
  }
};

/* Quiet pill — deliberately terracotta-free so it never competes with
   the screen's one accent CTA. */
export const ShareButton = ({ log, activations, prCount, className = "" }: Props) => {
  const { isDark } = useTheme();
  const [busy, setBusy] = useState(false);

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const blob = await renderShareCard({ log, activations, prCount, dark: isDark });
      const file = new File([blob], "liftos-session.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: log.name });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "liftos-session.png";
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
      void successHaptic();
    } catch (err) {
      // User backing out of the share sheet is not an error
      if ((err as DOMException)?.name !== "AbortError") {
        console.error("share card failed", err);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      aria-label="Share session"
      className={
        `inline-flex items-center gap-2 rounded-full border border-border bg-transparent ` +
        `px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-fg-soft ` +
        `transition-opacity duration-150 hover:opacity-80 active:scale-[0.98] ` +
        `disabled:cursor-not-allowed disabled:opacity-50 ${className}`.trim()
      }
    >
      <Share2 size={13} strokeWidth={2} />
      Share
    </button>
  );
};
