import AuthLayout from "@/pages/auth/AuthLayout";
import { CTAButton } from "@/components/GoldButton";
import {
  EMPTY_ANSWERS,
  ONBOARDING_STEPS,
  OPTION_CAPTIONS,
  OPTION_LABELS,
  buildProfileRow,
  type OnboardingAnswers,
} from "@/components/auth/onboardingSteps";
import { connectHealthKit, healthKitSupported } from "@/lib/healthkit";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";
import { Check, ChevronRight, Heart } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";

/* ── One card, one size, for the whole flow. The heading, the progress bar
   and Back / Next hold the same place on screen at every step; only the
   options between them change. Nothing here is a fixed pixel height —
   every step's heading and every step's options are laid into the same
   grid cell, hidden, so the tallest one sets the space and the rest sit
   inside it. When the screen is a little too short for that (the layout
   caps the card at the space the page has), the options region is the one
   part that gives way, and it scrolls. On a much shorter screen the layout
   drops the cap, the card keeps this full height, and the page scrolls. ── */

const WEARABLE_HEADING = "Connect a wearable?";

/* How much of a step may sit below the options region before the region
   says so. Under this, all that is cut is the bottom edge of the last
   option, and that option is its own cue. */
const MORE_BELOW_PX = 12;

const STACKED = "[grid-area:1/1]";

/* One step smaller than heading-lg from md up: at that size every question
   fits the card on one line, so the space reserved for the longest heading
   is never an empty second line under a short one. */
const HEADING =
  "text-xl font-semibold leading-[1.15] tracking-tight text-fg md:text-2xl md:leading-[1.15]";

const ROW_BOX =
  "flex w-full items-center justify-between gap-3 rounded-[14px] border p-4 text-left";

/* Inset, because the options region clips at its edges: a ring drawn
   outside the row would lose its sides. */
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40";

