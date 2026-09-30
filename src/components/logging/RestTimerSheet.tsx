import { useCallback, useRef, useState } from "react";
import { Check } from "lucide-react";
import { CTAButton } from "@/components/GoldButton";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  MAX_REST_SECONDS,
  MIN_REST_SECONDS,
  REST_PRESETS,
  chooseRest,
  nudgeRestDraft,
  restDraftFrom,
  restPrefsFrom,
  type RestChoice,
  type RestTimerPrefs,
} from "@/lib/restTimerPrefs";
import { formatRestClock } from "@/lib/sessionFocus";
import { nearestScrollTop } from "@/lib/sessionScroll";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The saved setting — what the sheet shows checked when it opens. */
  prefs: RestTimerPrefs;
  /** Save was tapped: keep this setting (the logger closes the sheet). */
  onSave: (next: RestTimerPrefs) => void;
};

const CHOICES: readonly RestChoice[] = ["off", ...REST_PRESETS, "custom"];

// A stepper at its limit is aria-disabled, not disabled: a disabled
// button drops the keyboard focus it holds out of the sheet.
/** Scroll the list, if it has to, until `first`..`last` (rows or the
    stepper inside it) are in view. */
const showInList = (list: HTMLElement, first: Element, last: Element, smooth: boolean): void => {
  const band = list.getBoundingClientRect();
  const top = nearestScrollTop({
    scrollTop: list.scrollTop,
    top: first.getBoundingClientRect().top,
    bottom: last.getBoundingClientRect().bottom,
    from: band.top,
    to: band.bottom,
  });
  if (top === list.scrollTop) return;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  list.scrollTo({ top, behavior: smooth && !calm ? "smooth" : "instant" });
};

const stepClass =
  "inline-flex h-11 w-[4.75rem] min-w-[64px] shrink items-center justify-center whitespace-nowrap rounded-full border border-border bg-background px-3 text-[13px] font-semibold text-fg transition active:scale-[0.97] aria-disabled:opacity-40 aria-disabled:active:scale-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/**
 * The rest timer setting: whether a rest countdown starts after each set,
 * and how long it runs. Reached from the session's ⋯ sheet, or by tapping
 * a running countdown.
 *
 * One list, like a settings screen: Off, the preset lengths, Custom — the
 * chosen row checked. Custom brings a ±15 s stepper for any length from
 * 0:15 to 10:00. A choice is only kept when Save is tapped; the X, a tap
 * outside or a swipe down close the sheet and change nothing, and it
 * opens on the saved setting every time (lib/restTimerPrefs, "sheet").
 *
 * The stepper's place is kept while another row is chosen, so choosing
 * Custom (the last row) shows it without moving the list: the sheet rises
 * from the bottom, and anything that grew it would slide the rows up
 * from under the thumb that had just tapped one.
 *
 * On a screen too short for the whole list (a 320-wide phone, larger
 * text) the list and stepper scroll between the title and a pinned Save.
 */
