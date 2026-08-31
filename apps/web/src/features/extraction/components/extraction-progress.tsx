import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        icone={<AlertCircle className="h-5 w-5 text-destructive" />}
        titulo="Não foi possível acompanhar a extração"
        descricao="A conexão com o servidor caiu. A extração pode ter continuado — confira a tela de revisão em instantes."
        acao={<Button variant="secondary" onClick={onReset}>Voltar</Button>}
      />
    );
  }

  if (status === "erro") {
    return (
      <Estado
        icone={<AlertCircle className="h-5 w-5 text-destructive" />}
        titulo="A extração falhou"
        descricao={job.data?.mensagemErro ?? "Erro desconhecido no pipeline."}
        acao={<Button onClick={onReset}>Tentar de novo</Button>}
      />
    );
  }

  if (status === "concluido") {
    return (
      <Estado
        icone={<CheckCircle2 className="h-5 w-5 text-success" />}
        titulo="Extração concluída"
        descricao={`${job.data?.questoesExtraidas ?? 0} questão(ões), ${job.data?.imagensExtraidas ?? 0} imagem(ns) e ${job.data?.formulasExtraidas ?? 0} fórmula(s). Redirecionando…`}
      />
    );
  }

  const totalArquivos = job.data?.totalArquivos;
  return (
    <Estado
      icone={<Loader2 className="h-5 w-5 animate-spin text-primary" />}
      titulo="Extraindo questões com IA…"
      descricao={
        <>
          {totalArquivos
            ? `Processando ${totalArquivos} arquivo${totalArquivos > 1 ? "s" : ""}.`
            : "Preparando o processamento."}{" "}
          Pode levar alguns minutos — não feche esta aba.
          <span className="mt-1 block font-mono text-xs">Tempo decorrido: {formatarDuracao(decorrido)}</span>
        </>
      }
    />
  );
}

function Estado({
  icone,
  titulo,
  descricao,
  acao,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/30 p-8 text-center">
      {icone}
      <div>
        <p className="font-medium">{titulo}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{descricao}</p>
      </div>
      {acao}
    </div>
  );
}
