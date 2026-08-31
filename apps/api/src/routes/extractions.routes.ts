import type { FastifyInstance } from "fastify";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { ExtracaoJob } from "@questum/shared";
import { db } from "../db/client";
import { extracoes } from "../db/schema";
import { criarJobExtracao, processarExtracao } from "../services/extraction-job.service";

const campoDisciplinaSchema = z.string().trim().min(2, "Informe o nome da disciplina.");

/**
 * POST /extractions — multipart/form-data: campo "disciplina" + um ou mais
 * campos "arquivos" (.docx).
 *
 * NÃO espera o pipeline terminar. Salva os arquivos numa pasta temporária,
 * cria um job (linha em `extracoes`), dispara o processamento em background
 * e responde 202 com o id. O frontend acompanha via GET /extractions/:id.
 *
 * A pasta temporária é limpa pelo próprio job no fim (sucesso ou erro).
 */
export async function extractionsRoutes(app: FastifyInstance) {
  app.post("/extractions", async (request, reply) => {
    const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), "questum-"));
    const caminhosArquivos: string[] = [];
    let disciplina = "";

    try {
      for await (const parte of request.parts()) {
        if (parte.type === "file") {
          // `parte.filename` vem do cliente — basename() barra path traversal
          // ("../../etc") e normaliza pra um nome de arquivo simples.
          const nomeSeguro = path.basename(parte.filename || "").trim();
          if (!nomeSeguro || !nomeSeguro.toLowerCase().endsWith(".docx")) {
            // Drena o stream pra não travar o parser do multipart.
            parte.file.resume();
            continue;
          }
          const destino = path.join(pastaTemp, nomeSeguro);
          await pipeline(parte.file, fs.createWriteStream(destino));
          caminhosArquivos.push(destino);
        } else if (parte.fieldname === "disciplina") {
          disciplina = String(parte.value);
        }
      }

      const disciplinaValidada = campoDisciplinaSchema.safeParse(disciplina);
      if (!disciplinaValidada.success) {
        fs.rm(pastaTemp, { recursive: true, force: true }, () => {});
        return reply.status(400).send({ erro: disciplinaValidada.error.flatten() });
      }
      if (caminhosArquivos.length === 0) {
        fs.rm(pastaTemp, { recursive: true, force: true }, () => {});
        return reply.status(400).send({ erro: "Envie pelo menos um arquivo .docx." });
      }

      const extracaoId = await criarJobExtracao(disciplinaValidada.data, caminhosArquivos.length);

      // Fire-and-forget: o job cuida do próprio ciclo de vida (status,
      // limpeza, erros). Nunca lança pra cá.
      void processarExtracao(
        extracaoId,
        disciplinaValidada.data,
        caminhosArquivos,
        pastaTemp,
        request.log,
      );

      return reply.status(202).send({ extracaoId });
    } catch (erro) {
      request.log.error(erro);
      fs.rm(pastaTemp, { recursive: true, force: true }, () => {});
      return reply.status(502).send({ erro: (erro as Error).message });
    }
  });

  app.get<{ Params: { id: string } }>("/extractions/:id", async (request, reply) => {
    const [registro] = await db.select().from(extracoes).where(eq(extracoes.id, request.params.id));
    if (!registro) {
      return reply.status(404).send({ erro: "Extração não encontrada." });
    }

    const job: ExtracaoJob = {
      id: registro.id,
      status: registro.status,
      disciplinaNome: registro.disciplinaNome,
      totalArquivos: registro.totalArquivos,
      disciplinaId: registro.disciplinaId,
      arquivosProcessados: registro.arquivosProcessados,
      questoesExtraidas: registro.questoesExtraidas,
      imagensExtraidas: registro.imagensExtraidas,
      formulasExtraidas: registro.formulasExtraidas,
      mensagemErro: registro.mensagemErro,
      aviso: registro.aviso,
      criadoEm: registro.criadoEm.toISOString(),
      atualizadoEm: registro.atualizadoEm.toISOString(),
    };
    return job;
  });
}
