import { useState } from "react";
import { Menu, X } from "lucide-react";

const Navigation = () => {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="font-heading text-xl font-semibold tracking-tight">
          KINETIC
        </a>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-8">
          <a href="#programs" className="body-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Programs</a>
          <a href="#featured" className="body-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Today</a>
          <a href="#stats" className="body-sm text-muted-foreground hover:text-foreground transition-colors duration-200">Progress</a>
          <button className="bg-foreground text-background px-5 py-2 text-sm font-medium rounded-full hover:opacity-90 transition-opacity active:scale-[0.97] duration-150">
            Start Free
          </button>
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden p-2 active:scale-95 transition-transform"
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-background border-b border-border px-6 pb-6 pt-2 animate-reveal-up">
          <div className="flex flex-col gap-4">
            <a href="#programs" onClick={() => setOpen(false)} className="body-sm text-muted-foreground">Programs</a>
            <a href="#featured" onClick={() => setOpen(false)} className="body-sm text-muted-foreground">Today</a>
            <a href="#stats" onClick={() => setOpen(false)} className="body-sm text-muted-foreground">Progress</a>
            <button className="bg-foreground text-background px-5 py-3 text-sm font-medium rounded-full mt-2 active:scale-[0.97]">
              Start Free
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation;
