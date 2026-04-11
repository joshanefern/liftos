import { useEffect, useRef, useState } from "react";

const stats = [
  { value: "127", label: "Workouts completed" },
  { value: "4,830", label: "Minutes trained" },
  { value: "18", label: "Week streak" },
  { value: "23.6k", label: "Calories burned" },
];

const StatsBar = () => {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} id="stats" className="py-20 md:py-28 px-6">
      <div className="max-w-7xl mx-auto">
        {visible && (
          <>
            <p className="body-sm text-muted-foreground mb-10 text-center animate-reveal-up">
              Your Progress
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
              {stats.map((stat, i) => (
                <div
                  key={stat.label}
                  className="text-center animate-reveal-up"
                  style={{ animationDelay: `${i * 80 + 100}ms` }}
                >
                  <p className="font-heading text-4xl md:text-5xl font-medium tracking-tight tabular-nums mb-2">
                    {stat.value}
                  </p>
                  <p className="text-muted-foreground text-sm">{stat.label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default StatsBar;
