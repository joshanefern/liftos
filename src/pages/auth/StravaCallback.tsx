import { supabase } from "@/lib/supabase";
import { fetchStravaActivities } from "@/lib/strava/refresh";
import { toast } from "@/components/ui/use-toast";
import { useUser } from "@/context/UserContext";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const StravaCallback = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refreshProfile } = useUser();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const code = params.get("code");
    const error = params.get("error");
    const state = params.get("state");

    if (error) {
      toast({
        title: "Strava connection cancelled",
        description: error,
        variant: "destructive",
      });
      navigate("/dashboard", { replace: true });
      return;
    }
    if (!code) {
      navigate("/dashboard", { replace: true });
      return;
    }

    (async () => {
      try {
        const { error: oauthError } = await supabase.functions.invoke(
          "strava-oauth",
          { body: { code } },
        );
        if (oauthError) throw oauthError;

        toast({ title: "Strava connected" });

        // Best-effort initial sync; don't block the redirect on it.
        try {
          const result = await fetchStravaActivities();
          if (result.inserted > 0) {
            toast({
              title: `Imported ${result.inserted} session${result.inserted === 1 ? "" : "s"}`,
            });
          }
        } catch (syncErr) {
          // Surface but keep going — user can hit Refresh on the dashboard.
          const message =
            syncErr instanceof Error ? syncErr.message : "Initial sync failed";
          toast({
            title: "Initial sync issue",
            description: message,
            variant: "destructive",
          });
        }

        await refreshProfile();
        navigate(state === "onboarding" ? "/dashboard" : "/dashboard", {
          replace: true,
          state: state === "onboarding" ? { firstTime: true } : undefined,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Could not finish Strava setup";
        toast({
          title: "Strava connection failed",
          description: message,
          variant: "destructive",
        });
        navigate("/dashboard", { replace: true });
      }
    })();
  }, [params, navigate, refreshProfile]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-fg">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <p className="body-md text-fg-soft">Connecting to Strava…</p>
      </div>
    </div>
  );
};

export default StravaCallback;
