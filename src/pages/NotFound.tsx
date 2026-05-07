import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { FitnessBackground } from "@/components/FitnessBackground";
import { GoldButton } from "@/components/GoldButton";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[#0a0c15] text-foreground overflow-hidden" style={{ isolation: "isolate", zIndex: 0 }}>
      <FitnessBackground />
      <div className="landing-hero-radiance pointer-events-none absolute inset-x-0 top-0 h-[42rem]" />
      <div className="relative text-center">
        <p className="label-xs mb-4">Not found</p>
        <h1 className="mb-4 text-[5rem] font-semibold tracking-tight text-foreground leading-none">404</h1>
        <p className="mb-8 text-base text-foreground/45">This page doesn't exist.</p>
        <GoldButton to="/">Return home</GoldButton>
      </div>
    </div>
  );
};

export default NotFound;
