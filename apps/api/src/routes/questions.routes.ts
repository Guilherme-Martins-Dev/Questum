import type { FastifyInstance } from "fastify";
import { and, eq, inArray } from "drizzle-orm";
import { editarQuestaoSchema } from "@questum/shared";
import { db } from "../db/client";
import { questoes, unidades, arquivos, disciplinas, alternativas, imagens, formulas } from "../db/schema";

/** Colunas base da questão + nomes resolvidos — comum à lista e ao detalhe. */
const colunasQuestao = {
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
  atualizadoEm: questoes.atualizadoEm,
  unidadeNome: unidades.nome,
  disciplinaNome: disciplinas.nome,
} as const;

function agruparPor<T, K>(itens: T[], chave: (item: T) => K): Map<K, T[]> {
  const mapa = new Map<K, T[]>();
  for (const item of itens) {
    const k = chave(item);
    const lista = mapa.get(k) ?? [];
    lista.push(item);
    mapa.set(k, lista);
  }
  return mapa;
}

/**
 * Hidrata as questões com alternativas, imagens e fórmulas.
 * `comBase64` controla se o binário das imagens vai junto: a LISTA não
 * manda (payload pesado, só usa a contagem), o DETALHE manda.
 */
async function hidratarQuestoes<T extends { id: string }>(linhas: T[], comBase64: boolean) {
  const ids = linhas.map((l) => l.id);
  if (ids.length === 0) return [];

  const todasAlternativas = await db
    .select()
    .from(alternativas)
    .where(inArray(alternativas.questaoId, ids));

  const resumoImagem = {
    id: imagens.id,
    questaoId: imagens.questaoId,
    nome: imagens.nome,
    marcador: imagens.marcador,
    contentType: imagens.contentType,
  };
  const todasImagens = comBase64
    ? await db.select().from(imagens).where(inArray(imagens.questaoId, ids))
    : await db.select(resumoImagem).from(imagens).where(inArray(imagens.questaoId, ids));

  const todasFormulas = await db.select().from(formulas).where(inArray(formulas.questaoId, ids));

  const altPorQuestao = agruparPor(todasAlternativas, (a) => a.questaoId);
  const imgPorQuestao = agruparPor(todasImagens, (i) => i.questaoId);
  const formPorQuestao = agruparPor(todasFormulas, (f) => f.questaoId);

  return linhas.map((linha) => ({
    ...linha,
    alternativas: (altPorQuestao.get(linha.id) ?? []).sort((a, b) => a.ordem - b.ordem),
    imagens: imgPorQuestao.get(linha.id) ?? [],
    formulas: formPorQuestao.get(linha.id) ?? [],
  }));
}

export async function questionsRoutes(app: FastifyInstance) {
  app.get("/disciplinas", async () => {
    return db.select().from(disciplinas).orderBy(disciplinas.nome);
  });

  /**
   * GET /questoes?disciplinaId=... — lista as questões de uma disciplina.
   * Imagens vêm SEM o binário (dadosBase64); pra ver a imagem de verdade,
   * o frontend chama GET /questoes/:id ao abrir a edição.
   */
  app.get<{ Querystring: { disciplinaId?: string } }>("/questoes", async (request, reply) => {
    const { disciplinaId } = request.query;
    if (!disciplinaId) {
      return reply.status(400).send({ erro: "Informe disciplinaId na query string." });
    }

    const linhas = await db
      .select(colunasQuestao)
      .from(questoes)
      .innerJoin(arquivos, eq(questoes.arquivoId, arquivos.id))
      .innerJoin(disciplinas, eq(arquivos.disciplinaId, disciplinas.id))
      .leftJoin(unidades, eq(questoes.unidadeId, unidades.id))
      .where(eq(arquivos.disciplinaId, disciplinaId))
      // criadoEm reflete a ordem real em que a extração inseriu as questões
      // (ordenar por título faria "Questão 10" vir antes de "Questão 9").
      .orderBy(questoes.criadoEm);

    return hidratarQuestoes(linhas, false);
  });

  /** GET /questoes/:id — uma questão completa, COM o binário das imagens. */
  app.get<{ Params: { id: string } }>("/questoes/:id", async (request, reply) => {
    const linhas = await db
      .select(colunasQuestao)
      .from(questoes)
      .innerJoin(arquivos, eq(questoes.arquivoId, arquivos.id))
      .innerJoin(disciplinas, eq(arquivos.disciplinaId, disciplinas.id))
      .leftJoin(unidades, eq(questoes.unidadeId, unidades.id))
      .where(eq(questoes.id, request.params.id));

    if (linhas.length === 0) {
      return reply.status(404).send({ erro: "Questão não encontrada." });
    }

    const [questao] = await hidratarQuestoes(linhas, true);
    return questao;
  });

  /**
   * PATCH /questoes/:id — salva a edição feita na tela de revisão. Usa o
   * MESMO schema Zod (editarQuestaoSchema) que o formulário do frontend.
   *
   * - "unidade": encontra ou cria a unidade pelo nome (escopada à mesma
   *   disciplina) e reassocia questoes.unidadeId. String vazia remove.
   * - "alternativas": atualiza texto/correta de cada alternativa existente
   *   (por id) — não cria nem remove.
   * Tudo dentro de uma transação.
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

            // find-or-create escopado à disciplina — unique (disciplina_id, nome)
            // garante que o onConflictDoNothing + select devolvem a linha certa.
            await tx
              .insert(unidades)
              .values({ disciplinaId: arquivoDaQuestao.disciplinaId, nome: corpo.data.unidade })
              .onConflictDoNothing();
            const [unidade] = await tx
              .select({ id: unidades.id })
              .from(unidades)
              .where(
                and(
                  eq(unidades.disciplinaId, arquivoDaQuestao.disciplinaId),
                  eq(unidades.nome, corpo.data.unidade),
                ),
              );
            unidadeId = unidade.id;
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
      request.log.error(erro);
      return reply.status(502).send({ erro: (erro as Error).message });
    }
  });
}
