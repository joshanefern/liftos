import { useEffect, useRef, useState } from "react";
import heroImage from "@/assets/hero-fitness.jpg";

const Hero = () => {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} className="relative min-h-screen flex items-end pb-16 md:pb-24 pt-32">
      {/* Background image */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroImage}
          alt="Athlete performing warrior pose in minimal studio"
          className="w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-background/40" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 w-full">
        <div className={`max-w-3xl ${visible ? "animate-reveal-up" : "opacity-0"}`}>
          <p className="body-sm text-muted-foreground mb-4" style={{ animationDelay: "100ms" }}>
            Move with intention
          </p>
          <h1 className="heading-xl mb-6 text-foreground">
            Your body
            <br />
            knows the way
          </h1>
          <p className="body-lg text-muted-foreground max-w-lg mb-8">
            Structured programs designed around how your body actually moves.
            No gimmicks — just consistent, intelligent training.
          </p>
          <div className="flex gap-4 flex-wrap">
            <button className="bg-accent text-accent-foreground px-8 py-3.5 rounded-full font-medium hover:opacity-90 transition-opacity active:scale-[0.97] duration-150">
              Browse Programs
            </button>
            <button className="border border-foreground/20 px-8 py-3.5 rounded-full font-medium hover:bg-foreground/5 transition-colors active:scale-[0.97] duration-150">
              Watch Demo
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
