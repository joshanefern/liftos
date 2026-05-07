import { LayoutDashboard, Dumbbell, TrendingUp, Sparkles, ChevronLeft, PlayCircle, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
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
      className={`fixed left-0 top-0 h-screen z-40 flex flex-col border-r border-white/[0.07] bg-[#0a0c15]/80 backdrop-blur-xl transition-all duration-300 ease-out ${
        collapsed ? "w-[68px]" : "w-[220px]"
      }`}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(184,147,66,0.22),transparent)]" />

      <div className={`h-16 flex items-center px-5 ${collapsed ? "justify-center" : ""}`}>
        {!collapsed && (
          <Link to="/" className="text-[13px] font-medium tracking-[0.22em] text-foreground/88 hover:text-foreground transition-colors duration-200">
            LIFT<span className="text-gold">OS</span>
          </Link>
        )}
        {collapsed && (
          <Link to="/" className="text-sm font-semibold text-gold tracking-[0.1em] hover:opacity-80 transition-opacity duration-200">L</Link>
        )}
      </div>

      <nav className="flex-1 px-3 mt-2 space-y-0.5">
        {navItems.map((item) => (
          <NavLink
            key={item.url}
            to={item.url}
            end
            className={`flex items-center gap-3 rounded-[0.875rem] px-3 py-2.5 text-sm transition-all duration-200 group
              text-foreground/40 hover:text-foreground hover:bg-white/[0.06]
              ${collapsed ? "justify-center px-0" : ""}`}
            activeClassName="!text-gold bg-white/[0.06] border border-white/10"
          >
            <item.icon size={17} className="shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 rounded-[0.875rem] px-3 py-2 text-xs text-foreground/30 hover:text-foreground/50 hover:bg-white/[0.04] transition-colors duration-200"
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
