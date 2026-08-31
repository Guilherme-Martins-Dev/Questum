import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { EditarQuestaoInput } from "@questum/shared";

async function atualizarQuestao(id: string, dados: EditarQuestaoInput) {
  const resposta = await fetch(`/api/questoes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dados),
  });
  if (!resposta.ok) {
    const corpo = await resposta.json().catch(() => ({}));
    throw new Error(corpo.erro ?? "Falha ao salvar a edição.");
  }
  return resposta.json();
}

export function useUpdateQuestion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, dados }: { id: string; dados: EditarQuestaoInput }) => atualizarQuestao(id, dados),
    onSuccess: () => {
      toast.success("Questão atualizada");
      queryClient.invalidateQueries({ queryKey: ["questoes"] });
      queryClient.invalidateQueries({ queryKey: ["questao"] });
    },
    onError: (erro: Error) => {
      toast.error(erro.message);
    },
  });
}
