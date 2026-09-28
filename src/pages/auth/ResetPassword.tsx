import AuthLayout from "@/pages/auth/AuthLayout";
import { CTAButton } from "@/components/GoldButton";
import { updatePassword } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { toast } from "@/components/ui/use-toast";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

/* Landing page for the Supabase recovery link. supabase-js consumes the
   token from the URL and establishes a recovery session; we let the user
   set a new password and walk them straight back into the app. Every state
   uses the layout's minimal variant — recovery carries no product pitch. */
const ResetPassword = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The recovery token in the URL hash is processed asynchronously by
    // supabase-js on load — poll getSession briefly rather than racing it.
    let attempts = 0;
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setHasSession(true);
        setChecking(false);
      } else if (attempts++ < 10) {
        setTimeout(check, 300);
      } else {
        setChecking(false);
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (checking) {
    return (
      <AuthLayout variant="minimal">
        <div className="space-y-3 py-6" role="status" aria-label="Checking your reset link">
          <div className="h-4 w-2/3 animate-pulse rounded-md bg-secondary" />
          <div className="h-4 w-1/2 animate-pulse rounded-md bg-secondary" />
        </div>
      </AuthLayout>
    );
  }

  if (!hasSession) {
    return (
      <AuthLayout variant="minimal">
        <p className="label-xs mb-2">Link invalid</p>
        <h1 className="heading-md mb-3">Request a fresh link</h1>
        <p className="mb-6 text-sm leading-relaxed text-fg-soft">
          Reset links are single-use and expire quickly. Request a new one and open it on this
          device.
        </p>
        <CTAButton variant="accent" fullWidth onClick={() => navigate("/forgot-password")}>
          <KeyRound size={16} />
          Send a new reset link
        </CTAButton>
        <p className="mt-3 text-center text-sm text-fg-muted">
          Remembered it?{" "}
          <Link to="/sign-in" className="inline-flex min-h-11 items-center text-primary hover:underline">
            Back to sign in
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout variant="minimal">
      <p className="label-xs mb-1.5">Reset password</p>
      <h1 className="heading-md mb-5">Set a new password</h1>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving) return;
          if (password.length < 8) {
            toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
            return;
          }
          if (password !== confirm) {
            toast({ title: "Passwords don't match", variant: "destructive" });
            return;
          }
          setSaving(true);
          try {
            await updatePassword(password);
            toast({ title: "Password updated", description: "You're signed in — welcome back." });
            navigate("/dashboard", { replace: true });
          } catch (err) {
            toast({
              title: "Couldn't update password",
              description: err instanceof Error ? err.message : "Please try again.",
              variant: "destructive",
            });
          } finally {
            setSaving(false);
          }
        }}
      >
        <label className="block">
          <span className="mb-2 block text-xs text-fg-muted">New password</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="h-12 w-full rounded-[14px] border border-border bg-background px-3 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-primary transition-colors"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs text-fg-muted">Confirm password</span>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Same password again"
            className="h-12 w-full rounded-[14px] border border-border bg-background px-3 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-primary transition-colors"
          />
        </label>
        <CTAButton type="submit" variant="accent" fullWidth disabled={saving}>
          <ShieldCheck size={16} />
          {saving ? "Updating…" : "Update password"}
        </CTAButton>
      </form>
    </AuthLayout>
  );
};

export default ResetPassword;
