import { useMemo, useState } from "react";
import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { criarColunas } from "./question-columns";
import { QuestionEditDialog } from "./question-edit-dialog";
import type { LinhaQuestao } from "../types";

interface QuestionsTableProps {
  questoes: LinhaQuestao[];
}

export function QuestionsTable({ questoes }: QuestionsTableProps) {
  const [questaoEmEdicao, setQuestaoEmEdicao] = useState<LinhaQuestao | null>(null);

  const colunas = useMemo(() => criarColunas(setQuestaoEmEdicao), []);

  const table = useReactTable({
    data: questoes,
    columns: colunas,
    getCoreRowModel: getCoreRowModel(),
  });

  if (questoes.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-500">
        Nenhuma questão extraída ainda. Rode uma extração primeiro.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <QuestionEditDialog questao={questaoEmEdicao} onClose={() => setQuestaoEmEdicao(null)} />
    </>
  );
}
