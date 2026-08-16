import { useQuery } from "@tanstack/react-query";
import type { Disciplina } from "@questum/shared";

async function buscarDisciplinas(): Promise<Disciplina[]> {
  const resposta = await fetch("/api/disciplinas");
  if (!resposta.ok) throw new Error("Falha ao buscar disciplinas.");
  return resposta.json();
}

export function useDisciplinas() {
  return useQuery({ queryKey: ["disciplinas"], queryFn: buscarDisciplinas });
}
