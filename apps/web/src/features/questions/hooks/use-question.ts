import { useQuery } from "@tanstack/react-query";
import type { QuestaoComRelacoes } from "@questum/shared";

async function buscarQuestao(id: string): Promise<QuestaoComRelacoes> {
  const resposta = await fetch(`/api/questoes/${id}`);
  if (!resposta.ok) throw new Error("Falha ao carregar a questão.");
  return resposta.json();
}

/**
 * Detalhe de uma questão, com o binário das imagens — usado só ao abrir a
 * edição. A lista (useQuestions) não traz isso pra não pesar o payload.
 */
export function useQuestion(id: string | null) {
  return useQuery({
    queryKey: ["questao", id],
    queryFn: () => buscarQuestao(id!),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
