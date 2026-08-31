import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { questoes, unidades, arquivos, disciplinas, alternativas, imagens, formulas } from "../db/schema";

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

interface FormulaRegistro {
  marcador: string;
  latex: string;
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

// Troca __MOODLE_FORMULA_...__ pelo LaTeX entre \( \) — delimitador
// inline que o filtro MathJax do Moodle reconhece e renderiza como
// fórmula de verdade na tela. Diferente da imagem, não precisa de <file>
// (não é um arquivo binário, é só texto matemático).
function textoComFormulasHtml(html: string, formulasDisponiveis: FormulaRegistro[]): string {
  let resultado = html;
  for (const formula of formulasDisponiveis) {
    if (resultado.includes(formula.marcador)) {
      resultado = resultado.split(formula.marcador).join(`\\(${formula.latex}\\)`);
    }
  }
  return resultado;
}

// Combina as duas substituições (imagem gera <file>, fórmula não) — todo
// campo de texto da questão passa pelas duas, nessa ordem.
function processarTextoDaQuestao(
  texto: string | null,
  imagensDisponiveis: ImagemRegistro[],
  formulasDisponiveis: FormulaRegistro[],
): { html: string; imagensUsadas: ImagemRegistro[] } {
  const comImagens = textoComImagensHtml(texto, imagensDisponiveis);
  const html = textoComFormulasHtml(comImagens.html, formulasDisponiveis);
  return { html, imagensUsadas: comImagens.usadas };
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
  formulas: FormulaRegistro[];
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

  const enunciado = processarTextoDaQuestao(questao.enunciado, questao.imagens, questao.formulas);
  const justificativa = processarTextoDaQuestao(questao.justificativa, questao.imagens, questao.formulas);

  const partes: string[] = [];
  partes.push(`<question type="${tipoMoodle}">`);
  partes.push(`<name><text>${escapeAttr(questao.titulo)}</text></name>`);
  partes.push(blocoTexto("questiontext", enunciado.html, enunciado.imagensUsadas));
  partes.push(blocoTexto("generalfeedback", justificativa.html, justificativa.imagensUsadas));
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
    const conteudo = processarTextoDaQuestao(correta.texto, questao.imagens, questao.formulas);
    partes.push(
      `<answer fraction="100" format="html"><text>${cdata(conteudo.html)}</text>${conteudo.imagensUsadas
        .map((i) => `<file name="${escapeAttr(i.nome)}" path="/" encoding="base64">${i.dadosBase64}</file>`)
        .join("")}</answer>`,
    );
  }
  for (const incorreta of incorretas) {
    const conteudo = processarTextoDaQuestao(incorreta.texto, questao.imagens, questao.formulas);
    partes.push(
      `<answer fraction="0" format="html"><text>${cdata(conteudo.html)}</text>${conteudo.imagensUsadas
        .map((i) => `<file name="${escapeAttr(i.nome)}" path="/" encoding="base64">${i.dadosBase64}</file>`)
        .join("")}</answer>`,
    );
  }

  partes.push("</question>");
  return partes.join("");
}

/** Problemas que quebram (ou degradam) a importação no Moodle. Não bloqueia o export. */
function validarQuestoes(questoesParaExportar: QuestaoParaExportar[]): string[] {
  const avisos: string[] = [];
  for (const q of questoesParaExportar) {
    const rotulo = q.titulo?.trim() || "(sem título)";
    if (!q.enunciado?.trim()) {
      avisos.push(`"${rotulo}": enunciado vazio.`);
    }
    if (q.tipo === "Objetiva") {
      const corretas = q.alternativas.filter((a) => a.correta).length;
      if (q.alternativas.length < 2) {
        avisos.push(`"${rotulo}": objetiva com menos de 2 alternativas.`);
      }
      if (corretas === 0) {
        avisos.push(`"${rotulo}": objetiva sem alternativa correta — o Moodle rejeita na importação.`);
      } else if (corretas > 1) {
        avisos.push(`"${rotulo}": objetiva com ${corretas} alternativas corretas (esperado 1).`);
      }
    }
  }
  return avisos;
}

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

  const categoria = `<question type="category"><category><text>$course$/top/${escapeAttr(disciplina.nome)}</text></category></question>`;
  const corpoQuestoes = questoesParaExportar.map(montarQuestaoXml).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>${categoria}${corpoQuestoes}</quiz>`;

  return { xml, nomeDisciplina: disciplina.nome, avisos: validarQuestoes(questoesParaExportar) };
}
