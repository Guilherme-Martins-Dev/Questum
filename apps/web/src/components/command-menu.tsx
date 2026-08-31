import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookOpen, Download, ListChecks, Monitor, Moon, Search, Sparkles, Sun } from "lucide-react";
import { useTheme } from "@/app/theme-provider";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useDisciplinas } from "@/features/questions/hooks/use-disciplinas";
import { salvarDisciplinaPreferida } from "@/features/questions/lib/disciplina-preferida";

/**
 * Paleta de comandos (Ctrl/Cmd+K) — navega entre páginas, pula direto pra
 * uma disciplina na revisão e troca o tema. Renderiza também o botão de
 * gatilho que fica no header.
 */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { setTheme } = useTheme();
  const disciplinas = useDisciplinas();

  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if ((evento.key === "k" || evento.key === "K") && (evento.metaKey || evento.ctrlKey)) {
        evento.preventDefault();
        setOpen((atual) => !atual);
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

  const executar = useCallback((acao: () => void) => {
    setOpen(false);
    acao();
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Abrir paleta de comandos"
      >
        <Search className="h-4 w-4" />
        <span className="hidden lg:inline">Buscar…</span>
        <kbd className="hidden rounded border border-border bg-muted px-1.5 font-mono text-[10px] leading-4 lg:inline">
          Ctrl K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Buscar páginas, disciplinas, tema…" />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>

          <CommandGroup heading="Navegar">
            <CommandItem onSelect={() => executar(() => navigate("/extraction"))}>
              <Sparkles />
              Nova extração
            </CommandItem>
            <CommandItem onSelect={() => executar(() => navigate("/questions"))}>
              <ListChecks />
              Revisar questões
            </CommandItem>
            <CommandItem onSelect={() => executar(() => navigate("/export"))}>
              <Download />
              Exportar XML
            </CommandItem>
          </CommandGroup>

          {disciplinas.data && disciplinas.data.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Disciplinas">
                {disciplinas.data.map((disciplina) => (
                  <CommandItem
                    key={disciplina.id}
                    value={`disciplina ${disciplina.nome}`}
                    onSelect={() =>
                      executar(() => {
                        salvarDisciplinaPreferida(disciplina.id);
                        navigate(`/questions?disciplinaId=${disciplina.id}`);
                      })
                    }
                  >
                    <BookOpen />
                    {disciplina.nome}
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading="Tema">
            <CommandItem value="tema claro" onSelect={() => executar(() => setTheme("light"))}>
              <Sun />
              Tema claro
            </CommandItem>
            <CommandItem value="tema escuro" onSelect={() => executar(() => setTheme("dark"))}>
              <Moon />
              Tema escuro
            </CommandItem>
            <CommandItem value="tema sistema" onSelect={() => executar(() => setTheme("system"))}>
              <Monitor />
              Tema do sistema
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
