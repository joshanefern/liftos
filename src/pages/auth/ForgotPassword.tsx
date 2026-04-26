import AuthLayout from "@/pages/auth/AuthLayout";
import { Send } from "lucide-react";
import { Link } from "react-router-dom";

const ForgotPassword = () => (
  <AuthLayout eyebrow="Reset Access" title="A polished recovery flow without backend wiring yet.">
    <p className="label-xs mb-2">Forgot password</p>
    <h2 className="heading-md mb-6">Send reset instructions</h2>
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        window.localStorage.setItem("liftos_mock_reset_sent", "true");
      }}
    >
      <label className="block">
        <span className="mb-2 block text-xs text-[hsl(var(--text-tertiary))]">Email</span>
        <input
          type="email"
          placeholder="you@example.com"
          className="h-12 w-full rounded-lg border border-border/20 surface-3 px-3 text-sm outline-none focus:border-gold"
        />
      </label>
      <button className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gold text-sm font-semibold text-background transition hover:brightness-110">
        <Send size={17} />
        Send reset link
      </button>
    </form>
    <p className="mt-6 text-center text-sm text-[hsl(var(--text-secondary))]">
      Remembered it? <Link to="/sign-in" className="text-gold hover:underline">Back to sign in</Link>
    </p>
  </AuthLayout>
);

export default ForgotPassword;
