import { useQuery } from "@tanstack/react-query";
import type { QuestaoComRelacoes } from "@questum/shared";

async function buscarQuestoes(disciplinaId: string): Promise<QuestaoComRelacoes[]> {
  const resposta = await fetch(`/api/questoes?disciplinaId=${encodeURIComponent(disciplinaId)}`);
  if (!resposta.ok) throw new Error("Falha ao buscar questões.");
  return resposta.json();
}

export function useQuestions(disciplinaId: string | null) {
  return useQuery({
    queryKey: ["questoes", disciplinaId],
    queryFn: () => buscarQuestoes(disciplinaId!),
    enabled: Boolean(disciplinaId),
  });
}
