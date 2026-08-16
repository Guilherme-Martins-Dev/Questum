import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface IniciarExtracaoParams {
  disciplina: string;
  arquivos: File[];
}

interface RespostaExtracao {
  disciplinaId: string;
  questoesExtraidas: number;
  imagensExtraidas: number;
}

async function iniciarExtracao({ disciplina, arquivos }: IniciarExtracaoParams): Promise<RespostaExtracao> {
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

export function useExtractQuestions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: iniciarExtracao,
    onSuccess: (dados) => {
      toast.success(`${dados.questoesExtraidas} questão(ões) extraída(s)`);
      // Sem isso, a lista de disciplinas/questões em cache fica
      // desatualizada — quem for pra tela de revisão em seguida veria
      // dados velhos (ou a disciplina nova nem apareceria no seletor).
      queryClient.invalidateQueries({ queryKey: ["disciplinas"] });
      queryClient.invalidateQueries({ queryKey: ["questoes"] });
    },
    onError: (erro: Error) => {
      toast.error(erro.message);
    },
  });
}
