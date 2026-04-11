import { useEffect, useRef, useState } from "react";
import WorkoutCard from "./WorkoutCard";
import strengthImg from "@/assets/workout-strength.jpg";
import cardioImg from "@/assets/workout-cardio.jpg";
import yogaImg from "@/assets/workout-yoga.jpg";
import hiitImg from "@/assets/workout-hiit.jpg";

const programs = [
  { image: strengthImg, title: "Foundation Strength", duration: "45 min", level: "All levels" },
  { image: cardioImg, title: "Trail Running", duration: "30 min", level: "Intermediate" },
  { image: yogaImg, title: "Morning Flow", duration: "25 min", level: "Beginner" },
  { image: hiitImg, title: "Metabolic Burn", duration: "20 min", level: "Advanced" },
];

const Programs = () => {
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
    <section ref={ref} id="programs" className="py-24 md:py-32 px-6">
      <div className="max-w-7xl mx-auto">
        {visible && (
          <>
            <div className="flex items-end justify-between mb-12 md:mb-16 animate-reveal-up">
              <div>
                <p className="body-sm text-muted-foreground mb-3">Programs</p>
                <h2 className="heading-lg">Train your way</h2>
              </div>
              <a href="#" className="hidden md:block text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors">
                View all
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
              {programs.map((p, i) => (
                <WorkoutCard key={p.title} {...p} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default Programs;
