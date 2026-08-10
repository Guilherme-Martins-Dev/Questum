import type { FastifyInstance } from "fastify";
import { iniciarExtracaoSchema } from "@questum/shared";
import { db } from "../db/client";
import { arquivos, disciplinas, unidades, questoes, alternativas, imagens } from "../db/schema";
import { executarExtracao } from "../services/extraction.service";
import { eq } from "drizzle-orm";

/**
 * POST /extractions
 * Corpo: { disciplina: string, caminhosArquivos: string[] }
 *
 * Aciona o pipeline Python, e persiste tudo no Postgres:
 * disciplina (upsert) -> arquivo -> questões -> alternativas -> imagens.
 *
 * Nota: esta rota AGUARDA o pipeline terminar antes de responder (mais
 * simples pra começar). Se os lotes crescerem e isso virar um problema de
 * timeout, trocar por um padrão de job assíncrono (fila + polling).
 */
export async function extractionsRoutes(app: FastifyInstance) {
  app.post("/extractions", async (request, reply) => {
    const corpo = iniciarExtracaoSchema
      .extend({ caminhosArquivos: iniciarExtracaoSchema.shape.arquivoIds })
      .safeParse(request.body);

    if (!corpo.success) {
      return reply.status(400).send({ erro: corpo.error.flatten() });
    }

    const { disciplina, caminhosArquivos } = corpo.data;

    try {
      const resultado = await executarExtracao(disciplina, caminhosArquivos);

      const [disciplinaRegistro] = await db
        .insert(disciplinas)
        .values({ nome: disciplina })
        .onConflictDoUpdate({ target: disciplinas.nome, set: { nome: disciplina } })
        .returning();

      const cacheUnidades = new Map<string, string>(); // nome -> id

      for (const nomeArquivo of caminhosArquivos) {
        const [arquivoRegistro] = await db
          .insert(arquivos)
          .values({
            disciplinaId: disciplinaRegistro.id,
            nomeArquivo,
            status: "concluido",
          })
          .returning();

        const questoesDesseArquivo = resultado.questoes; // já vem tudo junto do pipeline

        for (const q of questoesDesseArquivo) {
          let unidadeId: string | null = null;
          if (q.unidade) {
            if (!cacheUnidades.has(q.unidade)) {
              const [unidadeRegistro] = await db
                .insert(unidades)
                .values({ disciplinaId: disciplinaRegistro.id, nome: q.unidade })
                .returning();
              cacheUnidades.set(q.unidade, unidadeRegistro.id);
            }
            unidadeId = cacheUnidades.get(q.unidade)!;
          }

          const [questaoRegistro] = await db
            .insert(questoes)
            .values({
              arquivoId: arquivoRegistro.id,
              unidadeId,
              titulo: q.titulo,
              tipo: q.tipo,
              dificuldade: q.dificuldade || null,
              enunciado: q.enunciado,
              justificativa: q.justificativa,
              temCodigoOuCalculo: q.tem_codigo_ou_calculo,
            })
            .returning();

          if (q.tipo === "Objetiva") {
            await db.insert(alternativas).values([
              { questaoId: questaoRegistro.id, texto: q.correta, correta: true, ordem: 0 },
              ...q.incorretas.map((texto, i) => ({
                questaoId: questaoRegistro.id,
                texto,
                correta: false,
                ordem: i + 1,
              })),
            ]);
          }
        }
      }

      for (const imagem of Object.values(resultado.imagens)) {
        // Associação exata de imagem -> questão fica pra um refinamento
        // futuro (hoje persistimos o material bruto; falta casar pelo
        // marcador dentro do texto de cada questão).
        void imagem;
      }

      return reply.status(201).send({
        disciplinaId: disciplinaRegistro.id,
        questoesExtraidas: resultado.questoes.length,
        imagensExtraidas: Object.keys(resultado.imagens).length,
      });
    } catch (erro) {
      request.log.error(erro);
      return reply.status(502).send({ erro: (erro as Error).message });
    }
  });
}
