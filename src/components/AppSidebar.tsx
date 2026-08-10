import { LayoutDashboard, Dumbbell, TrendingUp, Sparkles, ChevronLeft, PlayCircle, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useSidebarState } from "@/App";
import { usePendingReviews } from "@/hooks/usePendingReviews";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Workouts", url: "/workouts", icon: Dumbbell },
  { title: "Log", url: "/workouts/active", icon: PlayCircle },
  { title: "Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Progress", url: "/progress", icon: TrendingUp },
  { title: "Coach", url: "/coach", icon: Sparkles },
];

const AppSidebar = () => {
  const { collapsed, setCollapsed } = useSidebarState();
  const { pendingCount } = usePendingReviews();

  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-40 hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-300 ease-out ${
        collapsed ? "w-[68px]" : "w-[220px]"
      }`}
    >
      <div className={`h-16 flex items-center px-5 ${collapsed ? "justify-center" : ""}`}>
        {!collapsed && (
          <Link to="/" className="text-[13px] font-semibold tracking-[0.22em] text-fg hover:opacity-70 transition-opacity duration-200">
            LIFT<span className="text-gold">OS</span>
          </Link>
        )}
        {collapsed && (
          <Link to="/" className="text-sm font-semibold text-gold tracking-[0.1em] hover:opacity-80 transition-opacity duration-200">L</Link>
        )}
      </div>

      <nav className="flex-1 px-3 mt-2 space-y-0.5">
        {navItems.map((item) => {
          const showBadge = item.url === "/workouts" && pendingCount > 0;
          return (
            <NavLink
              key={item.url}
              to={item.url}
              end
              className={`flex items-center gap-3 rounded-[0.875rem] px-3 py-2.5 text-sm font-medium transition-all duration-200 group
                text-fg-muted hover:text-fg hover:bg-sidebar-accent
                ${collapsed ? "justify-center px-0" : ""}`}
              activeClassName="!text-fg bg-sidebar-accent"
            >
              <span className="relative shrink-0">
                <item.icon size={17} className="shrink-0" />
                {showBadge && collapsed && (
                  <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary" />
                )}
              </span>
              {!collapsed && <span>{item.title}</span>}
              {!collapsed && showBadge && (
                <span className="mono ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-none text-primary-foreground">
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className={`px-3 pb-5 space-y-0.5 ${collapsed ? "flex flex-col items-center" : ""}`}>
        <div className={collapsed ? "" : "flex justify-start"}>
          <ThemeToggle compact={collapsed} />
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 rounded-[0.875rem] px-3 py-2 text-xs text-fg-faint hover:text-fg-muted hover:bg-sidebar-accent transition-colors duration-200"
        >
          <ChevronLeft
            size={14}
            className={`transition-transform duration-300 ${collapsed ? "rotate-180" : ""}`}
          />
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
