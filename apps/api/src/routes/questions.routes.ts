import type { FastifyInstance } from "fastify";
import { eq, inArray } from "drizzle-orm";
import { editarQuestaoSchema } from "@questum/shared";
import { db } from "../db/client";
import { questoes, unidades, arquivos, disciplinas, alternativas, imagens, formulas } from "../db/schema";

/**
 * GET /disciplinas — lista as disciplinas já processadas, pra preencher o
 * seletor da tela de revisão.
 *
 * GET /questoes?disciplinaId=... — lista as questões de uma disciplina,
 * já com unidade e disciplina resolvidas por nome e as alternativas
 * agrupadas por questão (evita N+1: uma query pras questões, uma query
 * pra todas as alternativas de uma vez, junta em memória).
 */
export async function questionsRoutes(app: FastifyInstance) {
  app.get("/disciplinas", async () => {
    return db.select().from(disciplinas).orderBy(disciplinas.nome);
  });

  app.get<{ Querystring: { disciplinaId?: string } }>("/questoes", async (request, reply) => {
    const { disciplinaId } = request.query;
    if (!disciplinaId) {
      return reply.status(400).send({ erro: "Informe disciplinaId na query string." });
    }

    const linhas = await db
      .select({
        id: questoes.id,
        arquivoId: questoes.arquivoId,
        disciplinaId: arquivos.disciplinaId,
        unidadeId: questoes.unidadeId,
        titulo: questoes.titulo,
        tipo: questoes.tipo,
        dificuldade: questoes.dificuldade,
        enunciado: questoes.enunciado,
        justificativa: questoes.justificativa,
        temCodigoOuCalculo: questoes.temCodigoOuCalculo,
        criadoEm: questoes.criadoEm,
        unidadeNome: unidades.nome,
        disciplinaNome: disciplinas.nome,
      })
      .from(questoes)
      .innerJoin(arquivos, eq(questoes.arquivoId, arquivos.id))
      .innerJoin(disciplinas, eq(arquivos.disciplinaId, disciplinas.id))
      .leftJoin(unidades, eq(questoes.unidadeId, unidades.id))
      .where(eq(arquivos.disciplinaId, disciplinaId))
      // Sem isso, o Postgres não garante nenhuma ordem específica.
      // Ordenar por título (texto) criaria um bug diferente: "Questão 10"
      // viria antes de "Questão 9" (comparação de string, não numérica).
      // criadoEm reflete a ordem real em que a extração inseriu as
      // questões.
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

    return linhas.map((linha) => ({
      ...linha,
      alternativas: (alternativasPorQuestao.get(linha.id) ?? []).sort((a, b) => a.ordem - b.ordem),
      imagens: imagensPorQuestao.get(linha.id) ?? [],
      formulas: formulasPorQuestao.get(linha.id) ?? [],
    }));
  });

  /**
   * PATCH /questoes/:id — salva a edição feita na tela de revisão. Usa o
   * MESMO schema Zod (editarQuestaoSchema) que o formulário do frontend,
   * então as duas pontas validam exatamente as mesmas regras.
   *
   * Além dos campos simples da questão, agora também trata:
   * - "unidade": encontra ou cria a unidade pelo nome (escopada à mesma
   *   disciplina da questão) e reassocia questoes.unidadeId — permite
   *   mover uma questão de "Unidade 1" pra "Unidade 3", por exemplo.
   *   Enviar string vazia remove a unidade (unidadeId = null).
   * - "alternativas": atualiza texto/correta de cada alternativa
   *   existente (por id) — não cria nem remove alternativas, só edita as
   *   que a extração já gerou.
   * Tudo dentro de uma transação: ou tudo é salvo, ou nada é.
   */
  app.patch<{ Params: { id: string } }>("/questoes/:id", async (request, reply) => {
    const corpo = editarQuestaoSchema.safeParse(request.body);
    if (!corpo.success) {
      return reply.status(400).send({ erro: corpo.error.flatten() });
    }

    try {
      const atualizada = await db.transaction(async (tx) => {
        const [questaoAtual] = await tx
          .select({ arquivoId: questoes.arquivoId })
          .from(questoes)
          .where(eq(questoes.id, request.params.id));

        if (!questaoAtual) {
          return null;
        }

        let unidadeId: string | null | undefined = undefined; // undefined = não mexe no campo
        if (corpo.data.unidade !== undefined) {
          if (corpo.data.unidade === "") {
            unidadeId = null;
          } else {
            const [arquivoDaQuestao] = await tx
              .select({ disciplinaId: arquivos.disciplinaId })
              .from(arquivos)
              .where(eq(arquivos.id, questaoAtual.arquivoId));

            const [unidadeExistente] = await tx
              .select()
              .from(unidades)
              .where(eq(unidades.nome, corpo.data.unidade));

            if (unidadeExistente && unidadeExistente.disciplinaId === arquivoDaQuestao.disciplinaId) {
              unidadeId = unidadeExistente.id;
            } else {
              const [novaUnidade] = await tx
                .insert(unidades)
                .values({ disciplinaId: arquivoDaQuestao.disciplinaId, nome: corpo.data.unidade })
                .returning();
              unidadeId = novaUnidade.id;
            }
          }
        }

        const [questaoAtualizada] = await tx
          .update(questoes)
          .set({
            titulo: corpo.data.titulo,
            enunciado: corpo.data.enunciado,
            dificuldade: corpo.data.dificuldade || null,
            justificativa: corpo.data.justificativa,
            ...(unidadeId !== undefined ? { unidadeId } : {}),
            atualizadoEm: new Date(),
          })
          .where(eq(questoes.id, request.params.id))
          .returning();

        if (corpo.data.alternativas) {
          for (const alternativa of corpo.data.alternativas) {
            await tx
              .update(alternativas)
              .set({ texto: alternativa.texto, correta: alternativa.correta })
              .where(eq(alternativas.id, alternativa.id));
          }
        }

        return questaoAtualizada;
      });

      if (!atualizada) {
        return reply.status(404).send({ erro: "Questão não encontrada." });
      }

      return atualizada;
    } catch (erro) {
      // Sem isso, um erro do Postgres (ex: valor de enum inválido) vira
      // um 500 genérico sem explicação — aqui a mensagem real do banco
      // chega até o toast de erro no frontend.
      request.log.error(erro);
      return reply.status(502).send({ erro: (erro as Error).message });
    }
  });
}
