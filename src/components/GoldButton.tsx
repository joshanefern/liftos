import { ReactNode } from "react";
import { Link } from "react-router-dom";

type CTAButtonProps = {
  children: ReactNode;
  to?: string;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  flex1?: boolean;
  className?: string;
  /** "ink" (default) — foreground-on-background flip, the mockup CTA.
      "accent" — terracotta, reserved for the one action that matters most. */
  variant?: "ink" | "accent";
};

/* The champagne-mockup CTA: a flat, confident block. Ink bar with
   champagne text in light mode; the colors trade places in dark.
   No gradients, no glow, no shimmer — the shape does the work. */
export const CTAButton = ({
  children,
  to,
  type = "button",
  onClick,
  disabled,
  fullWidth = false,
  flex1 = false,
  className = "",
  variant = "ink",
}: CTAButtonProps) => {
  const dims = fullWidth ? "w-full" : flex1 ? "flex-1" : "";
  const palette =
    variant === "accent"
      ? "bg-primary text-primary-foreground"
      : "bg-foreground text-background";

  const cls =
    `inline-flex items-center justify-center gap-2.5 rounded-[14px] ` +
    `px-5 py-[15px] text-[14.5px] font-semibold ${palette} ` +
    `transition-[opacity,transform] duration-150 hover:opacity-90 active:scale-[0.98] ` +
    `${dims} ${className}`.trim();

  return to !== undefined ? (
    <Link to={to} onClick={onClick} className={cls}>
      {children}
    </Link>
  ) : (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${cls} disabled:cursor-not-allowed disabled:opacity-50`}
    >
      {children}
    </button>
  );
};

/* Back-compat alias — call sites migrate to CTAButton during the sweep. */
export const GoldButton = CTAButton;
