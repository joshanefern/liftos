import AuthLayout from "@/pages/auth/AuthLayout";
import { GoldButton } from "@/components/GoldButton";
import { register } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import { AlertCircle, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type FieldErrors = { name?: string; email?: string; password?: string; form?: string };

const FieldError = ({ message }: { message: string }) => (
  <div className="flex items-start gap-2 rounded-[0.75rem] border border-red-500/20 bg-red-500/[0.07] px-3 py-2.5">
    <AlertCircle size={13} className="mt-px shrink-0 text-red-400" />
    <p className="text-xs text-red-300/90">{message}</p>
  </div>
);

const CreateAccount = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!name.trim()) e.name = "Name is required.";
    if (!email) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = "Please enter a valid email address.";
    if (!password) e.password = "Password is required.";
    else if (password.length < 8) e.password = "Password must be at least 8 characters.";
    return e;
  };

  return (
    <AuthLayout eyebrow="Create Account" title="Set up a serious training workspace in minutes.">
      <p className="label-xs mb-2">Create account</p>
      <h2 className="heading-md mb-6">Join LiftOS</h2>
      <form
        noValidate
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const fieldErrors = validate();
          if (Object.keys(fieldErrors).length) { setErrors(fieldErrors); return; }

          setErrors({});
          setIsSubmitting(true);
          const [firstName, ...lastNameParts] = name.trim().split(/\s+/).filter(Boolean);

          try {
            await register({
              firstName,
              lastName: lastNameParts.length ? lastNameParts.join(" ") : undefined,
              email,
              password,
            });
            toast({ title: "Account created", description: "Your LiftOS workspace is ready." });
            navigate("/onboarding");
          } catch (err) {
            setErrors({ form: err instanceof Error ? err.message : "Please try again." });
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <div className="space-y-1.5">
          <label className="block">
            <span className="mb-2 block text-xs text-foreground/30">Name</span>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((prev) => ({ ...prev, name: undefined })); }}
              className={`h-12 w-full rounded-[1rem] border bg-white/[0.04] px-3 text-sm outline-none transition-colors ${errors.name ? "border-red-500/40 focus:border-red-500/60" : "border-white/8 focus:border-gold/50"}`}
              placeholder="Josh"
            />
          </label>
          {errors.name && <FieldError message={errors.name} />}
        </div>

        <div className="space-y-1.5">
          <label className="block">
            <span className="mb-2 block text-xs text-foreground/30">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((prev) => ({ ...prev, email: undefined })); }}
              className={`h-12 w-full rounded-[1rem] border bg-white/[0.04] px-3 text-sm outline-none transition-colors ${errors.email ? "border-red-500/40 focus:border-red-500/60" : "border-white/8 focus:border-gold/50"}`}
              placeholder="you@example.com"
            />
          </label>
          {errors.email && <FieldError message={errors.email} />}
        </div>

        <div className="space-y-1.5">
          <label className="block">
            <span className="mb-2 block text-xs text-foreground/30">Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setErrors((prev) => ({ ...prev, password: undefined })); }}
              className={`h-12 w-full rounded-[1rem] border bg-white/[0.04] px-3 text-sm outline-none transition-colors ${errors.password ? "border-red-500/40 focus:border-red-500/60" : "border-white/8 focus:border-gold/50"}`}
              placeholder="Create a password (8+ characters)"
            />
          </label>
          {errors.password && <FieldError message={errors.password} />}
        </div>

        {errors.form && <FieldError message={errors.form} />}

        <GoldButton type="submit" fullWidth disabled={isSubmitting}>
          <UserPlus size={16} />
          {isSubmitting ? "Creating account..." : "Continue"}
        </GoldButton>
      </form>
      <p className="mt-6 text-center text-sm text-foreground/50">
        Already have an account?{" "}
        <Link to="/sign-in" className="text-gold hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
};

export default CreateAccount;
