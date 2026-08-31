import { useId, useRef, useState } from "react";
import { BookOpen, Check, FolderInput, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { normalizar } from "@/features/questions/lib/filtrar-questoes";

interface DisciplinaComboboxProps {
  id?: string;
  value: string;
  onChange: (valor: string) => void;
  /** Nomes das disciplinas já processadas. */
  disciplinas: string[];
  disabled?: boolean;
  error?: string;
}

export function DisciplinaCombobox({
  id,
  value,
  onChange,
  disciplinas,
  disabled,
  error,
}: DisciplinaComboboxProps) {
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const termo = normalizar(value.trim());
  const sugestoes = disciplinas
    .filter((nome) => !termo || normalizar(nome).includes(termo))
    .slice(0, 6);

  const correspondeExata = disciplinas.find(
    (nome) => normalizar(nome) === normalizar(value.trim()),
  );
  const mostrarCriar = value.trim().length >= 2 && !correspondeExata;

  // Itens navegáveis: sugestões + (opcional) "criar nova".
  const totalItens = sugestoes.length + (mostrarCriar ? 1 : 0);

  function selecionar(nome: string) {
    onChange(nome);
    setAberto(false);
    inputRef.current?.focus();
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      setAberto(true);
      setAtivo((i) => (totalItens ? (i + 1) % totalItens : 0));
    } else if (evento.key === "ArrowUp") {
      evento.preventDefault();
      setAtivo((i) => (totalItens ? (i - 1 + totalItens) % totalItens : 0));
    } else if (evento.key === "Enter" && aberto && totalItens > 0) {
      // Escolhe a sugestão em vez de submeter o formulário.
      evento.preventDefault();
      if (ativo < sugestoes.length) selecionar(sugestoes[ativo]);
      else setAberto(false);
    } else if (evento.key === "Escape") {
      setAberto(false);
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setAberto(true);
          setAtivo(0);
        }}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
        onKeyDown={aoTeclar}
        disabled={disabled}
        placeholder="Ex.: Banco de Dados"
        autoComplete="off"
        role="combobox"
        aria-expanded={aberto}
        aria-controls={listboxId}
        aria-autocomplete="list"
      />

      {aberto && (sugestoes.length > 0 || mostrarCriar) && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {sugestoes.map((nome, i) => (
            <li
              key={nome}
              role="option"
              aria-selected={i === ativo}
              onMouseDown={(e) => {
                e.preventDefault();
                selecionar(nome);
              }}
              onMouseEnter={() => setAtivo(i)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm",
                i === ativo && "bg-muted",
              )}
            >
              <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{nome}</span>
              {normalizar(nome) === normalizar(value.trim()) && (
                <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </li>
          ))}

          {mostrarCriar && (
            <li
              role="option"
              aria-selected={ativo === sugestoes.length}
              onMouseDown={(e) => {
                e.preventDefault();
                setAberto(false);
                inputRef.current?.focus();
              }}
              onMouseEnter={() => setAtivo(sugestoes.length)}
              className={cn(
                "mt-0.5 flex cursor-pointer items-center gap-2 rounded-sm border-t border-border px-2 py-2 text-sm",
                ativo === sugestoes.length && "bg-muted",
              )}
            >
              <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                Criar <span className="font-medium">"{value.trim()}"</span>
              </span>
            </li>
          )}
        </ul>
      )}

      <div className="mt-1.5 min-h-[1rem] text-xs text-muted-foreground">
        {error ? (
          <p className="text-destructive">{error}</p>
        ) : correspondeExata ? (
          <p className="flex items-start gap-1.5">
            <FolderInput className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Disciplina já processada. A extração vai{" "}
              <span className="font-medium text-foreground">adicionar</span> as questões dos arquivos
              a ela, sem apagar as que já existem.
            </span>
          </p>
        ) : value.trim().length >= 2 ? (
          <p className="flex items-start gap-1.5">
            <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Disciplina nova — será criada com o nome{" "}
              <span className="font-medium text-foreground">{value.trim()}</span> quando a extração
              rodar.
            </span>
          </p>
        ) : (
          <p>Digite o nome de uma disciplina nova ou escolha uma já processada.</p>
        )}
      </div>
    </div>
  );
}
