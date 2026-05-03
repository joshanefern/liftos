import { Clock, Flame, Dumbbell } from "lucide-react";

interface WorkoutItemProps {
  name: string;
  type: string;
  duration: string;
  calories: string;
  time: string;
  index: number;
}

const WorkoutItem = ({ name, type, duration, calories, time, index }: WorkoutItemProps) => (
  <div
    className="flex items-center justify-between py-4 border-b border-border/30 last:border-0 group cursor-pointer animate-reveal-up glow-gold-hover rounded-lg px-3 -mx-3"
    style={{ animationDelay: `${index * 80 + 400}ms` }}
  >
    <div className="flex items-center gap-4">
      <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/8 flex items-center justify-center">
        <Dumbbell size={15} className="text-gold" />
      </div>
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-foreground/30">{type}</p>
      </div>
    </div>
    <div className="flex items-center gap-5">
      <div className="flex items-center gap-1.5 text-xs text-foreground/50">
        <Clock size={12} />
        <span className="font-mono">{duration}</span>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-foreground/50">
        <Flame size={12} />
        <span className="font-mono">{calories}</span>
      </div>
      <span className="text-xs text-foreground/30 w-16 text-right">{time}</span>
    </div>
  </div>
);

const recentWorkouts = [
  { name: "Upper Power", type: "Strength", duration: "52m", calories: "420 kcal", time: "Today" },
  { name: "Zone 2 Run", type: "Cardio", duration: "35m", calories: "310 kcal", time: "Yesterday" },
  { name: "Push Hypertrophy", type: "Strength", duration: "48m", calories: "385 kcal", time: "2 days ago" },
  { name: "Recovery Flow", type: "Mobility", duration: "22m", calories: "95 kcal", time: "3 days ago" },
];

const RecentWorkouts = () => (
  <div>
    <p className="label-xs mb-4">Recent Activity</p>
    <div>
      {recentWorkouts.map((w, i) => (
        <WorkoutItem key={w.name} {...w} index={i} />
      ))}
    </div>
  </div>
);

export default RecentWorkouts;
