import AuthLayout from "@/pages/auth/AuthLayout";
import { CTAButton } from "@/components/GoldButton";
import { requestPasswordReset } from "@/lib/auth";
import { toast } from "@/components/ui/use-toast";
import { MailCheck, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return (
      <AuthLayout eyebrow="Reset Access" title="Check your inbox — the reset link is on its way.">
        <div className="flex flex-col items-center py-4 text-center">
          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-primary/25 bg-primary/10">
            <MailCheck size={20} className="text-primary" />
          </span>
          <p className="label-xs mb-2">Email sent</p>
          <h2 className="heading-md mb-3">Check your inbox</h2>
          <p className="text-sm leading-relaxed text-fg-soft">
            If an account exists for <span className="mono text-fg">{sentTo}</span>, a
            password-reset link is on its way. Open it in your browser to choose a new password.
          </p>
          <button
            onClick={() => setSentTo(null)}
            className="mt-6 text-sm text-gold hover:underline"
          >
            Use a different email
          </button>
        </div>
        <p className="mt-6 text-center text-sm text-fg-muted">
          Remembered it? <Link to="/sign-in" className="text-gold hover:underline">Back to sign in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="Reset Access" title="Locked out? We'll get you back under the bar.">
      <p className="label-xs mb-1.5">Forgot password</p>
      <h2 className="heading-md mb-5">Send reset instructions</h2>
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (sending || !email.trim()) return;
          setSending(true);
          try {
            await requestPasswordReset(email.trim());
            setSentTo(email.trim());
          } catch (err) {
            toast({
              title: "Couldn't send reset email",
              description: err instanceof Error ? err.message : "Please try again.",
              variant: "destructive",
            });
          } finally {
            setSending(false);
          }
        }}
      >
        <label className="block">
          <span className="mb-2 block text-xs text-fg-muted">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-12 w-full rounded-[14px] border border-border bg-background px-3 text-sm text-fg placeholder:text-fg-faint outline-none focus:border-primary transition-colors"
          />
        </label>
        <CTAButton type="submit" fullWidth disabled={sending}>
          <Send size={16} />
          {sending ? "Sending…" : "Send reset link"}
        </CTAButton>
      </form>
      <p className="mt-6 text-center text-sm text-fg-muted">
        Remembered it? <Link to="/sign-in" className="text-gold hover:underline">Back to sign in</Link>
      </p>
    </AuthLayout>
  );
};

export default ForgotPassword;
