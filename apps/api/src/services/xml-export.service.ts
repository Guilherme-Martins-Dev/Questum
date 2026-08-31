import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { questoes, unidades, arquivos, disciplinas, alternativas, imagens, formulas } from "../db/schema";
import { montarXmlQuiz, validarQuestoes, type QuestaoParaExportar } from "./xml-export.build";

/**
 * Gera o XML do Moodle a partir dos dados JÁ PERSISTIDOS (e possivelmente
 * editados na tela de revisão) — diferente do formatador.py original, que
 * gerava a partir do resultado bruto da IA. Esse é o motivo de existir
 * essa segunda implementação: só o Postgres tem a versão final, com as
 * edições do usuário. A formatação em si mora em xml-export.build.ts.
 */
export async function gerarXmlDisciplina(
  disciplinaId: string,
): Promise<{ xml: string; nomeDisciplina: string; avisos: string[] } | null> {
  const [disciplina] = await db.select().from(disciplinas).where(eq(disciplinas.id, disciplinaId));
  if (!disciplina) return null;

  const linhas = await db
    .select({
      id: questoes.id,
      titulo: questoes.titulo,
      tipo: questoes.tipo,
      dificuldade: questoes.dificuldade,
      enunciado: questoes.enunciado,
      justificativa: questoes.justificativa,
      unidadeNome: unidades.nome,
    })
    .from(questoes)
    .innerJoin(arquivos, eq(questoes.arquivoId, arquivos.id))
    .leftJoin(unidades, eq(questoes.unidadeId, unidades.id))
    .where(eq(arquivos.disciplinaId, disciplinaId))
    .orderBy(questoes.criadoEm);

  const idsQuestoes = linhas.map((linha) => linha.id);

  const todasAlternativas = idsQuestoes.length
    ? await db.select().from(alternativas).where(inArray(alternativas.questaoId, idsQuestoes))
    : [];
  const alternativasPorQuestao = new Map<string, typeof todasAlternativas>();
  for (const alternativa of todasAlternativas) {
    const lista = alternativasPorQuestao.get(alternativa.questaoId) ?? [];
    lista.push(alternativa);
    alternativasPorQuestao.set(alternativa.questaoId, lista);
  }

  const todasImagens = idsQuestoes.length
    ? await db.select().from(imagens).where(inArray(imagens.questaoId, idsQuestoes))
    : [];
  const imagensPorQuestao = new Map<string, typeof todasImagens>();
  for (const imagem of todasImagens) {
    const lista = imagensPorQuestao.get(imagem.questaoId) ?? [];
    lista.push(imagem);
    imagensPorQuestao.set(imagem.questaoId, lista);
  }

  const todasFormulas = idsQuestoes.length
    ? await db.select().from(formulas).where(inArray(formulas.questaoId, idsQuestoes))
    : [];
  const formulasPorQuestao = new Map<string, typeof todasFormulas>();
  for (const formula of todasFormulas) {
    const lista = formulasPorQuestao.get(formula.questaoId) ?? [];
    lista.push(formula);
    formulasPorQuestao.set(formula.questaoId, lista);
  }

  const questoesParaExportar: QuestaoParaExportar[] = linhas.map((linha) => ({
    ...linha,
    disciplinaNome: disciplina.nome,
    alternativas: (alternativasPorQuestao.get(linha.id) ?? [])
      .sort((a, b) => a.ordem - b.ordem)
      .map((a) => ({ texto: a.texto, correta: a.correta })),
    imagens: imagensPorQuestao.get(linha.id) ?? [],
    formulas: formulasPorQuestao.get(linha.id) ?? [],
  }));

  return {
    xml: montarXmlQuiz(disciplina.nome, questoesParaExportar),
    nomeDisciplina: disciplina.nome,
    avisos: validarQuestoes(questoesParaExportar),
  };
}
