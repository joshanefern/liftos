import { ReactNode } from "react";
import { Link } from "react-router-dom";

type GoldButtonProps = {
  children: ReactNode;
  to?: string;
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  disabled?: boolean;
  fullWidth?: boolean;
  flex1?: boolean;
  className?: string;
};

export const GoldButton = ({
  children,
  to,
  type = "button",
  onClick,
  disabled,
  fullWidth = false,
  flex1 = false,
  className = "",
}: GoldButtonProps) => {
  const outerDims = fullWidth ? "w-full" : flex1 ? "flex-1" : "";
  const innerDims = fullWidth || flex1 ? "w-full" : "";

  const innerCls =
    `group relative inline-flex items-center justify-center gap-2.5 rounded-full ` +
    `bg-[linear-gradient(135deg,rgba(215,181,99,1),rgba(184,147,66,1))] px-5 py-3 text-sm font-medium ` +
    `text-background transition-all duration-200 hover:opacity-90 ` +
    `hover:shadow-[0_0_28px_rgba(184,147,66,0.22)] active:scale-[0.97] ` +
    `${innerDims}`.trim();

  return (
    <div
      className={
        `group relative inline-flex items-center overflow-hidden rounded-full border border-gold/20 ` +
        `bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(184,147,66,0.05))] p-1.5 ` +
        `shadow-[0_8px_20px_rgba(0,0,0,0.12)] ${outerDims} ${className}`.trim()
      }
    >
      <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(184,147,66,0.14),transparent_68%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <span className="pointer-events-none absolute -left-1/4 top-0 h-full w-1/3 skew-x-[-20deg] bg-white/12 opacity-0 blur-md transition-all duration-700 group-hover:left-[105%] group-hover:opacity-100" />
      {to !== undefined ? (
        <Link to={to} onClick={onClick} className={innerCls}>
          {children}
        </Link>
      ) : (
        <button
          type={type}
          onClick={onClick}
          disabled={disabled}
          className={`${innerCls} disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {children}
        </button>
      )}
    </div>
  );
};
