import type { LinhaQuestao } from "../types";

export interface FiltrosQuestao {
  busca: string;
  tipo: string;
  dificuldade: string;
  unidade: string;
}

export const FILTROS_VAZIOS: FiltrosQuestao = { busca: "", tipo: "", dificuldade: "", unidade: "" };

/** minúsculas + sem acento, pra busca tolerante a diacríticos. */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export function temFiltroAtivo(filtros: FiltrosQuestao): boolean {
  return Boolean(filtros.busca || filtros.tipo || filtros.dificuldade || filtros.unidade);
}

/**
 * Aplica os filtros da tela de revisão a uma lista de questões. Puro e
 * síncrono — a página só embrulha isto num useMemo.
 */
export function filtrarQuestoes(
  questoes: LinhaQuestao[],
  filtros: FiltrosQuestao,
): LinhaQuestao[] {
  const termo = normalizar(filtros.busca.trim());
  return questoes.filter((q) => {
    if (filtros.tipo && q.tipo !== filtros.tipo) return false;
    if (filtros.dificuldade && (q.dificuldade || "") !== filtros.dificuldade) return false;
    if (filtros.unidade && q.unidadeNome !== filtros.unidade) return false;
    if (termo && !normalizar(`${q.titulo} ${q.enunciado}`).includes(termo)) return false;
    return true;
  });
}
