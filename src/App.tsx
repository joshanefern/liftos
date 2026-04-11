import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createContext, useContext, useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Workouts from "@/pages/Workouts";
import Progress from "@/pages/Progress";
import Coach from "@/pages/Coach";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

export const SidebarContext = createContext<{
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}>({ collapsed: false, setCollapsed: () => {} });

export const useSidebarState = () => useContext(SidebarContext);

/* App shell with sidebar for internal pages */
const AppShell = ({ children }: { children: React.ReactNode }) => {
  const { collapsed } = useSidebarState();
  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <main
        className="flex-1 transition-all duration-300 ease-out"
        style={{ marginLeft: collapsed ? 68 : 220 }}
      >
        {children}
      </main>
    </div>
  );
};

const App = () => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route
                path="/dashboard"
                element={<AppShell><Dashboard /></AppShell>}
              />
              <Route
                path="/workouts"
                element={<AppShell><Workouts /></AppShell>}
              />
              <Route
                path="/progress"
                element={<AppShell><Progress /></AppShell>}
              />
              <Route
                path="/coach"
                element={<AppShell><Coach /></AppShell>}
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SidebarContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
