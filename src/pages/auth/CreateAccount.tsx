import AuthLayout from "@/pages/auth/AuthLayout";
import { UserPlus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

const CreateAccount = () => {
  const navigate = useNavigate();

  return (
    <AuthLayout eyebrow="Create Account" title="Set up a serious training workspace in minutes.">
      <p className="label-xs mb-2">Create account</p>
      <h2 className="heading-md mb-6">Start the LiftOS demo</h2>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          window.localStorage.setItem("liftos_mock_auth", "created");
          navigate("/onboarding");
        }}
      >
        <label className="block">
          <span className="mb-2 block text-xs text-[hsl(var(--text-tertiary))]">Name</span>
          <input className="h-12 w-full rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none focus:border-gold" defaultValue="Josh" />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs text-[hsl(var(--text-tertiary))]">Email</span>
          <input type="email" className="h-12 w-full rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none focus:border-gold" placeholder="you@example.com" />
        </label>
        <label className="block">
          <span className="mb-2 block text-xs text-[hsl(var(--text-tertiary))]">Password</span>
          <input type="password" className="h-12 w-full rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none focus:border-gold" placeholder="Create a password" />
        </label>
        <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gold text-sm font-semibold text-background transition hover:brightness-110">
          <UserPlus size={17} />
          Continue
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-[hsl(var(--text-secondary))]">
        Already have an account? <Link to="/sign-in" className="text-gold hover:underline">Sign in</Link>
      </p>
    </AuthLayout>
  );
};

export default CreateAccount;
