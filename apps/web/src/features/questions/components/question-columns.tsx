import { createColumnHelper } from "@tanstack/react-table";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LinhaQuestao } from "../types";

const columnHelper = createColumnHelper<LinhaQuestao>();

const corPorDificuldade = {
  Fácil: "success",
  Média: "warning",
  Difícil: "danger",
} as const;

// Recebe o callback de edição como parâmetro (em vez de importar direto)
// porque a ação de abrir o diálogo precisa de estado que vive no
// componente pai (qual questão está selecionada) — as colunas em si não
// têm estado próprio.
export function criarColunas(onEditar: (questao: LinhaQuestao) => void) {
  return [
    columnHelper.accessor("titulo", {
      header: "Questão",
      cell: (info) => <span className="line-clamp-1">{info.getValue()}</span>,
    }),
    columnHelper.accessor("tipo", {
      header: "Tipo",
      cell: (info) => <span className="text-neutral-500">{info.getValue()}</span>,
    }),
    columnHelper.accessor("unidadeNome", {
      header: "Unidade",
      cell: (info) => <span className="text-neutral-500">{info.getValue() ?? "—"}</span>,
    }),
    columnHelper.accessor("dificuldade", {
      header: "Dificuldade",
      cell: (info) => {
        const valor = info.getValue();
        if (!valor) return <span className="text-neutral-400">—</span>;
        return (
          <Badge variant={corPorDificuldade[valor as keyof typeof corPorDificuldade] ?? "default"}>{valor}</Badge>
        );
      },
    }),
    columnHelper.display({
      id: "acoes",
      header: "",
      cell: (info) => (
        <button
          onClick={() => onEditar(info.row.original)}
          className="text-neutral-400 hover:text-neutral-700"
          aria-label="Editar questão"
        >
          <Pencil className="h-4 w-4" />
        </button>
      ),
    }),
  ];
}
