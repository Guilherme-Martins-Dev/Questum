import type { FastifyInstance } from "fastify";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { db } from "../db/client";
import { arquivos, disciplinas, unidades, questoes, alternativas, imagens, formulas } from "../db/schema";
import { executarExtracao } from "../services/extraction.service";

const campoDisciplinaSchema = z.string().trim().min(2, "Informe o nome da disciplina.");

/**
 * POST /extractions
 * multipart/form-data: campo "disciplina" (texto) + um ou mais campos
 * "arquivos" (arquivos .docx).
 *
 * Diferente da primeira versão desta rota: agora ela lê os arquivos de
 * verdade do multipart (via @fastify/multipart) e salva cada um numa pasta
 * temporária do servidor ANTES de chamar o pipeline — o Python precisa de
 * caminhos de arquivo reais em disco, não recebe bytes diretamente.
 *
 * Nota: esta rota AGUARDA o pipeline terminar antes de responder (mais
 * simples pra começar). Se os lotes crescerem e isso virar um problema de
 * timeout, trocar por um padrão de job assíncrono (fila + polling).
 */
export async function extractionsRoutes(app: FastifyInstance) {
  app.post("/extractions", async (request, reply) => {
    const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), "questum-"));
    const caminhosArquivos: string[] = [];
    let disciplina = "";

    try {
      for await (const parte of request.parts()) {
        if (parte.type === "file") {
          const destino = path.join(pastaTemp, parte.filename);
          await pipeline(parte.file, fs.createWriteStream(destino));
          caminhosArquivos.push(destino);
        } else if (parte.fieldname === "disciplina") {
          disciplina = String(parte.value);
        }
      }

      const disciplinaValidada = campoDisciplinaSchema.safeParse(disciplina);
      if (!disciplinaValidada.success) {
        return reply.status(400).send({ erro: disciplinaValidada.error.flatten() });
      }
      if (caminhosArquivos.length === 0) {
        return reply.status(400).send({ erro: "Envie pelo menos um arquivo .docx." });
      }

      const resultado = await executarExtracao(disciplinaValidada.data, caminhosArquivos);

      const [disciplinaRegistro] = await db
        .insert(disciplinas)
        .values({ nome: disciplinaValidada.data })
        .onConflictDoUpdate({ target: disciplinas.nome, set: { nome: disciplinaValidada.data } })
        .returning();

      // 1) Cria o registro de arquivo pra cada .docx enviado, ANTES de
      // tocar nas questões — e guarda um mapa nome -> id, pra usar como
      // referência na hora de associar cada questão ao arquivo certo.
      const arquivoIdPorNome = new Map<string, string>();
      for (const nomeArquivoOriginal of caminhosArquivos.map((p) => path.basename(p))) {
        const [arquivoRegistro] = await db
          .insert(arquivos)
          .values({
            disciplinaId: disciplinaRegistro.id,
            nomeArquivo: nomeArquivoOriginal,
            status: "concluido",
          })
          .returning();
        arquivoIdPorNome.set(nomeArquivoOriginal, arquivoRegistro.id);
      }

      // 2) UM laço só sobre TODAS as questões (não um por arquivo) — cada
      // questão sabe de qual arquivo veio (campo "arquivo_origem", que o
      // extrair_json.py agora preenche) e é associada só a ele. Antes,
      // esse laço ficava DENTRO do laço de arquivos, inserindo a lista
      // inteira de questões repetida uma vez por arquivo — com 2 arquivos,
      // dobrava tudo; com 3, triplicava; e assim por diante.
      const cacheUnidades = new Map<string, string>(); // nome -> id

      for (const q of resultado.questoes) {
        const arquivoId = arquivoIdPorNome.get(q.arquivo_origem);
        if (!arquivoId) {
          request.log.warn(`Questão "${q.titulo}" com arquivo_origem desconhecido: ${q.arquivo_origem}`);
          continue;
        }

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
            arquivoId,
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

        // Associação imagem <-> questão: casa pelo marcador
        // __MOODLE_IMAGE_<hash>__ que sobrou em algum campo de texto
        // da questão (o mesmo marcador que o pipeline gerou ao extrair
        // a imagem do .docx). Uma questão pode ter mais de uma imagem.
        const textoCompletoDaQuestao = [q.enunciado, q.correta, ...q.incorretas, q.justificativa ?? ""].join(
          "\n",
        );
        for (const imagem of Object.values(resultado.imagens)) {
          if (textoCompletoDaQuestao.includes(imagem.marcador)) {
            await db.insert(imagens).values({
              questaoId: questaoRegistro.id,
              nome: imagem.nome,
              marcador: imagem.marcador,
              contentType: imagem.content_type,
              dadosBase64: imagem.base64,
            });
          }
        }

        // Associação fórmula <-> questão: mesmo princípio da imagem,
        // casando pelo marcador __MOODLE_FORMULA_<hash>__.
        for (const formula of Object.values(resultado.formulas)) {
          if (textoCompletoDaQuestao.includes(formula.marcador)) {
            await db.insert(formulas).values({
              questaoId: questaoRegistro.id,
              marcador: formula.marcador,
              latex: formula.latex,
            });
          }
        }
      }

      return reply.status(201).send({
        disciplinaId: disciplinaRegistro.id,
        questoesExtraidas: resultado.questoes.length,
        imagensExtraidas: Object.keys(resultado.imagens).length,
        formulasExtraidas: Object.keys(resultado.formulas).length,
      });
    } catch (erro) {
      request.log.error(erro);
      return reply.status(502).send({ erro: (erro as Error).message });
    } finally {
      fs.rm(pastaTemp, { recursive: true, force: true }, () => {});
    }
  });
}
