import { AlertTriangle, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

/* App banners: a leading mark (raspberry check, or a warning for
   destructive), a short title, an optional one-line description. No close
   button — they auto-dismiss in 3.2s and swipe up to dismiss, like iOS. */
export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider duration={3200} swipeDirection="up">
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const warn = variant === "destructive";
        return (
          <Toast key={id} variant={variant} {...props}>
            <span
              aria-hidden
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                warn ? "bg-destructive/[0.12] text-destructive" : "bg-primary/[0.12] text-primary"
              }`}
            >
              {warn ? <AlertTriangle size={14} strokeWidth={2.4} /> : <Check size={14} strokeWidth={2.6} />}
            </span>
            <div className="min-w-0">
              {title && (
                <ToastTitle className="text-[13.5px] font-semibold leading-[18px] text-fg">
                  {title}
                </ToastTitle>
              )}
              {description && (
                <ToastDescription className="mt-0.5 text-[12px] leading-4 text-fg-muted">
                  {description}
                </ToastDescription>
              )}
            </div>
            {action}
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
