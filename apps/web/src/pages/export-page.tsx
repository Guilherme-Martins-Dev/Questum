import { useEffect, useState } from "react";
import { Download, FileCode } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisciplinas } from "@/features/questions/hooks/use-disciplinas";
import { useExportXml } from "@/features/questions/hooks/use-export-xml";
import {
  escolherDisciplinaInicial,
  salvarDisciplinaPreferida,
} from "@/features/questions/lib/disciplina-preferida";

export function ExportPage() {
  const disciplinas = useDisciplinas();
  const [disciplinaId, setDisciplinaId] = useState("");

  useEffect(() => {
    if (disciplinaId || !disciplinas.data || disciplinas.data.length === 0) return;
    const inicial = escolherDisciplinaInicial(disciplinas.data);
    if (inicial) setDisciplinaId(inicial.id);
  }, [disciplinas.data, disciplinaId]);

  const { exportar, gerando } = useExportXml();

  function selecionarDisciplina(id: string) {
    setDisciplinaId(id);
    salvarDisciplinaPreferida(id);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Exportar XML"
        description="Gera o arquivo no formato de importação de questões do Moodle, a partir do que já foi revisado."
      />

      <Card>
        <CardContent className="space-y-5 pt-6">
          {disciplinas.isLoading && <Skeleton className="h-9 w-full" />}

          {disciplinas.data && disciplinas.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma disciplina processada ainda. Rode uma extração primeiro.
            </p>
          )}

          {disciplinas.data && disciplinas.data.length > 0 && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="disciplina-export">Disciplina</Label>
                <Select
                  id="disciplina-export"
                  value={disciplinaId}
                  onChange={(evento) => selecionarDisciplina(evento.target.value)}
                >
                  {disciplinas.data.map((disciplina) => (
                    <option key={disciplina.id} value={disciplina.id}>
                      {disciplina.nome}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex items-start gap-3 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
                <FileCode className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  O arquivo inclui enunciados, alternativas, imagens e fórmulas (LaTeX) de todas as
                  unidades da disciplina.
                </p>
              </div>

              <Button onClick={() => exportar(disciplinaId)} loading={gerando} disabled={!disciplinaId}>
                {!gerando && <Download className="h-4 w-4" />}
                {gerando ? "Gerando…" : "Baixar XML"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
