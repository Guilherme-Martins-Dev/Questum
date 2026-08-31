import { useQuery } from "@tanstack/react-query";
import type { ExtracaoJob } from "@questum/shared";

async function buscarJob(id: string): Promise<ExtracaoJob> {
  const resposta = await fetch(`/api/extractions/${id}`);
  if (!resposta.ok) throw new Error("Falha ao consultar o andamento da extração.");
  return resposta.json();
}

const EM_ANDAMENTO: ExtracaoJob["status"][] = ["pendente", "processando"];

/**
 * Faz polling do job de extração a cada 2s enquanto ele está em andamento;
 * para sozinho quando vira "concluido" ou "erro".
 */
export function useExtractionJob(id: string | null) {
  return useQuery({
    queryKey: ["extracao", id],
    queryFn: () => buscarJob(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && EM_ANDAMENTO.includes(status) ? 2000 : false;
    },
    staleTime: 0,
  });
}
