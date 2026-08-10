import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { FitnessBackground } from "@/components/FitnessBackground";
import { CTAButton } from "@/components/GoldButton";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background text-foreground overflow-hidden" style={{ isolation: "isolate", zIndex: 0 }}>
      <FitnessBackground />
      <div className="relative text-center">
        <p className="label-xs mb-4">Not found</p>
        <h1 className="mb-4 text-[5rem] font-extralight tracking-[-0.04em] tabular-nums text-fg leading-none">404</h1>
        <p className="mb-8 text-base text-fg-muted">This page doesn't exist.</p>
        <CTAButton to="/">Return home</CTAButton>
      </div>
    </div>
  );
};

export default NotFound;