const OptionRowContent = ({
  option,
  active,
  multi,
}: {
  option: string;
  active: boolean;
  multi: boolean;
}) => {
  const caption = OPTION_CAPTIONS[option];
  return (
    <>
      <span className="shrink-0 text-sm font-medium">{OPTION_LABELS[option] ?? option}</span>
      <span className="flex min-w-0 items-center gap-3">
        {caption && <span className="min-w-0 text-right text-xs text-fg-muted">{caption}</span>}
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center transition-all duration-200 ${
            multi ? "rounded-[0.35rem]" : "rounded-full"
          } ${
            active
              ? "bg-primary text-primary-foreground"
              : "border border-border bg-transparent"
          }`}
        >
          {active && <Check size={11} strokeWidth={2.5} />}
        </span>
      </span>
    </>
  );
};

const Onboarding = () => {
  const navigate = useNavigate();
  const { refreshProfile } = useUser();
  const [index, setIndex] = useState(0);
  const [hkConnecting, setHkConnecting] = useState(false);
  const [answers, setAnswers] = useState<OnboardingAnswers>(EMPTY_ANSWERS);
  // The optional wearable step only exists on iOS — Apple Health is the whole
  // capture story; the web has nothing to connect.
  const hasWearableStep = healthKitSupported();
  const totalSteps = ONBOARDING_STEPS.length + (hasWearableStep ? 1 : 0);
  const onWearableStep = hasWearableStep && index === ONBOARDING_STEPS.length;
  const step = onWearableStep ? null : ONBOARDING_STEPS[index];
  const lastQuestion = index === ONBOARDING_STEPS.length - 1;
  const progress = useMemo(
    () => Math.round(((index + 1) / totalSteps) * 100),
    [index, totalSteps],
  );
  const headings = useMemo(
    () => [...ONBOARDING_STEPS.map((s) => s.label), ...(hasWearableStep ? [WEARABLE_HEADING] : [])],
    [hasWearableStep],
  );

  const persistProfile = async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return true;
    const { error } = await supabase.from("profiles").upsert(buildProfileRow(user.id, answers));
    if (error) {
      toast({
        title: "Could not save preferences",
        description: error.message,
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const stepHasSelection = useMemo(() => {
    if (!step) return true; // wearable step is always passable
    const val = answers[step.key];
    return Array.isArray(val) ? val.length > 0 : val !== "";
  }, [answers, step]);

  const isActive = (option: string) => {
    if (!step) return false;
    const val = answers[step.key];
    return Array.isArray(val) ? val.includes(option) : val === option;
  };

  const handleSelect = (option: string) => {
    if (!step) return;
    if (step.key === "goal") {
      setAnswers((current) => {
        const next = current.goal.includes(option)
          ? current.goal.filter((v) => v !== option)
          : [...current.goal, option];
        return { ...current, goal: next.length ? next : [option] };
      });
    } else {
      setAnswers((current) => ({ ...current, [step.key]: option }));
    }
  };

  const hint = step?.multi ? "Select all that apply" : onWearableStep ? "Optional" : null;

  // A capped card can cut the options exactly between two rows, which reads
  // as the end of the list. Whether anything is below is only known from
  // the laid-out boxes, and it changes with the step (the scroller is
  // remounted for each one), the window, and the scroll position.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const measure = (): void =>
      setMoreBelow(
        scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight > MORE_BELOW_PX,
      );
    measure();
    scroller.addEventListener("scroll", measure, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", measure);
      observer?.disconnect();
    };
  }, [index]);

  // Where the card is taller than the screen (landscape) the page scrolls to
  // reach Next, and the next step would open at that offset — its question
  // and first option above the fold. Every step opens at the top.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [index]);

  return (
    <AuthLayout
      eyebrow="Onboarding"
      title="Personalize LiftOS around your actual training style."
      variant="onboarding"
    >
      <div className="shrink-0">
        {/* Fixed row height: the hint comes and goes, and its text is a
            different size from the step label. */}
        <div className="flex h-5 items-center justify-between gap-3">
          <p className="label-xs">Step {index + 1} of {totalSteps}</p>
          {hint && <p className="text-xs text-fg-muted">{hint}</p>}
        </div>
        <div className="mt-1.5 grid">
          {headings.map((heading, i) =>
            i === index ? (
              <h2 key={heading} className={`${HEADING} ${STACKED}`}>
                {heading}
              </h2>
            ) : (
              <p key={heading} aria-hidden className={`${HEADING} invisible ${STACKED}`}>
                {heading}
              </p>
            ),
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Onboarding progress"
          aria-valuemin={0}
          aria-valuemax={totalSteps}
          aria-valuenow={index + 1}
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* The options region. The hidden stack is in the flow and sets the
          height; the live step is laid over it and scrolls inside that box
          when the card has been capped shorter than the tallest step, under
          a fade for as long as options are still out of sight. The stand-in
          rows are plain divs — hidden buttons would still be buttons to
          anything that looks for one. */}
      <div className="relative mt-5 min-h-0 overflow-hidden">
        <div aria-hidden className="invisible grid">
          {ONBOARDING_STEPS.map((s) => (
            <div key={s.key} className={`space-y-2.5 ${STACKED}`}>
              {s.options.map((option) => (
                <div key={option} className={ROW_BOX}>
                  <OptionRowContent option={option} active={false} multi={s.multi} />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div
          key={index}
          ref={scrollerRef}
          className="absolute inset-0 overflow-y-auto overscroll-contain"
        >
          {onWearableStep ? (
            <div className="space-y-4">
              <p className="body-sm text-fg-soft">
                Wear your watch, lift, and confirm later — Apple Health pre-fills your review
                drafts with duration and heart rate; you just confirm.
              </p>
              {/* Apple Health — no account, no OAuth. Any watch that writes to
                  Health (Apple Watch, Garmin, Whoop, Oura…) flows through it. */}
              <button
                type="button"
                disabled={hkConnecting}
                onClick={async () => {
                  if (hkConnecting) return;
                  setHkConnecting(true);
                  try {
                    const result = await connectHealthKit();
                    // Pull the fresh healthkit_connected flag so the observer
                    // (useHealthKitAutoSync) starts this session, not next boot.
                    await refreshProfile();
                    toast({
                      title:
                        result.inserted > 0
                          ? `Imported ${result.inserted} session${result.inserted === 1 ? "" : "s"} from Apple Health`
                          : "Apple Health connected",
                    });
                    navigate("/dashboard", { state: { firstTime: true } });
                  } catch (err) {
                    const message =
                      err instanceof Error ? err.message : "Could not connect Apple Health";
                    toast({ title: "Connect failed", description: message, variant: "destructive" });
                  } finally {
                    setHkConnecting(false);
                  }
                }}
                className={`inline-flex min-h-12 w-full items-center justify-center gap-2.5 rounded-[14px] bg-primary px-5 py-[15px] text-[14.5px] font-semibold text-primary-foreground transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_RING}`}
              >
                <Heart size={14} aria-hidden />
                {hkConnecting ? "Connecting…" : "Connect Apple Health and finish"}
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {step!.options.map((option) => {
                const active = isActive(option);
                return (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={active}
                    onClick={() => handleSelect(option)}
                    className={`group ${ROW_BOX} ${FOCUS_RING} transition-all duration-200 ${
                      active
                        ? "border-primary bg-primary/10 text-fg"
                        : "border-border bg-background text-fg-soft hover:border-primary/40 hover:text-fg"
                    }`}
                  >
                    <OptionRowContent option={option} active={active} multi={step!.multi} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {moreBelow && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent"
          />
        )}
      </div>

      <div className="mt-5 flex shrink-0 gap-3">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          className="h-12 flex-1 rounded-[14px] border border-border text-sm text-fg-soft transition hover:border-primary/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        {onWearableStep ? (
          /* Connect Apple Health (above) is this step's one CTA — skipping is
             the quiet path out. */
          <button
            type="button"
            onClick={async () => {
              const ok = await persistProfile();
              if (!ok) return;
              // The context profile was fetched at signup, BEFORE these
              // answers existed — without this refresh the dashboard reads
              // experience/goal as null and mis-routes the first-run hero.
              await refreshProfile();
              navigate("/dashboard", { state: { firstTime: true } });
            }}
            className="h-12 flex-1 rounded-[14px] border border-border text-sm text-fg-soft transition hover:border-primary/40 hover:text-fg"
          >
            Skip for now
          </button>
        ) : (
          <CTAButton
            flex1
            variant="accent"
            className="h-12"
            disabled={!stepHasSelection}
            onClick={async () => {
              if (lastQuestion) {
                // Finished the multi-choice steps — persist now. On iOS the
                // wearable step follows; on the web this is the finish line.
                const ok = await persistProfile();
                if (!ok) return;
                // Same reason as the skip path: the dashboard must see the
                // answers that were just saved, not the signup-time nulls.
                await refreshProfile();
                if (!hasWearableStep) {
                  navigate("/dashboard", { state: { firstTime: true } });
                  return;
                }
                setIndex((value) => value + 1);
                return;
              }
              setIndex((value) => Math.min(ONBOARDING_STEPS.length - 1, value + 1));
            }}
          >
            {lastQuestion && !hasWearableStep ? "Finish" : "Next"}
            <ChevronRight size={16} />
          </CTAButton>
        )}
      </div>
    </AuthLayout>
  );
};

export default Onboarding;
