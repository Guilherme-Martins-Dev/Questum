import type { FastifyInstance } from "fastify";
import { gerarXmlDisciplina } from "../services/xml-export.service";

/**
 * GET /disciplinas/:id/export — gera e devolve o XML do Moodle pra
 * download direto (Content-Disposition: attachment), a partir dos dados
 * já persistidos/editados no Postgres.
 */
export async function exportRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/disciplinas/:id/export", async (request, reply) => {
    const resultado = await gerarXmlDisciplina(request.params.id);
    if (!resultado) {
      return reply.status(404).send({ erro: "Disciplina não encontrada." });
    }

    const nomeArquivo = `${resultado.nomeDisciplina.replace(/[^\w\-]+/g, "_")}.xml`;

    return reply
      .header("Content-Type", "application/xml; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="${nomeArquivo}"`)
      .send(resultado.xml);
  });
}
