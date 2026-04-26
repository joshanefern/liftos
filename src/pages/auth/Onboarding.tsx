import AuthLayout from "@/pages/auth/AuthLayout";
import { Check, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const steps = [
  { key: "goal", label: "Training goal", options: ["Hypertrophy", "Strength", "Recomposition"] },
  { key: "experience", label: "Experience level", options: ["Beginner", "Intermediate", "Advanced"] },
  { key: "equipment", label: "Equipment available", options: ["Full gym", "Home gym", "Dumbbells only"] },
  { key: "frequency", label: "Workout frequency", options: ["3 days", "4 days", "5 days"] },
  { key: "split", label: "Preferred split", options: ["Push Pull Legs", "Upper Lower", "Full Body"] },
  { key: "units", label: "Units", options: ["lb", "kg"] },
];

const Onboarding = () => {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({
    goal: "Hypertrophy",
    experience: "Intermediate",
    equipment: "Full gym",
    frequency: "5 days",
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
        <div className="mt-4 h-2 rounded-full surface-3">
          <div className="h-full rounded-full bg-gold transition-all" style={{ width: `${progress}%` }} />
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
              className={`flex w-full items-center justify-between rounded-lg border p-4 text-left transition ${
                active
                  ? "border-gold bg-gold text-background"
                  : "border-border/20 surface-3 text-[hsl(var(--text-secondary))] hover:border-gold hover:text-foreground"
              }`}
            >
              <span className="text-sm font-medium">{option}</span>
              {active && <Check size={16} />}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          disabled={index === 0}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          className="h-12 flex-1 rounded-lg border border-border/20 text-sm text-[hsl(var(--text-secondary))] transition hover:border-gold hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => {
            if (complete) {
              window.localStorage.setItem("liftos_onboarding", JSON.stringify(answers));
              navigate("/dashboard");
              return;
            }
            setIndex((value) => Math.min(steps.length - 1, value + 1));
          }}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-gold text-sm font-semibold text-background transition hover:brightness-110"
        >
          {complete ? "Finish" : "Next"}
          <ChevronRight size={16} />
        </button>
      </div>
    </AuthLayout>
  );
};

export default Onboarding;
