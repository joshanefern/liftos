import AuthLayout from "@/pages/auth/AuthLayout";
import { persistAuth, register } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const CreateAccount = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <AuthLayout eyebrow="Create Account" title="Set up a serious training workspace in minutes.">
      <p className="label-xs mb-2">Create account</p>
      <h2 className="heading-md mb-6">Start the LiftOS demo</h2>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsSubmitting(true);

          const [firstName, ...lastNameParts] = name.trim().split(/\s+/).filter(Boolean);

          try {
            const payload = await register({
              firstName,
              lastName: lastNameParts.length ? lastNameParts.join(" ") : undefined,
              email,
              password,
            });

            persistAuth(payload);
            toast({
              title: "Account created",
              description: "Your LiftOS workspace is ready.",
            });
            window.localStorage.setItem("liftos_mock_auth", "created");
          } catch (error) {
            toast({
              title: "Could not create account",
              description: error instanceof Error ? error.message : "Please try again.",
            });
            setIsSubmitting(false);
            return;
          }

          setIsSubmitting(false);
          navigate("/onboarding");
        }}
      >
        <label className="block">
          <span className="mb-2 block text-xs text-foreground/30">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-12 w-full rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 text-sm outline-none focus:border-gold/50 transition-colors"
            placeholder="Josh"
            required
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs text-foreground/30">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-12 w-full rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 text-sm outline-none focus:border-gold/50 transition-colors"
            placeholder="you@example.com"
            required
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs text-foreground/30">Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 w-full rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 text-sm outline-none focus:border-gold/50 transition-colors"
            placeholder="Create a password"
            minLength={8}
            required
          />
        </label>
        <button
          disabled={isSubmitting}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[linear-gradient(135deg,rgba(215,181,99,1),rgba(184,147,66,1))] text-sm font-medium text-background transition hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UserPlus size={16} />
          {isSubmitting ? "Creating account..." : "Continue"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-foreground/50">
        Already have an account? <Link to="/sign-in" className="text-gold hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
};

export default CreateAccount;
