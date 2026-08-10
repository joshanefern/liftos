import AuthLayout from "@/pages/auth/AuthLayout";
import { ConnectStravaButton } from "@/components/ConnectStravaButton";
import { CTAButton } from "@/components/GoldButton";
import { connectHealthKit, healthKitSupported } from "@/lib/healthkit";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabase";
import { Check, ChevronRight, Heart } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "@/components/ui/use-toast";
import { useNavigate } from "react-router-dom";

const descriptions: Record<string, string> = {
  "Hypertrophy": "Build muscle size",
  "Strength": "Lift heavier loads",
  "Fat Loss": "Burn body fat",
  "General Fitness": "Overall health focus",
  "Not Sure": "Find your path",
  "Beginner": "Just starting out",
  "Intermediate": "Some gym time",
  "Advanced": "Seasoned lifter",
  "Full gym": "All gear available",
  "Home gym": "Basic home setup",
  "Dumbbells only": "Free weights only",
  "None": "Bodyweight only",
  "1–2 days": "Light schedule",
  "3–4 days": "Moderate commitment",
  "5–6 days": "High frequency",
  "7 days": "Every single day",
  "Push Pull Legs": "3-day rotation",
  "Upper Lower": "Alternating body halves",
  "Full Body": "Full body each session",
  "Not Sure / Other": "Flexible approach",
  "lb": "Imperial units",
  "kg": "Metric units",
};

