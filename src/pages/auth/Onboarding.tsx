import AuthLayout from "@/pages/auth/AuthLayout";
import { GoldButton } from "@/components/GoldButton";
import { Check, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const steps = [
  { key: "goal", label: "Training goal", options: ["Hypertrophy", "Strength", "Fat Loss", "General Fitness", "Not Sure"] },
  { key: "experience", label: "Experience level", options: ["Beginner", "Intermediate", "Advanced"] },
  { key: "equipment", label: "Equipment available", options: ["Full gym", "Home gym", "Dumbbells only", "None"] },
  { key: "frequency", label: "Workout frequency", options: ["1–2 days", "3–4 days", "5–6 days", "7 days"] },
  { key: "split", label: "Preferred split", options: ["Push Pull Legs", "Upper Lower", "Full Body", "Not Sure / Other"] },
  { key: "units", label: "Units", options: ["lb", "kg"] },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({
    goal: "Hypertrophy",
    experience: "Intermediate",
    equipment: "Full gym",
    frequency: "3–4 days",
    split: "Push Pull Legs",
    units: "lb",
  });
  const step = steps[index];
  const complete = index === steps.length - 1;
  const progress = useMemo(() => Math.round(((index + 1) / steps.length) * 100), [index]);

  return (
    <AuthLayout eyebrow="Onboarding" title="Personalize the demo around your actual training style.">
      <div className="mb-6">
        <p className="label-xs mb-2">Step {index + 1} of {steps.length}</p>
        <h2 className="heading-md">{step.label}</h2>
        <div className="mt-4 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-[linear-gradient(90deg,rgba(215,181,99,1),rgba(184,147,66,1))] transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-3">
        {step.options.map((option) => {
          const active = answers[step.key] === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => setAnswers((current) => ({ ...current, [step.key]: option }))}
              className={`flex w-full items-center justify-between rounded-[1rem] border p-4 text-left transition-all duration-200 ${
                active
                  ? "border-gold/50 bg-gold/10 text-foreground"
                  : "border-white/8 bg-white/[0.03] text-foreground/50 hover:border-gold/30 hover:text-foreground"
              }`}
            >
              <span className="text-sm font-medium">{option}</span>
              {active && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(215,181,99,1),rgba(184,147,66,1))] text-background">
                  <Check size={12} />
                </span>
              )}
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
          onClick={() => {
            if (complete) {
              window.localStorage.setItem("liftos_onboarding", JSON.stringify(answers));
              navigate("/dashboard");
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
