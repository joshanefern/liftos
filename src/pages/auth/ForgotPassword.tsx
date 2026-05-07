import AuthLayout from "@/pages/auth/AuthLayout";
import { GoldButton } from "@/components/GoldButton";
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
        <span className="mb-2 block text-xs text-foreground/30">Email</span>
        <input
          type="email"
          placeholder="you@example.com"
          className="h-12 w-full rounded-[1rem] border border-white/8 bg-white/[0.04] px-3 text-sm outline-none focus:border-gold/50 transition-colors"
        />
      </label>
      <GoldButton type="submit" fullWidth>
        <Send size={16} />
        Send reset link
      </GoldButton>
    </form>
    <p className="mt-6 text-center text-sm text-foreground/50">
      Remembered it? <Link to="/sign-in" className="text-gold hover:underline">Back to sign in</Link>
    </p>
  </AuthLayout>
);

export default ForgotPassword;
