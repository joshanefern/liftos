import AuthLayout from "@/pages/auth/AuthLayout";
import { persistAuth, signIn } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import { ArrowRight, Mail } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const SignIn = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("josh@liftos.demo");
  const [password, setPassword] = useState("password");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <AuthLayout eyebrow="Welcome Back" title="Pick up training exactly where you left off.">
      <p className="label-xs mb-2">Sign in</p>
      <h2 className="heading-md mb-6">Access your LiftOS demo</h2>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsSubmitting(true);

          try {
            const payload = await signIn({
              email,
              password,
            });

            persistAuth(payload);
            toast({
              title: "Signed in",
              description: "Welcome back to LiftOS.",
            });
            window.localStorage.setItem("liftos_mock_auth", "signed-in");
          } catch (error) {
            toast({
              title: "Could not sign in",
              description: error instanceof Error ? error.message : "Please try again.",
            });
            setIsSubmitting(false);
            return;
          }

          setIsSubmitting(false);
          navigate("/dashboard");
        }}
      >
        <label className="block">
          <span className="mb-2 block text-xs text-[hsl(var(--text-tertiary))]">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 w-full rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none focus:border-gold"
            required
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs text-[hsl(var(--text-tertiary))]">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 w-full rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none focus:border-gold"
            required
          />
        </label>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-[hsl(var(--text-secondary))]">
            <input type="checkbox" defaultChecked className="accent-[hsl(var(--gold))]" />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-gold hover:underline">Forgot?</Link>
        </div>
        <button
          disabled={isSubmitting}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gold text-sm font-semibold text-background transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Mail size={17} />
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-[hsl(var(--text-secondary))]">
        New to LiftOS? <Link to="/create-account" className="text-gold hover:underline">Create account</Link>
      </p>
      <Link to="/onboarding" className="mt-4 inline-flex w-full items-center justify-center gap-2 text-sm text-[hsl(var(--text-secondary))] hover:text-gold">
        View onboarding
        <ArrowRight size={15} />
      </Link>
    </AuthLayout>
  );
};

export default SignIn;