export const RestTimerSheet = ({ open, onOpenChange, prefs, onSave }: Props) => {
  const [draft, setDraft] = useState(() => restDraftFrom(prefs));
  // Every opening starts from the saved setting — a choice left unsaved
  // last time is gone. Adjusted during render, so it never shows stale.
  const [openedFor, setOpenedFor] = useState(open);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) setDraft(restDraftFrom(prefs));
  }

  const listRef = useRef<HTMLDivElement | null>(null);
  const stepperRef = useRef<HTMLDivElement | null>(null);
  // Each opening mounts the list afresh with the saved setting checked:
  // scroll it into view — Custom together with the stepper that holds its
  // length. Children's refs are attached before their parent's, so the
  // stepper's is set by now.
  const attachList = useCallback((el: HTMLDivElement | null) => {
    listRef.current = el;
    const checked = el?.querySelector('[role="radio"][aria-checked="true"]');
    if (!el || !checked) return;
    const stepper = stepperRef.current;
    const withStepper = stepper !== null && !stepper.hasAttribute("aria-hidden");
    showInList(el, checked, withStepper ? stepper : checked, false);
  }, []);

  const custom = draft.choice === "custom";
  const atMin = draft.seconds <= MIN_REST_SECONDS;
  const atMax = draft.seconds >= MAX_REST_SECONDS;
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-5 pb-[calc(var(--safe-bottom)+1.25rem)]">
        <DrawerTitle className="mt-3 shrink-0 pr-12 text-[17px] font-semibold leading-6 tracking-tight text-fg">
          Rest timer
        </DrawerTitle>
        <DrawerDescription className="mt-0.5 shrink-0 text-[13px] leading-5 text-fg-muted">
          Starts after each set, until the exercise is done.
        </DrawerDescription>

        {/* The one scroller, with Save pinned under it — a row cut off by
            a short screen scrolls into reach instead of out of it. Marked
            no-drag so scrolling it never half-dismisses the sheet; the
            title, grabber, X and backdrop still close it. */}
        <div
          ref={attachList}
          data-vaul-no-drag
          className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pb-1"
        >
          <div
            role="radiogroup"
            aria-label="Rest between sets"
            className="divide-y divide-border overflow-hidden rounded-[16px] border border-border bg-card"
          >
            {CHOICES.map((choice) => {
              const chosen = draft.choice === choice;
              return (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  onClick={(event) => {
                    setDraft((current) => chooseRest(current, choice));
                    // Custom's length is set under the list: on a short
                    // screen, bring it up with the row that asked for it.
                    const list = listRef.current;
                    const stepper = stepperRef.current;
                    if (choice === "custom" && list && stepper) {
                      showInList(list, event.currentTarget, stepper, true);
                    }
                  }}
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-4 text-left text-[15px] font-medium text-fg transition-colors active:bg-foreground/[0.05] focus:outline-none focus-visible:bg-foreground/[0.05]"
                >
                  {typeof choice === "number" ? (
                    <span className="mono tabular-nums">{formatRestClock(choice)}</span>
                  ) : (
                    <span>{choice === "off" ? "Off" : "Custom"}</span>
                  )}
                  {chosen && <Check aria-hidden size={18} strokeWidth={2.5} className="shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>

          {/* Custom's length, 15 seconds a tap. Its place is kept (invisible)
              while another row is chosen — see the note above. */}
          <div
            ref={stepperRef}
            aria-hidden={custom ? undefined : true}
            className={cn(
              "mt-2 flex items-center justify-between gap-3 rounded-[16px] border border-border bg-card p-1.5",
              !custom && "invisible",
            )}
          >
            <button
              type="button"
              aria-label="15 seconds shorter"
              aria-disabled={atMin ? true : undefined}
              tabIndex={custom ? undefined : -1}
              onClick={() => {
                if (!atMin) setDraft((current) => nudgeRestDraft(current, -1));
              }}
              className={stepClass}
            >
              −15 s
            </button>
            <p
              aria-live="polite"
              aria-label={`Rest length ${formatRestClock(draft.seconds)}`}
              className="stat-scoreboard text-[28px] leading-none text-fg"
            >
              {formatRestClock(draft.seconds)}
            </p>
            <button
              type="button"
              aria-label="15 seconds longer"
              aria-disabled={atMax ? true : undefined}
              tabIndex={custom ? undefined : -1}
              onClick={() => {
                if (!atMax) setDraft((current) => nudgeRestDraft(current, 1));
              }}
              className={stepClass}
            >
              +15 s
            </button>
          </div>
        </div>

        <CTAButton
          variant="accent"
          fullWidth
          className="mt-4 shrink-0"
          onClick={() => onSave(restPrefsFrom(draft))}
        >
          Save
        </CTAButton>
      </DrawerContent>
    </Drawer>
  );
};
