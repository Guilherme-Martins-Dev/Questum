import { NavLink, Outlet } from "react-router-dom";
import { FileStack } from "lucide-react";
import { cn } from "@/lib/utils";
import { CommandMenu } from "@/components/command-menu";
import { ThemeToggle } from "./theme-toggle";

const navItems = [
  { to: "/extraction", label: "Extração" },
  { to: "/questions", label: "Revisão" },
  { to: "/export", label: "Exportar" },
];

export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <NavLink to="/" className="flex items-center gap-2 font-semibold">
            <FileStack className="h-5 w-5 text-primary" />
            <span>Questum</span>
          </NavLink>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <CommandMenu />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