const steps = [
  { key: "goal", label: "What are you training for?", options: ["Hypertrophy", "Strength", "Fat Loss", "General Fitness", "Not Sure"], multi: true },
  { key: "experience", label: "How experienced are you?", options: ["Beginner", "Intermediate", "Advanced"], multi: false },
  { key: "equipment", label: "What equipment do you have?", options: ["Full gym", "Home gym", "Dumbbells only", "None"], multi: false },
  { key: "frequency", label: "How many days a week?", options: ["1–2 days", "3–4 days", "5–6 days", "7 days"], multi: false },
  { key: "split", label: "How will you split the week?", options: ["Push Pull Legs", "Upper Lower", "Full Body", "Not Sure / Other"], multi: false },
  { key: "units", label: "Pounds or kilos?", options: ["lb", "kg"], multi: false },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const { refreshProfile } = useUser();
  const [index, setIndex] = useState(0);
  const [hkConnecting, setHkConnecting] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({
    goal: [],
    experience: "",
    equipment: "",
    frequency: "",
    split: "",
    units: "",
  });
  const totalSteps = steps.length + 1; // last slot is the optional wearable step
  const onWearableStep = index === steps.length;
  const step = onWearableStep ? null : steps[index];
  const progress = useMemo(
    () => Math.round(((index + 1) / totalSteps) * 100),
    [index, totalSteps],
  );

  const persistProfile = async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return true;
    const goal = answers.goal;
    const { error } = await supabase.from("profiles").upsert({
      id: user.id,
      goal: Array.isArray(goal) ? goal.join(", ") : goal,
      experience: answers.experience,
      equipment: answers.equipment,
      frequency: answers.frequency,
      split: answers.split,
      units: answers.units,
    });
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
    if (step.multi) {
      setAnswers((current) => {
        const prev = current[step.key];
        const selected = Array.isArray(prev) ? prev : [prev];
        const next = selected.includes(option)
          ? selected.filter((v) => v !== option)
          : [...selected, option];
        return { ...current, [step.key]: next.length ? next : [option] };
      });
    } else {
      setAnswers((current) => ({ ...current, [step.key]: option }));
    }
  };

  return (
    <AuthLayout eyebrow="Onboarding" title="Personalize the demo around your actual training style.">
      <div className="mb-5">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="label-xs">Step {index + 1} of {totalSteps}</p>
          {step?.multi && (
            <p className="text-xs text-fg-muted">Select all that apply</p>
          )}
          {onWearableStep && (
            <p className="text-xs text-fg-muted">Optional</p>
          )}
        </div>
        <h2 className="heading-lg">{onWearableStep ? "Connect a wearable?" : step!.label}</h2>
        <div className="mt-3 h-1.5 rounded-full bg-border overflow-hidden">
          <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {onWearableStep ? (
        <div className="space-y-4">
          <p className="body-sm text-fg-soft">
            {healthKitSupported()
              ? "Wear your watch, lift, and confirm later — we pre-fill your review drafts from Apple Health or Strava."
              : "Strava pulls in Apple Watch, Garmin, Whoop and more — we pre-fill your review drafts, you just confirm."}
          </p>
          {/* On iOS, Apple Health is the primary path — no account, no OAuth. */}
          {healthKitSupported() && (
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
              className="inline-flex w-full min-h-12 items-center justify-center gap-2.5 rounded-[14px] bg-foreground px-5 py-[15px] text-[14.5px] font-semibold text-background transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Heart size={14} aria-hidden />
              {hkConnecting ? "Connecting…" : "Connect Apple Health and finish"}
            </button>
          )}
          <ConnectStravaButton
            state="onboarding"
            label="Connect Strava and finish"
            className={
              healthKitSupported()
                ? "inline-flex w-full min-h-12 items-center justify-center gap-2.5 rounded-[14px] border border-border px-5 py-[15px] text-[14.5px] font-semibold text-fg transition-[opacity,transform] duration-150 hover:border-primary/40 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-ring/40"
                : "inline-flex w-full min-h-12 items-center justify-center gap-2.5 rounded-[14px] bg-foreground px-5 py-[15px] text-[14.5px] font-semibold text-background transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-ring/40"
            }
          />
        </div>
      ) : (
      <div className="space-y-2.5">
        {step!.options.map((option) => {
          const active = isActive(option);
          const desc = descriptions[option];
          return (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`group flex w-full items-center justify-between gap-3 rounded-[14px] border p-4 text-left transition-all duration-200 ${
                active
                  ? "border-primary bg-primary/10 text-fg"
                  : "border-border bg-background text-fg-soft hover:border-primary/40 hover:text-fg"
              }`}
            >
              <span className="shrink-0 text-sm font-medium">{option}</span>
              <div className="flex min-w-0 items-center gap-3">
                {desc && <span className="min-w-0 text-right text-xs text-fg-muted">{desc}</span>}
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center transition-all duration-200 ${
                  step.multi ? "rounded-[0.35rem]" : "rounded-full"
                } ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-transparent"
                }`}>
                  {active && <Check size={11} strokeWidth={2.5} />}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      )}

      <div className="mt-5 flex gap-3">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          className="h-12 flex-1 rounded-[14px] border border-border text-sm text-fg-soft transition hover:border-primary/40 hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        {onWearableStep ? (
          /* Connect Strava (above) is this step's one CTA — skipping is the
             quiet path out. */
          <button
            type="button"
            onClick={async () => {
              const ok = await persistProfile();
              if (!ok) return;
              navigate("/dashboard", { state: { firstTime: true } });
            }}
            className="h-12 flex-1 rounded-[14px] border border-border text-sm text-fg-soft transition hover:border-primary/40 hover:text-fg"
          >
            Skip for now
          </button>
        ) : (
          <CTAButton
            flex1
            disabled={!stepHasSelection}
            onClick={async () => {
              if (index === steps.length - 1) {
                // Finished the multi-choice steps — persist now so the wearable
                // step's "Connect Strava" can redirect away safely with the
                // profile already saved.
                const ok = await persistProfile();
                if (!ok) return;
                setIndex((value) => value + 1);
                return;
              }
              setIndex((value) => Math.min(steps.length - 1, value + 1));
            }}
          >
            Next
            <ChevronRight size={16} />
          </CTAButton>
        )}
      </div>
    </AuthLayout>
  );
};

export default Onboarding;
