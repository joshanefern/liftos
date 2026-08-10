import { LayoutDashboard, Dumbbell, Plus, TrendingUp, Sparkles } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { usePendingReviews } from "@/hooks/usePendingReviews";

const tabs = [
  { title: "Home", url: "/dashboard", icon: LayoutDashboard },
  { title: "Workouts", url: "/workouts", icon: Dumbbell },
  { title: "Log", url: "/workouts/active", icon: Plus, center: true },
  { title: "Progress", url: "/progress", icon: TrendingUp },
  { title: "Coach", url: "/coach", icon: Sparkles },
];

/* Bottom tab bar for phones — the sidebar is desktop-only. Sits above the
   home indicator via safe-area padding. Per the champagne mockup: a
   near-opaque blurred bar with a hairline top rule; the center Log action
   is the ink-on-champagne flip circle, one thumb-tap away. */
const MobileTabBar = () => {
  const { pendingCount } = usePendingReviews();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 md:hidden border-t border-border bg-background/95 backdrop-blur-[10px] pb-safe">
      <div className="flex items-stretch justify-around h-16">
        {tabs.map((tab) =>
          tab.center ? (
            <NavLink
              key={tab.url}
              to={tab.url}
              className="flex flex-col items-center justify-center"
              activeClassName=""
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-[0_2px_10px_hsl(var(--foreground)/0.2)] active:scale-95 transition-transform duration-150">
                <tab.icon size={22} strokeWidth={2.5} />
              </span>
            </NavLink>
          ) : (
            <NavLink
              key={tab.url}
              to={tab.url}
              end
              className="flex flex-1 flex-col items-center justify-center gap-1 text-fg-muted transition-colors duration-200"
              activeClassName="!text-fg"
            >
              <span className="relative">
                <tab.icon size={20} className="shrink-0" />
                {tab.url === "/workouts" && pendingCount > 0 && (
                  <span className="mono absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold leading-none text-primary-foreground">
                    {pendingCount > 9 ? "9+" : pendingCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-semibold tracking-wide">{tab.title}</span>
            </NavLink>
          )
        )}
      </div>
    </nav>
  );
};

export default MobileTabBar;
