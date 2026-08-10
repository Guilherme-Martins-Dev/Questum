/**
 * Tipos centrais do domínio, compartilhados entre apps/web e apps/api.
 * Espelham exatamente o que o pipeline Python (extrair_json.py) devolve.
 */

export type TipoQuestao = "Objetiva" | "Discursiva";
export type Dificuldade = "Fácil" | "Média" | "Difícil" | "";

export interface ImagemExtraida {
  nome: string;
  marcador: string;
  content_type: string;
  base64: string;
}

/** Uma questão exatamente como sai do pipeline de extração (antes de persistir). */
export interface QuestaoExtraida {
  titulo: string;
  tipo: TipoQuestao;
  unidade: string;
  dificuldade: Dificuldade;
  enunciado: string;
  correta: string;
  incorretas: string[];
  justificativa: string;
  tem_codigo_ou_calculo: boolean;
  qtd_alternativas: number;
  tags: string[];
}

/** Resultado bruto do extrair_json.py (o que o child_process devolve). */
export interface ResultadoExtracao {
  questoes: QuestaoExtraida[];
  imagens: Record<string, ImagemExtraida>;
}

/** Uma questão já persistida no banco (id real, relações resolvidas). */
export interface Questao {
  id: string;
  arquivoId: string;
  disciplinaId: string;
  unidadeId: string | null;
  titulo: string;
  tipo: TipoQuestao;
  dificuldade: Dificuldade;
  enunciado: string;
  justificativa: string;
  temCodigoOuCalculo: boolean;
  criadoEm: string;
}

export interface Alternativa {
  id: string;
  questaoId: string;
  texto: string;
  correta: boolean;
  ordem: number;
}
