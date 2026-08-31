import { useEffect, useState } from "react";
import { Check, Download, FileCode, ImageIcon, Layers, ListChecks, Sigma } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Disciplina } from "@questum/shared";
import { useQuestions } from "@/features/questions/hooks/use-questions";
import { useExportXml } from "@/features/questions/hooks/use-export-xml";
import {
  escolherDisciplinaInicial,
  salvarDisciplinaPreferida,
} from "@/features/questions/lib/disciplina-preferida";

const INCLUI = [
  "Enunciados e alternativas (com a resposta correta)",
  "Justificativas / feedback geral",
  "Imagens embutidas no XML (base64)",
  "Fórmulas em LaTeX, renderizadas via MathJax no Moodle",
];

export function ExportForm({ disciplinas }: { disciplinas: Disciplina[] }) {
  const [disciplinaId, setDisciplinaId] = useState("");
  const { exportar, gerando } = useExportXml();

  useEffect(() => {
    if (disciplinaId) return;
    const inicial = escolherDisciplinaInicial(disciplinas);
    if (inicial) setDisciplinaId(inicial.id);
  }, [disciplinas, disciplinaId]);

  function selecionarDisciplina(id: string) {
    setDisciplinaId(id);
    salvarDisciplinaPreferida(id);
  }

  const questoes = useQuestions(disciplinaId);
  const dados = questoes.data ?? [];
  const totalQuestoes = dados.length;
  const semQuestoes = questoes.isSuccess && totalQuestoes === 0;

  const stats = {
    questoes: totalQuestoes,
    unidades: new Set(dados.map((q) => q.unidadeNome).filter(Boolean)).size,
    imagens: dados.reduce((soma, q) => soma + q.imagens.length, 0),
    formulas: dados.reduce((soma, q) => soma + q.formulas.length, 0),
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="disciplina-export">Disciplina</Label>
        <Select
          id="disciplina-export"
          value={disciplinaId}
          onChange={(evento) => selecionarDisciplina(evento.target.value)}
        >
          {disciplinas.map((disciplina) => (
            <option key={disciplina.id} value={disciplina.id}>
              {disciplina.nome}
            </option>
          ))}
        </Select>
      </div>

      {questoes.isLoading ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px]" />
          ))}
        </div>
      ) : questoes.isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          Não foi possível carregar o resumo desta disciplina.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat icone={ListChecks} valor={stats.questoes} rotulo="questões" />
          <Stat icone={Layers} valor={stats.unidades} rotulo="unidades" />
          <Stat icone={ImageIcon} valor={stats.imagens} rotulo="imagens" />
          <Stat icone={Sigma} valor={stats.formulas} rotulo="fórmulas" />
        </div>
      )}

      {semQuestoes && (
        <p className="rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-foreground">
          Essa disciplina ainda não tem questões. Rode uma extração antes de exportar.
        </p>
      )}

      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <FileCode className="h-4 w-4 text-muted-foreground" />O que vai no arquivo
        </p>
        <ul className="mt-2.5 space-y-1.5">
          {INCLUI.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <Button
          onClick={() => exportar(disciplinaId)}
          loading={gerando}
          disabled={!disciplinaId || semQuestoes}
          className="w-full sm:w-auto"
        >
          {!gerando && <Download className="h-4 w-4" />}
          {gerando ? "Gerando…" : "Baixar XML"}
        </Button>
        <p className="text-xs text-muted-foreground">
          No Moodle: <span className="font-medium text-foreground">Banco de questões → Importar</span>
          , formato <span className="font-medium text-foreground">Moodle XML</span>, e selecione o
          arquivo baixado.
        </p>
      </div>
    </div>
  );
}

function Stat({
  icone: Icone,
  valor,
  rotulo,
}: {
  icone: typeof ListChecks;
  valor: number;
  rotulo: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2.5 text-center">
      <Icone className="mx-auto h-4 w-4 text-muted-foreground" />
      <p className="mt-1 text-xl font-semibold tabular-nums">{valor}</p>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
    </div>
  );
}
