import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { criarColunas } from "./question-columns";
import type { LinhaQuestao } from "../types";

// Carregado sob demanda: o diálogo puxa o KaTeX (renderização de fórmulas),
// que não precisa entrar no bundle inicial da listagem.
const QuestionEditDialog = lazy(() =>
  import("./question-edit-dialog").then((m) => ({ default: m.QuestionEditDialog })),
);

const TAMANHO_PAGINA = 20;

interface QuestionsTableProps {
  questoes: LinhaQuestao[];
  /** Nomes de unidade da disciplina — repassados ao diálogo de edição. */
  unidades: string[];
}

export function QuestionsTable({ questoes, unidades }: QuestionsTableProps) {
  const [questaoEmEdicao, setQuestaoEmEdicao] = useState<LinhaQuestao | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  const colunas = useMemo(() => criarColunas(), []);

  const table = useReactTable({
    data: questoes,
    columns: colunas,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: TAMANHO_PAGINA } },
    // Editar/salvar uma questão troca a referência do array (refetch) sem
    // mudar o conteúdo — não queremos que isso jogue o professor pra
    // página 1. O reset abaixo cobre a troca de filtro/disciplina.
    autoResetPageIndex: false,
  });

  const totalLinhas = questoes.length;
  useEffect(() => {
    table.setPageIndex(0);
  }, [totalLinhas, table]);

  const paginacao = table.getState().pagination;
  const totalPaginas = table.getPageCount();

  return (
    <>
      <div className="space-y-3">
        <div className="rounded-lg border border-border">
          <Table className="min-w-[720px] table-fixed">
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-muted/40">
                  {headerGroup.headers.map((header) => {
                    const podeOrdenar = header.column.getCanSort();
                    const ordenacao = header.column.getIsSorted();
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(header.column.columnDef.meta?.cellClassName)}
                        aria-sort={
                          ordenacao === "asc"
                            ? "ascending"
                            : ordenacao === "desc"
                              ? "descending"
                              : podeOrdenar
                                ? "none"
                                : undefined
                        }
                      >
                        {header.isPlaceholder ? null : podeOrdenar ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="-mx-1 flex items-center gap-1 rounded px-1 hover:text-foreground"
                          >
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {ordenacao === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : ordenacao === "desc" ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronsUpDown className="h-3.5 w-3.5 opacity-40" />
                            )}
                          </button>
                        ) : (
                          flexRender(header.column.columnDef.header, header.getContext())
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => setQuestaoEmEdicao(row.original)}
                  className="cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                  role="button"
                  tabIndex={0}
                  aria-label={`Editar questão: ${row.original.titulo}`}
                  onKeyDown={(evento) => {
                    if (evento.key === "Enter" || evento.key === " ") {
                      evento.preventDefault();
                      setQuestaoEmEdicao(row.original);
                    }
                  }}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className={cn(cell.column.columnDef.meta?.cellClassName)}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {totalPaginas > 1 && (
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>
              Página {paginacao.pageIndex + 1} de {totalPaginas}
            </span>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Próxima
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {questaoEmEdicao && (
        <Suspense fallback={null}>
          <QuestionEditDialog
            questao={questaoEmEdicao}
            onClose={() => setQuestaoEmEdicao(null)}
            unidades={unidades}
          />
        </Suspense>
      )}
    </>
  );
}
