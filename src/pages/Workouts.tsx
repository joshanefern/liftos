import { Dumbbell, Clock, Flame, ArrowRight } from "lucide-react";

const workouts = [
  { name: "Upper Power", type: "Strength", muscles: "Chest, Shoulders, Triceps", duration: "50 min", calories: "~420 kcal", difficulty: "Hard" },
  { name: "Lower Hypertrophy", type: "Strength", muscles: "Quads, Hamstrings, Glutes", duration: "55 min", calories: "~460 kcal", difficulty: "Hard" },
  { name: "Zone 2 Steady State", type: "Cardio", muscles: "Full Body", duration: "35 min", calories: "~310 kcal", difficulty: "Moderate" },
  { name: "Push Day", type: "Strength", muscles: "Chest, Delts, Triceps", duration: "48 min", calories: "~385 kcal", difficulty: "Hard" },
  { name: "Pull Day", type: "Strength", muscles: "Back, Biceps, Rear Delts", duration: "45 min", calories: "~370 kcal", difficulty: "Hard" },
  { name: "Recovery Flow", type: "Mobility", muscles: "Full Body", duration: "22 min", calories: "~95 kcal", difficulty: "Easy" },
  { name: "HIIT Conditioning", type: "Cardio", muscles: "Full Body", duration: "25 min", calories: "~350 kcal", difficulty: "Very Hard" },
  { name: "Core & Stability", type: "Strength", muscles: "Abs, Obliques, Lower Back", duration: "20 min", calories: "~140 kcal", difficulty: "Moderate" },
];

const Workouts = () => (
  <div className="min-h-screen p-6 md:p-10 lg:p-12 max-w-5xl">
    <div className="mb-10 animate-reveal-up">
      <p className="label-xs mb-2">Library</p>
      <h1 className="heading-lg">Workouts</h1>
    </div>

    <div className="space-y-3">
      {workouts.map((w, i) => (
        <div
          key={w.name}
          className="group flex items-center justify-between rounded-xl surface-2 border border-border/20 p-5 cursor-pointer glow-gold-hover animate-reveal-up"
          style={{ animationDelay: `${i * 60 + 100}ms` }}
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg surface-3 flex items-center justify-center">
              <Dumbbell size={16} className="text-gold" />
            </div>
            <div>
              <p className="font-medium text-sm">{w.name}</p>
              <p className="text-xs text-[hsl(var(--text-tertiary))]">{w.muscles}</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-xs text-[hsl(var(--text-tertiary))] hidden sm:block">{w.difficulty}</span>
            <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-secondary))]">
              <Clock size={12} />
              <span className="font-mono">{w.duration}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--text-secondary))] hidden sm:flex">
              <Flame size={12} />
              <span className="font-mono">{w.calories}</span>
            </div>
            <ArrowRight size={14} className="text-[hsl(var(--text-tertiary))] group-hover:text-gold transition-colors" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default Workouts;
