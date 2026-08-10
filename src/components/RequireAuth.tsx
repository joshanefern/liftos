import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/context/UserContext";

/* Route guard for the authenticated app. While the Supabase session resolves
   it holds a minimal champagne splash; signed out, it redirects to /sign-in
   (carrying the attempted location); signed in, it renders the app. */
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useUser();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <p className="text-[12px] font-semibold tracking-[0.28em] text-foreground animate-fade-in">
          LIFT<span className="text-gold">OS</span>
        </p>
        <div className="mt-7 h-px w-28 overflow-hidden rounded-full bg-border">
          <div
            className="h-full w-full bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.9),transparent)] bg-[length:200%_100%]"
            style={{ animation: "shimmer 1.6s linear infinite" }}
          />
        </div>
        <p className="mt-5 text-[10px] uppercase tracking-[0.2em] text-fg-muted">
          Preparing your session
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};

export default RequireAuth;
