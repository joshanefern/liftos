import { LayoutDashboard, Dumbbell, TrendingUp, Sparkles, ChevronLeft, PlayCircle, CalendarDays } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useSidebarState } from "@/App";

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Workouts", url: "/workouts", icon: Dumbbell },
  { title: "Log", url: "/workouts/active", icon: PlayCircle },
  { title: "Calander", url: "/calander", icon: CalendarDays },
  { title: "Progress", url: "/progress", icon: TrendingUp },
  { title: "Coach", url: "/coach", icon: Sparkles },
];

const AppSidebar = () => {
  const { collapsed, setCollapsed } = useSidebarState();

  return (
    <aside
      className={`fixed left-0 top-0 h-screen z-40 flex flex-col border-r border-border/50 transition-all duration-300 ease-out ${
        collapsed ? "w-[68px]" : "w-[220px]"
      }`}
      style={{ background: "hsl(var(--sidebar-background))" }}
    >
      {/* Logo */}
      <div className={`h-16 flex items-center px-5 ${collapsed ? "justify-center" : ""}`}>
        {!collapsed && (
          <span className="text-lg font-semibold tracking-tight">
            Lift<span className="text-gold">OS</span>
          </span>
        )}
        {collapsed && (
          <span className="text-lg font-bold text-gold">L</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 mt-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 group
              text-[hsl(var(--text-secondary))] hover:text-foreground hover:bg-[hsl(var(--surface-2))]
              ${collapsed ? "justify-center px-0" : ""}`}
            activeClassName="!text-gold bg-[hsl(var(--surface-2))]"
          >
            <item.icon size={18} className="shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="px-3 pb-4">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs text-[hsl(var(--text-tertiary))] hover:text-[hsl(var(--text-secondary))] hover:bg-[hsl(var(--surface-2))] transition-colors duration-200"
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
