import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, ImageIcon, ListChecks, Loader2, Sigma } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useExtractionJob } from "../hooks/use-extraction-job";

interface ExtractionProgressProps {
  extracaoId: string;
  /** Chamado quando o professor quer voltar ao formulário (erro ou cancelar). */
  onReset: () => void;
}

function formatarDuracao(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Variante = "processando" | "sucesso" | "erro";

const estiloVariante: Record<Variante, string> = {
  processando: "bg-primary/10 text-primary",
  sucesso: "bg-success/10 text-success",
  erro: "bg-destructive/10 text-destructive",
};

export function ExtractionProgress({ extracaoId, onReset }: ExtractionProgressProps) {
  const job = useExtractionJob(extracaoId);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const jaFinalizou = useRef(false);

  const [decorrido, setDecorrido] = useState(0);
  useEffect(() => {
    const inicio = Date.now();
    const timer = setInterval(() => setDecorrido(Math.floor((Date.now() - inicio) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const status = job.data?.status;

  useEffect(() => {
    if (!job.data || jaFinalizou.current) return;

    if (job.data.status === "concluido") {
      jaFinalizou.current = true;
      queryClient.invalidateQueries({ queryKey: ["disciplinas"] });
      queryClient.invalidateQueries({ queryKey: ["questoes"] });
      toast.success(`${job.data.questoesExtraidas ?? 0} questão(ões) extraída(s)`);
      if (job.data.aviso) {
        toast.warning(job.data.aviso, { duration: 10_000 });
      }
      if (job.data.disciplinaId) {
        navigate(`/questions?disciplinaId=${job.data.disciplinaId}`);
      }
    }

    if (job.data.status === "erro") {
      jaFinalizou.current = true;
      toast.error(job.data.mensagemErro ?? "A extração falhou.");
    }
  }, [job.data, navigate, queryClient]);

  if (job.isError) {
    return (
      <Estado
        variante="erro"
        icone={<AlertCircle className="h-6 w-6" />}
        titulo="Não foi possível acompanhar a extração"
        descricao="A conexão com o servidor caiu. A extração pode ter continuado — confira a tela de revisão em instantes."
        acao={
          <Button variant="secondary" onClick={onReset}>
            Voltar
          </Button>
        }
      />
    );
  }

  if (status === "erro") {
    return (
      <Estado
        variante="erro"
        icone={<AlertCircle className="h-6 w-6" />}
        titulo="A extração falhou"
        descricao={job.data?.mensagemErro ?? "Erro desconhecido no pipeline."}
        acao={<Button onClick={onReset}>Tentar de novo</Button>}
      />
    );
  }

  if (status === "concluido") {
    return (
      <Estado
        variante="sucesso"
        icone={<CheckCircle2 className="h-6 w-6" />}
        titulo="Extração concluída"
        descricao="Levando você para a revisão…"
      >
        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniStat icone={ListChecks} valor={job.data?.questoesExtraidas ?? 0} rotulo="questões" />
          <MiniStat icone={ImageIcon} valor={job.data?.imagensExtraidas ?? 0} rotulo="imagens" />
          <MiniStat icone={Sigma} valor={job.data?.formulasExtraidas ?? 0} rotulo="fórmulas" />
        </div>
      </Estado>
    );
  }

  const totalArquivos = job.data?.totalArquivos;
  return (
    <Estado
      variante="processando"
      icone={<Loader2 className="h-6 w-6 animate-spin" />}
      titulo="Extraindo questões com IA…"
      descricao={
        totalArquivos
          ? `Processando ${totalArquivos} ${totalArquivos > 1 ? "arquivos" : "arquivo"}. Pode levar alguns minutos — não feche esta aba.`
          : "Preparando o processamento…"
      }
    >
      <div className="mt-4 space-y-2">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
          <div className="barra-indeterminada h-full w-1/2 rounded-full bg-primary" />
        </div>
        <p className="text-center font-mono text-xs text-muted-foreground">
          {formatarDuracao(decorrido)}
        </p>
      </div>
    </Estado>
  );
}

function Estado({
  variante,
  icone,
  titulo,
  descricao,
  acao,
  children,
}: {
  variante: Variante;
  icone: React.ReactNode;
  titulo: string;
  descricao: React.ReactNode;
  acao?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-muted/30 px-6 py-10 text-center">
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-full",
          estiloVariante[variante],
        )}
      >
        {icone}
      </div>
      <p className="mt-4 text-base font-medium">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{descricao}</p>
      {children && <div className="w-full max-w-sm">{children}</div>}
      {acao && <div className="mt-5">{acao}</div>}
    </div>
  );
}

function MiniStat({
  icone: Icone,
  valor,
  rotulo,
}: {
  icone: typeof ListChecks;
  valor: number;
  rotulo: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-2 py-2.5">
      <Icone className="mx-auto h-4 w-4 text-muted-foreground" />
      <p className="mt-1 text-lg font-semibold tabular-nums">{valor}</p>
      <p className="text-[11px] text-muted-foreground">{rotulo}</p>
    </div>
  );
}
