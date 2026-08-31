import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ExtracaoIniciada } from "@questum/shared";

interface IniciarExtracaoParams {
  disciplina: string;
  arquivos: File[];
}

async function iniciarExtracao({ disciplina, arquivos }: IniciarExtracaoParams): Promise<ExtracaoIniciada> {
  const formData = new FormData();
  formData.append("disciplina", disciplina);
  arquivos.forEach((arquivo) => formData.append("arquivos", arquivo));

  const resposta = await fetch("/api/extractions", { method: "POST", body: formData });
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.erro ?? "Falha ao iniciar a extração.");
  }
  return resposta.json();
}

/**
 * Dispara a extração. Não espera o pipeline — devolve o id do job na hora;
 * quem acompanha o progresso (e invalida os caches no fim) é o
 * useExtractionJob.
 */
export function useExtractQuestions() {
  return useMutation({
    mutationFn: iniciarExtracao,
    onError: (erro: Error) => {
      toast.error(erro.message);
    },
  });
}
