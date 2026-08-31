import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/app/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const opcoes: { valor: Theme; rotulo: string; Icone: typeof Sun }[] = [
  { valor: "light", rotulo: "Claro", Icone: Sun },
  { valor: "dark", rotulo: "Escuro", Icone: Moon },
  { valor: "system", rotulo: "Sistema", Icone: Monitor },
];

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Alternar tema">
          {resolvedTheme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {opcoes.map(({ valor, rotulo, Icone }) => (
          <DropdownMenuItem
            key={valor}
            onSelect={() => setTheme(valor)}
            className={cn(theme === valor && "text-foreground font-medium")}
          >
            <Icone className="h-4 w-4" />
            {rotulo}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
