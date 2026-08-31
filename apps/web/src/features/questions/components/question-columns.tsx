import { createColumnHelper, type RowData } from "@tanstack/react-table";
import { ChevronRight, ImageIcon, Sigma } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SimpleTooltip } from "@/components/ui/tooltip";
import type { LinhaQuestao } from "../types";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Classes aplicadas em <th> e <td> desta coluna (largura, alinhamento). */
    cellClassName?: string;
  }
}

const columnHelper = createColumnHelper<LinhaQuestao>();

const corPorDificuldade = {
  Fácil: "success",
  Média: "warning",
  Difícil: "danger",
} as const;

// Ordem pedagógica — não a alfabética (que daria Difícil, Fácil, Média).
const rankDificuldade: Record<string, number> = { Fácil: 1, Média: 2, Difícil: 3 };

/** Comparação natural: "Questão 9" antes de "Questão 10", acentos tratados. */
function compararTextoNumerico(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

/** Tira marcadores de imagem/fórmula e quebras de linha pra um preview limpo. */
function resumirEnunciado(texto: string): string {
  return texto
    .replace(/__MOODLE_(IMAGE|FORMULA)_[^_]+__/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function criarColunas() {
  return [
    columnHelper.accessor("titulo", {
      header: "Questão",
      sortingFn: (a, b) => compararTextoNumerico(a.getValue("titulo"), b.getValue("titulo")),
      meta: { cellClassName: "w-[42%]" },
      cell: (info) => {
        const questao = info.row.original;
        return (
          <div className="min-w-0">
            <p className="truncate font-medium">{info.getValue()}</p>
            <p className="truncate text-xs text-muted-foreground">{resumirEnunciado(questao.enunciado)}</p>
          </div>
        );
      },
    }),
    columnHelper.accessor("tipo", {
      header: "Tipo",
      meta: { cellClassName: "w-[14%]" },
      cell: (info) => {
        const questao = info.row.original;
        return (
          <div className="whitespace-nowrap text-muted-foreground">
            {info.getValue()}
            {questao.tipo === "Objetiva" && questao.alternativas.length > 0 && (
              <span className="ml-1 text-xs">· {questao.alternativas.length} alt.</span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor("unidadeNome", {
      header: "Unidade",
      sortingFn: (a, b) =>
        compararTextoNumerico(
          (a.getValue("unidadeNome") as string | null) ?? "",
          (b.getValue("unidadeNome") as string | null) ?? "",
        ),
      meta: { cellClassName: "w-[13%]" },
      cell: (info) => (
        <span className="block truncate text-muted-foreground">{info.getValue() ?? "—"}</span>
      ),
    }),
    columnHelper.accessor("dificuldade", {
      header: "Dificuldade",
      sortingFn: (a, b) =>
        (rankDificuldade[a.getValue("dificuldade") as string] ?? 0) -
        (rankDificuldade[b.getValue("dificuldade") as string] ?? 0),
      meta: { cellClassName: "w-[12%]" },
      cell: (info) => {
        const valor = info.getValue();
        if (!valor) return <span className="text-muted-foreground">—</span>;
        return (
          <Badge variant={corPorDificuldade[valor as keyof typeof corPorDificuldade] ?? "default"}>
            {valor}
          </Badge>
        );
      },
    }),
    columnHelper.display({
      id: "anexos",
      header: "Anexos",
      enableSorting: false,
      meta: { cellClassName: "w-[11%]" },
      cell: (info) => {
        const { imagens, formulas } = info.row.original;
        if (imagens.length === 0 && formulas.length === 0) {
          return <span className="text-muted-foreground">—</span>;
        }
        return (
          <div className="flex items-center gap-3 whitespace-nowrap text-xs text-muted-foreground">
            {imagens.length > 0 && (
              <SimpleTooltip content={`${imagens.length} imagem(ns) nesta questão`}>
                <span className="flex items-center gap-1" aria-label={`${imagens.length} imagem(ns)`}>
                  <ImageIcon className="h-3.5 w-3.5" />
                  {imagens.length}
                </span>
              </SimpleTooltip>
            )}
            {formulas.length > 0 && (
              <SimpleTooltip content={`${formulas.length} fórmula(s) nesta questão`}>
                <span className="flex items-center gap-1" aria-label={`${formulas.length} fórmula(s)`}>
                  <Sigma className="h-3.5 w-3.5" />
                  {formulas.length}
                </span>
              </SimpleTooltip>
            )}
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "acao",
      header: "",
      enableSorting: false,
      meta: { cellClassName: "w-12" },
      cell: () => <ChevronRight className="h-4 w-4 text-muted-foreground" />,
    }),
  ];
}
