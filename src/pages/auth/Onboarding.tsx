import AuthLayout from "@/pages/auth/AuthLayout";
import { GoldButton } from "@/components/GoldButton";
import { supabase } from "@/lib/supabase";
import { Check, ChevronRight } from "lucide-react";
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
  { key: "goal", label: "Training goals", options: ["Hypertrophy", "Strength", "Fat Loss", "General Fitness", "Not Sure"], multi: true },
  { key: "experience", label: "Experience level", options: ["Beginner", "Intermediate", "Advanced"], multi: false },
  { key: "equipment", label: "Equipment available", options: ["Full gym", "Home gym", "Dumbbells only", "None"], multi: false },
  { key: "frequency", label: "Workout frequency", options: ["1–2 days", "3–4 days", "5–6 days", "7 days"], multi: false },
  { key: "split", label: "Preferred split", options: ["Push Pull Legs", "Upper Lower", "Full Body", "Not Sure / Other"], multi: false },
  { key: "units", label: "Units", options: ["lb", "kg"], multi: false },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({
    goal: [],
    experience: "",
    equipment: "",
    frequency: "",
    split: "",
    units: "",
  });
  const step = steps[index];
  const complete = index === steps.length - 1;
  const progress = useMemo(() => Math.round(((index + 1) / steps.length) * 100), [index]);

  const stepHasSelection = useMemo(() => {
    const val = answers[step.key];
    return Array.isArray(val) ? val.length > 0 : val !== "";
  }, [answers, step.key]);

  const isActive = (option: string) => {
    const val = answers[step.key];
    return Array.isArray(val) ? val.includes(option) : val === option;
  };

  const handleSelect = (option: string) => {
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
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="label-xs">Step {index + 1} of {steps.length}</p>
          {step.multi && (
            <p className="text-xs text-foreground/30">Select all that apply</p>
          )}
        </div>
        <h2 className="heading-md">{step.label}</h2>
        <div className="mt-4 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(215,181,99,1),rgba(184,147,66,1))] transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-3">
        {step.options.map((option) => {
          const active = isActive(option);
          const desc = descriptions[option];
          return (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`group flex w-full items-center justify-between rounded-[1rem] border p-4 text-left transition-all duration-200 ${
                active
                  ? "border-gold/50 bg-gold/10 text-foreground"
                  : "border-white/8 bg-white/[0.03] text-foreground/50 hover:border-gold/30 hover:text-foreground"
              }`}
            >
              <span className="text-sm font-medium">{option}</span>
              <div className="flex items-center gap-3">
                {desc && <span className="text-xs text-foreground/30">{desc}</span>}
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center transition-all duration-200 ${
                  step.multi ? "rounded-[0.35rem]" : "rounded-full"
                } ${
                  active
                    ? "bg-[linear-gradient(135deg,rgba(215,181,99,1),rgba(184,147,66,1))] text-background"
                    : "border border-white/15 bg-transparent"
                }`}>
                  {active && <Check size={11} strokeWidth={2.5} />}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          className="h-12 flex-1 rounded-full border border-white/8 text-sm text-foreground/50 transition hover:border-gold/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        <GoldButton
          flex1
          disabled={!stepHasSelection}
          onClick={async () => {
            if (complete) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user) {
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
                  return;
                }
              }
              navigate("/dashboard", { state: { firstTime: true } });
              return;
            }
            setIndex((value) => Math.min(steps.length - 1, value + 1));
          }}
        >
          {complete ? "Finish" : "Next"}
          <ChevronRight size={16} />
        </GoldButton>
      </div>
    </AuthLayout>
  );
};

export default Onboarding;
