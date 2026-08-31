/**
 * Tipos do job de extração assíncrono.
 *
 * O POST /extractions não espera mais o pipeline terminar: cria um job
 * (linha na tabela `extracoes`), dispara o processamento em background e
 * responde na hora com o id. O frontend faz polling em GET /extractions/:id
 * até o status virar "concluido" ou "erro".
 */

export type StatusExtracao = "pendente" | "processando" | "concluido" | "erro";

export interface ExtracaoJob {
  id: string;
  status: StatusExtracao;
  disciplinaNome: string;
  totalArquivos: number;
  /** Preenchido quando status === "concluido" — pra onde o frontend navega. */
  disciplinaId: string | null;
  /** Quantos dos `totalArquivos` o pipeline já leu (progresso durante "processando"). */
  arquivosProcessados: number | null;
  questoesExtraidas: number | null;
  imagensExtraidas: number | null;
  formulasExtraidas: number | null;
  /** Preenchido quando status === "erro". */
  mensagemErro: string | null;
  /** Aviso não-fatal quando status === "concluido" (ex: arquivos duplicados ignorados). */
  aviso: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Resposta imediata do POST /extractions. */
export interface ExtracaoIniciada {
  extracaoId: string;
}
