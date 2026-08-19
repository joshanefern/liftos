import { useState } from "react";
import {
  LayoutDashboard,
  Dumbbell,
  Plus,
  TrendingUp,
  Sparkles,
  ChevronsRight,
  ClipboardList,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { usePendingReviews } from "@/hooks/usePendingReviews";
import {
  ACTIVE_WORKOUT_STORAGE_KEY,
  buildBlankSession,
  persistActiveSession,
} from "@/lib/startSession";

const tabs = [
  { title: "Home", url: "/dashboard", icon: LayoutDashboard },
  { title: "Workouts", url: "/workouts", icon: Dumbbell },
  { title: "Progress", url: "/progress", icon: TrendingUp },
  { title: "Coach", url: "/coach", icon: Sparkles },
];

/* Bottom tab bar for phones — the sidebar is desktop-only. The center +
   opens a two-way chooser: Quick start (log as you go, voice or typed) or
   New workout (plan it first in the builder). */
const MobileTabBar = () => {
  const { pendingCount } = usePendingReviews();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [chooserOpen, setChooserOpen] = useState(false);
  // Nested-route truth: the active session and review screens belong to the
  // Workouts tab — start a workout and you're still "in Workouts".
  const workoutsActive = pathname.startsWith("/workouts");
  // Mid-workout the whole screen is the black scoreboard (Split Shift) —
  // the bar flips with it so the frame reads as one surface.
  const scoreboard = pathname === "/workouts/active";

  const handlePlus = (): void => {
    // A live session outranks starting anything new.
    try {
      if (window.localStorage.getItem(ACTIVE_WORKOUT_STORAGE_KEY)) {
        navigate("/workouts/active");
        return;
      }
    } catch {
      /* storage unavailable — fall through to the chooser */
    }
    setChooserOpen(true);
  };

  const quickStart = (): void => {
    setChooserOpen(false);
    persistActiveSession(buildBlankSession());
    navigate("/workouts/active");
  };

  const planWorkout = (): void => {
    setChooserOpen(false);
    navigate("/workouts?new=1");
  };

  const left = tabs.slice(0, 2);
  const right = tabs.slice(2);

  const renderTab = (tab: (typeof tabs)[number]) => (
    <NavLink
      key={tab.url}
      to={tab.url}
      end
      className={`flex flex-1 flex-col items-center justify-center gap-1 text-fg-muted transition-colors duration-200 ${
        tab.url === "/workouts" && workoutsActive ? "!text-fg" : ""
      }`}
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
  );

  return (
    <>
      <nav
        className={`fixed inset-x-0 bottom-0 z-40 md:hidden border-t border-border bg-background/95 backdrop-blur-[10px] pb-safe text-fg ${
          scoreboard ? "dark" : ""
        }`}
      >
        <div className="flex items-stretch justify-around h-16">
          {left.map(renderTab)}
          <button
            type="button"
            onClick={handlePlus}
            aria-label="Start or create a workout"
            className="flex flex-1 flex-col items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground text-background shadow-[0_2px_10px_hsl(var(--foreground)/0.2)] active:scale-95 transition-transform duration-150">
              <Plus size={22} strokeWidth={2.5} />
            </span>
          </button>
          {right.map(renderTab)}
        </div>
      </nav>

      <Drawer open={chooserOpen} onOpenChange={setChooserOpen}>
        <DrawerContent className="px-5 pb-[calc(var(--safe-bottom)+1.5rem)]">
          <DrawerTitle className="sr-only">Start or create a workout</DrawerTitle>
          <div className="mt-5 space-y-2.5">
            <button
              type="button"
              onClick={quickStart}
              className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[16px] bg-primary px-5 text-left text-primary-foreground transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span>
                <span className="block text-[15px] font-semibold">Quick start</span>
                <span className="mt-0.5 block text-[12px] opacity-80">
                  Start now — log by voice or as you go
                </span>
              </span>
              <ChevronsRight size={18} className="shrink-0" />
            </button>
            <button
              type="button"
              onClick={planWorkout}
              className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-[16px] border border-border bg-card px-5 text-left text-fg transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <span>
                <span className="block text-[15px] font-semibold">New workout</span>
                <span className="mt-0.5 block text-[12px] text-fg-muted">
                  Plan the exercises first, save it for any day
                </span>
              </span>
              <ClipboardList size={18} className="shrink-0 text-fg-muted" />
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
};

export default MobileTabBar;
