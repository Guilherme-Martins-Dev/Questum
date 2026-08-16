import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { questoes, unidades, arquivos, disciplinas, alternativas, imagens } from "../db/schema";

/**
 * Gera o XML do Moodle a partir dos dados JÁ PERSISTIDOS (e possivelmente
 * editados na tela de revisão) — diferente do formatador.py original, que
 * gerava a partir do resultado bruto da IA. Esse é o motivo de existir
 * essa segunda implementação: só o Postgres tem a versão final, com as
 * edições do usuário.
 */

function cdata(texto: string): string {
  // "]]>" é o único jeito de "escapar" de dentro de um CDATA — se o texto
  // contiver essa sequência literal (raro, mas possível), precisa quebrar
  // em dois blocos CDATA consecutivos.
  const seguro = (texto ?? "").replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${seguro}]]>`;
}

function escapeAttr(texto: string): string {
  return (texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ImagemRegistro {
  nome: string;
  marcador: string;
  contentType: string;
  dadosBase64: string;
}

function textoComImagensHtml(texto: string | null, imagensDisponiveis: ImagemRegistro[]): { html: string; usadas: ImagemRegistro[] } {
  if (!texto) return { html: "", usadas: [] };
  const usadas: ImagemRegistro[] = [];
  let html = texto;
  for (const imagem of imagensDisponiveis) {
    if (html.includes(imagem.marcador)) {
      usadas.push(imagem);
      const tag = `<p><img src="@@PLUGINFILE@@/${escapeAttr(imagem.nome)}" alt="Imagem da questão" style="max-width:100%;height:auto;"></p>`;
      html = html.split(imagem.marcador).join(tag);
    }
  }
  return { html: html.replace(/\n/g, "<br>"), usadas };
}

function blocoTexto(tag: string, html: string, usadas: ImagemRegistro[], formatoHtml = true): string {
  const arquivosXml = usadas
    .map(
      (imagem) =>
        `<file name="${escapeAttr(imagem.nome)}" path="/" encoding="base64">${imagem.dadosBase64}</file>`,
    )
    .join("");
  const atributoFormato = formatoHtml ? ' format="html"' : "";
  return `<${tag}${atributoFormato}><text>${formatoHtml ? cdata(html) : escapeAttr(html)}</text>${arquivosXml}</${tag}>`;
}

interface QuestaoParaExportar {
  id: string;
  titulo: string;
  tipo: "Objetiva" | "Discursiva";
  unidadeNome: string | null;
  dificuldade: string | null;
  enunciado: string;
  justificativa: string | null;
  disciplinaNome: string;
  alternativas: { texto: string; correta: boolean }[];
  imagens: ImagemRegistro[];
}

function montarTagsXml(questao: QuestaoParaExportar): string {
  const valores = [questao.disciplinaNome, questao.tipo, questao.unidadeNome, questao.dificuldade].filter(
    (valor): valor is string => Boolean(valor),
  );
  const tagsXml = valores.map((valor) => `<tag><text>${escapeAttr(valor)}</text></tag>`).join("");
  return `<tags>${tagsXml}</tags>`;
}

function montarQuestaoXml(questao: QuestaoParaExportar): string {
  const tipoMoodle = questao.tipo === "Discursiva" ? "essay" : "multichoice";

  const enunciado = textoComImagensHtml(questao.enunciado, questao.imagens);
  const justificativa = textoComImagensHtml(questao.justificativa, questao.imagens);

  const partes: string[] = [];
  partes.push(`<question type="${tipoMoodle}">`);
  partes.push(`<name><text>${escapeAttr(questao.titulo)}</text></name>`);
  partes.push(blocoTexto("questiontext", enunciado.html, enunciado.usadas));
  partes.push(blocoTexto("generalfeedback", justificativa.html, justificativa.usadas));
  partes.push("<defaultgrade>1.0000000</defaultgrade>");
  partes.push("<penalty>0.3333333</penalty>");
  partes.push("<hidden>0</hidden>");
  partes.push(montarTagsXml(questao));

  if (questao.tipo === "Discursiva") {
    partes.push("<responseformat>editor</responseformat>");
    partes.push("<responserequired>1</responserequired>");
    partes.push("<responsefieldlines>15</responsefieldlines>");
    partes.push("<attachments>0</attachments>");
    partes.push("<attachmentsrequired>0</attachmentsrequired>");
    partes.push("</question>");
    return partes.join("");
  }

  partes.push("<single>true</single>");
  partes.push("<shuffleanswers>true</shuffleanswers>");
  partes.push("<answernumbering>abc</answernumbering>");

  const corretas = questao.alternativas.filter((a) => a.correta);
  const incorretas = questao.alternativas.filter((a) => !a.correta);

  for (const correta of corretas) {
    const conteudo = textoComImagensHtml(correta.texto, questao.imagens);
    partes.push(
      `<answer fraction="100" format="html"><text>${cdata(conteudo.html)}</text>${conteudo.usadas
        .map((i) => `<file name="${escapeAttr(i.nome)}" path="/" encoding="base64">${i.dadosBase64}</file>`)
        .join("")}</answer>`,
    );
  }
  for (const incorreta of incorretas) {
    const conteudo = textoComImagensHtml(incorreta.texto, questao.imagens);
    partes.push(
      `<answer fraction="0" format="html"><text>${cdata(conteudo.html)}</text>${conteudo.usadas
        .map((i) => `<file name="${escapeAttr(i.nome)}" path="/" encoding="base64">${i.dadosBase64}</file>`)
        .join("")}</answer>`,
    );
  }

  partes.push("</question>");
  return partes.join("");
}

export async function gerarXmlDisciplina(disciplinaId: string): Promise<{ xml: string; nomeDisciplina: string } | null> {
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

  const questoesParaExportar: QuestaoParaExportar[] = linhas.map((linha) => ({
    ...linha,
    disciplinaNome: disciplina.nome,
    alternativas: (alternativasPorQuestao.get(linha.id) ?? [])
      .sort((a, b) => a.ordem - b.ordem)
      .map((a) => ({ texto: a.texto, correta: a.correta })),
    imagens: imagensPorQuestao.get(linha.id) ?? [],
  }));

  const categoria = `<question type="category"><category><text>$course$/top/${escapeAttr(disciplina.nome)}</text></category></question>`;
  const corpoQuestoes = questoesParaExportar.map(montarQuestaoXml).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>${categoria}${corpoQuestoes}</quiz>`;

  return { xml, nomeDisciplina: disciplina.nome };
}
