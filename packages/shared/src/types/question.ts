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

export interface FormulaExtraida {
  nome: string;
  marcador: string;
  latex: string;
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
  /** Nome do arquivo .docx de origem — usado pra associar a questão ao arquivo certo quando a extração cobre múltiplos arquivos. */
  arquivo_origem: string;
}

/** Resultado bruto do extrair_json.py (o que o child_process devolve). */
export interface ResultadoExtracao {
  questoes: QuestaoExtraida[];
  imagens: Record<string, ImagemExtraida>;
  formulas: Record<string, FormulaExtraida>;
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

/** Imagem já persistida e associada a uma questão (formato do banco, diferente de ImagemExtraida). */
export interface ImagemQuestao {
  id: string;
  questaoId: string;
  nome: string;
  marcador: string;
  contentType: string;
  dadosBase64: string;
}

/** Fórmula já persistida e associada a uma questão (formato do banco). */
export interface FormulaQuestao {
  id: string;
  questaoId: string;
  marcador: string;
  latex: string;
}

/** Questão com relações resolvidas — formato devolvido por GET /questoes. */
export interface QuestaoComRelacoes extends Questao {
  unidadeNome: string | null;
  disciplinaNome: string;
  alternativas: Alternativa[];
  imagens: ImagemQuestao[];
  formulas: FormulaQuestao[];
}

export interface Disciplina {
  id: string;
  nome: string;
}
