import AuthLayout from "@/pages/auth/AuthLayout";
import { CTAButton } from "@/components/GoldButton";
import { signIn } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import { AlertCircle, Mail } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type FieldErrors = { email?: string; password?: string; form?: string };

const FieldError = ({ message }: { message: string }) => (
  <div className="flex items-start gap-2 rounded-[0.75rem] border border-destructive/30 bg-destructive/[0.08] px-3 py-2.5">
    <AlertCircle size={13} className="mt-px shrink-0 text-destructive" />
    <p className="text-xs text-destructive">{message}</p>
  </div>
);

const SignIn = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!email) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Please enter a valid email address.";
    if (!password) e.password = "Password is required.";
    return e;
  };

  return (
    <AuthLayout eyebrow="Welcome Back" title="Pick up training exactly where you left off.">
      <p className="label-xs mb-1.5">Sign in</p>
      <h2 className="heading-md mb-5">Sign in to LiftOS</h2>
      <form
        noValidate
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const fieldErrors = validate();
          if (Object.keys(fieldErrors).length) { setErrors(fieldErrors); return; }

          setErrors({});
          setIsSubmitting(true);

          try {
            await signIn({ email, password });
            toast({ title: "Signed in", description: "Welcome back to LiftOS." });
            navigate("/dashboard");
          } catch (err) {
            setErrors({ form: err instanceof Error ? err.message : "Please try again." });
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <label className="block">
            <span className="mb-2 block text-xs text-fg-muted">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: undefined })); }}
              className={`h-12 w-full rounded-[14px] border bg-background px-3 text-sm text-fg placeholder:text-fg-faint outline-none transition-colors ${errors.email ? "border-destructive/50 focus:border-destructive" : "border-border focus:border-primary"}`}
              placeholder="you@example.com"
            />
          </label>
          {errors.email && <FieldError message={errors.email} />}
        </div>

        <div className="space-y-1.5">
          <label className="block">
            <span className="mb-2 block text-xs text-fg-muted">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: undefined })); }}
              className={`h-12 w-full rounded-[14px] border bg-background px-3 text-sm text-fg placeholder:text-fg-faint outline-none transition-colors ${errors.password ? "border-destructive/50 focus:border-destructive" : "border-border focus:border-primary"}`}
              placeholder="Your password"
            />
          </label>
          {errors.password && <FieldError message={errors.password} />}
        </div>

        {errors.form && <FieldError message={errors.form} />}

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-fg-soft">
            <input type="checkbox" defaultChecked className="accent-[hsl(var(--primary))]" />
            Remember me
          </label>
          <Link to="/forgot-password" className="text-gold hover:underline">Forgot?</Link>
        </div>
        <CTAButton type="submit" fullWidth disabled={isSubmitting}>
          <Mail size={16} />
          {isSubmitting ? "Signing in..." : "Sign in"}
        </CTAButton>
      </form>
      <p className="mt-5 text-center text-sm text-fg-muted">
        New to LiftOS?{" "}
        <Link to="/create-account" className="text-gold hover:underline">Create account</Link>
      </p>
    </AuthLayout>
  );
};

export default SignIn;
