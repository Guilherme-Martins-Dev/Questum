/**
 * Construção do XML do Moodle a partir de objetos já hidratados — SEM
 * acesso ao banco (o `xml-export.service.ts` faz as queries e chama aqui).
 * Separado assim pra poder testar a formatação em isolamento.
 */

export function cdata(texto: string): string {
  // "]]>" é o único jeito de "escapar" de dentro de um CDATA — se o texto
  // contiver essa sequência literal (raro, mas possível), precisa quebrar
  // em dois blocos CDATA consecutivos.
  const seguro = (texto ?? "").replace(/]]>/g, "]]]]><![CDATA[>");
  return `<![CDATA[${seguro}]]>`;
}

export function escapeAttr(texto: string): string {
  return (texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface ImagemRegistro {
  nome: string;
  marcador: string;
  contentType: string;
  dadosBase64: string;
}

export interface FormulaRegistro {
  marcador: string;
  latex: string;
}

function textoComImagensHtml(
  texto: string | null,
  imagensDisponiveis: ImagemRegistro[],
): { html: string; usadas: ImagemRegistro[] } {
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

export interface QuestaoParaExportar {
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

export function montarQuestaoXml(questao: QuestaoParaExportar): string {
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
export function validarQuestoes(questoesParaExportar: QuestaoParaExportar[]): string[] {
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

export function montarXmlQuiz(disciplinaNome: string, questoes: QuestaoParaExportar[]): string {
  const categoria = `<question type="category"><category><text>$course$/top/${escapeAttr(disciplinaNome)}</text></category></question>`;
  const corpoQuestoes = questoes.map(montarQuestaoXml).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<quiz>${categoria}${corpoQuestoes}</quiz>`;
}
