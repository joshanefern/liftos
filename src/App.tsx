import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createContext, useContext, useState } from "react";
import AppSidebar from "@/components/AppSidebar";
import { FitnessBackground } from "@/components/FitnessBackground";
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import Workouts from "@/pages/Workouts";
import ActiveWorkout from "@/pages/ActiveWorkout";
import Calander from "@/pages/Calander";
import Progress from "@/pages/Progress";
import Coach from "@/pages/Coach";
import SignIn from "@/pages/auth/SignIn";
import CreateAccount from "@/pages/auth/CreateAccount";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import Onboarding from "@/pages/auth/Onboarding";
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
    <div className="flex min-h-screen w-full bg-[#0a0c15]">
      <FitnessBackground />
      <AppSidebar />
      <main
        className={`flex-1 transition-all duration-300 ease-out ${
          collapsed ? "ml-[68px]" : "ml-[68px] md:ml-[220px]"
        }`}
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
                path="/workouts/active"
                element={<AppShell><ActiveWorkout /></AppShell>}
              />
              <Route
                path="/calander"
                element={<AppShell><Calander /></AppShell>}
              />
              <Route
                path="/progress"
                element={<AppShell><Progress /></AppShell>}
              />
              <Route
                path="/coach"
                element={<AppShell><Coach /></AppShell>}
              />
              <Route path="/sign-in" element={<SignIn />} />
              <Route path="/create-account" element={<CreateAccount />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </SidebarContext.Provider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
