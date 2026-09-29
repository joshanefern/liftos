import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Switch } from "@/components/ui/switch";
import {
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
  REST_PRESETS,
  nudgeRestSeconds,
  type RestTimerPrefs,
} from "@/lib/restTimerPrefs";
import { formatRestClock } from "@/lib/sessionFocus";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: RestTimerPrefs;
  /** Every change applies — and is remembered — the moment it is made. */
  onChange: (next: RestTimerPrefs) => void;
};

// A stepper at its limit is aria-disabled, not disabled: a disabled
// button drops the keyboard focus it holds out of the sheet. It gives way
// (down to 64px) before it would push past its card on a narrow phone.
const stepClass =
  "inline-flex h-11 w-[4.75rem] min-w-[64px] shrink items-center justify-center whitespace-nowrap rounded-full border border-border bg-background px-3 text-[13px] font-semibold text-fg transition active:scale-[0.97] aria-disabled:opacity-40 aria-disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/**
 * The rest timer setting: whether a rest countdown starts after each set,
 * and how long it runs. Reached from the session's ⋯ sheet, or by tapping
 * a running countdown.
 *
 * No Save: a switch and a length are both answers the moment they are
 * tapped, so they apply at once and are remembered from then on.
 *
 * The sheet keeps one height. With the timer off the length choices stay
 * where they are, dimmed and out of reach, rather than leaving: the sheet
 * rises from the bottom, so choices that came and went with the switch
 * moved it out from under the thumb that had just tapped it.
 */
export const RestTimerSheet = ({ open, onOpenChange, prefs, onChange }: Props) => {
  const off = !prefs.on;
  const atMin = prefs.seconds <= MIN_REST_SECONDS;
  const atMax = prefs.seconds >= MAX_REST_SECONDS;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-5 pb-[calc(var(--safe-bottom)+1.5rem)]">
        <DrawerTitle className="mt-3 pr-12 text-[17px] font-semibold leading-6 tracking-tight text-fg">
          Rest timer
        </DrawerTitle>
        <DrawerDescription className="sr-only">
          Choose whether a rest countdown starts after each set, and how long it runs.
        </DrawerDescription>

        {/* The whole row toggles, so the switch's hit area is the row. */}
        <label
          htmlFor="rest-timer-switch"
          className="mt-4 flex min-h-[64px] cursor-pointer items-center justify-between gap-4 rounded-[16px] border border-border bg-card px-5 py-3"
        >
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-fg">Rest between sets</span>
            <span className="mt-0.5 block text-balance text-[12px] leading-4 text-fg-muted">
              Starts after each set, until the exercise is done.
            </span>
          </span>
          <Switch
            id="rest-timer-switch"
            checked={prefs.on}
            onCheckedChange={(on) => onChange({ ...prefs, on })}
          />
        </label>

        <div
          aria-hidden={off ? true : undefined}
          className={cn("mt-5 transition-opacity", off && "opacity-40")}
        >
          <p id="rest-length-label" className="eyebrow mb-2 px-1">
            Length
          </p>
          <div role="group" aria-labelledby="rest-length-label" className="grid grid-cols-3 gap-2">
            {REST_PRESETS.map((seconds) => {
              const chosen = prefs.seconds === seconds;
              return (
                <button
                  key={seconds}
                  type="button"
                  aria-pressed={chosen}
                  disabled={off}
                  tabIndex={off ? -1 : undefined}
                  onClick={() => onChange({ ...prefs, seconds })}
                  className={cn(
                    "mono inline-flex min-h-11 items-center justify-center rounded-[12px] border text-[15px] font-semibold tabular-nums transition active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                    chosen
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-fg hover:border-fg-soft",
                  )}
                >
                  {formatRestClock(seconds)}
                </button>
              );
            })}
          </div>

          {/* Fine-tune: any length from 0:15 to 10:00, 15 seconds a tap. */}
          <div className="mt-3 flex items-center justify-between gap-3 rounded-[16px] border border-border bg-card p-2">
            <button
              type="button"
              aria-label="15 seconds shorter"
              aria-disabled={atMin ? true : undefined}
              disabled={off}
              tabIndex={off ? -1 : undefined}
              onClick={() => {
                if (!atMin) onChange({ ...prefs, seconds: nudgeRestSeconds(prefs.seconds, -1) });
              }}
              className={stepClass}
            >
              −15 s
            </button>
            <p
              aria-live="polite"
              aria-label={`Rest length ${formatRestClock(prefs.seconds)}`}
              className="stat-scoreboard text-[30px] leading-none text-fg"
            >
              {formatRestClock(prefs.seconds)}
            </p>
            <button
              type="button"
              aria-label="15 seconds longer"
              aria-disabled={atMax ? true : undefined}
              disabled={off}
              tabIndex={off ? -1 : undefined}
              onClick={() => {
                if (!atMax) onChange({ ...prefs, seconds: nudgeRestSeconds(prefs.seconds, 1) });
              }}
              className={stepClass}
            >
              +15 s
            </button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
};
