import { useEffect, useState } from "react";
import { HeartPulse, Watch } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { fetchVitalsWindow, healthKitSupported, type VitalsWindow } from "@/lib/healthkit";

/* ── Live vitals for a cardio block (Pro).
   Heart rate and active calories from Apple Health for this session's
   window — the Watch writes HR every few seconds during a Watch workout,
   so the sheet refreshes every 15s while open. Reads only; nothing here
   changes the log. ── */

const REFRESH_MS = 15_000;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciseName: string;
  /** Session start — the window the numbers cover. */
  sinceMs: number;
};

/** A minimal HR trace: last ~120 samples, scaled into a 240×56 box. */
const Sparkline = ({ samples }: { samples: { t: number; bpm: number }[] }) => {
  const pts = samples.slice(-120);
  if (pts.length < 2) return null;
  const lo = Math.min(...pts.map((p) => p.bpm));
  const hi = Math.max(...pts.map((p) => p.bpm));
  const span = Math.max(hi - lo, 10);
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * 240;
      const y = 52 - ((p.bpm - lo) / span) * 48;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 240 56" className="mt-4 h-14 w-full" aria-hidden>
      <path d={d} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

export const CardioVitalsSheet = ({ open, onOpenChange, exerciseName, sinceMs }: Props) => {
  const [vitals, setVitals] = useState<VitalsWindow | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async (): Promise<void> => {
      setLoading(true);
      const next = await fetchVitalsWindow(sinceMs);
      if (!cancelled) {
        setVitals(next);
        setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [open, sinceMs]);

  const minutes = Math.max(1, Math.round((Date.now() - sinceMs) / 60_000));
  const hasHr = (vitals?.samples.length ?? 0) > 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-6 pb-[calc(2rem+var(--safe-bottom))]">
        <div className="flex items-center gap-2 pr-12">
          <p className="eyebrow !text-primary">Live vitals</p>
          <span className="rounded-full bg-primary/[0.12] px-2 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-primary">
            Pro
          </span>
        </div>
        <DrawerTitle className="heading-md mt-2 text-fg">{exerciseName}</DrawerTitle>
        <DrawerDescription className="mt-1 text-[13px] leading-5 text-fg-muted">
          Heart rate and calories from your watch, for the last {minutes} min of this session.
        </DrawerDescription>

        {!healthKitSupported() ? (
          <p className="body-md mt-6 text-fg-muted">Available in the iPhone app with Apple Health.</p>
        ) : hasHr ? (
          <>
            <div className="mt-6 flex items-end gap-3">
              <p className="stat-scoreboard text-[56px] leading-none text-fg">{vitals?.latest}</p>
              <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-primary">
                <HeartPulse size={16} className="animate-pulse" />
                bpm
              </p>
            </div>
            <Sparkline samples={vitals?.samples ?? []} />
            <div className="mt-5 grid grid-cols-3 gap-2.5">
              {[
                { value: vitals?.avg ?? "—", label: "avg bpm" },
                { value: vitals?.max ?? "—", label: "max bpm" },
                { value: vitals?.activeKcal ?? 0, label: "kcal burned" },
              ].map((tile) => (
                <div key={tile.label} className="rounded-[12px] bg-foreground/[0.04] px-3 py-3">
                  <p className="mono text-[20px] font-semibold text-fg">{tile.value}</p>
                  <p className="eyebrow mt-1 !text-[10px]">{tile.label}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-[14px] border border-dashed border-border px-4 py-5">
            <div className="flex items-center gap-2 text-fg">
              <Watch size={16} className="text-primary" />
              <p className="text-[14px] font-semibold">
                {loading ? "Reading your watch…" : "No heart rate yet"}
              </p>
            </div>
            {!loading && (
              <p className="mt-1.5 text-[13px] leading-5 text-fg-muted">
                Start any workout on your Apple Watch — it streams heart rate here every
                few seconds. Without a Watch workout, Health only samples every few minutes.
              </p>
            )}
            {vitals && vitals.activeKcal > 0 && (
              <p className="mt-3 text-[13px] text-fg-soft">
                <span className="mono font-semibold text-fg">{vitals.activeKcal}</span> kcal burned so far
              </p>
            )}
          </div>
        )}

        <p className="mt-5 text-[11px] text-fg-muted">
          Source: Apple Watch via Apple Health · refreshes every 15s
        </p>
      </DrawerContent>
    </Drawer>
  );
};
