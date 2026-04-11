import { useEffect, useRef, useState } from "react";
import { Play, Clock, Flame, Dumbbell } from "lucide-react";
import strengthImg from "@/assets/workout-strength.jpg";

const FeaturedWorkout = () => {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} id="featured" className="py-24 md:py-32 px-6 bg-card">
      <div className="max-w-7xl mx-auto">
        {visible && (
          <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-center">
            {/* Image */}
            <div className="animate-reveal-left overflow-hidden rounded-2xl aspect-[4/3]">
              <img
                src={strengthImg}
                alt="Today's featured strength workout"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            {/* Content */}
            <div className="animate-reveal-up" style={{ animationDelay: "150ms" }}>
              <p className="body-sm text-accent mb-3 font-medium">Today's Pick</p>
              <h2 className="heading-lg mb-6">
                Full Body
                <br />
                Power Circuit
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-8 max-w-md">
                A compound-movement session targeting every major muscle group.
                Built around progressive overload principles with built-in mobility work.
              </p>

              <div className="flex gap-6 mb-10">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock size={16} />
                  <span>42 min</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Flame size={16} />
                  <span>~380 kcal</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Dumbbell size={16} />
                  <span>Equipment</span>
                </div>
              </div>

              <button className="inline-flex items-center gap-3 bg-foreground text-background px-8 py-3.5 rounded-full font-medium hover:opacity-90 transition-opacity active:scale-[0.97] duration-150">
                <Play size={18} fill="currentColor" />
                Start Workout
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default FeaturedWorkout;
