import { describe, expect, it } from "vitest";
import {
  cdata,
  escapeAttr,
  montarQuestaoXml,
  montarXmlQuiz,
  validarQuestoes,
  type QuestaoParaExportar,
} from "./xml-export.build";

function questaoBase(over: Partial<QuestaoParaExportar> = {}): QuestaoParaExportar {
  return {
    id: "q1",
    titulo: "Questão 1",
    tipo: "Objetiva",
    unidadeNome: "Unidade 1",
    dificuldade: "Média",
    enunciado: "Qual a capital do Brasil?",
    justificativa: "Brasília é a capital desde 1960.",
    disciplinaNome: "Geografia",
    alternativas: [
      { texto: "Brasília", correta: true },
      { texto: "Rio de Janeiro", correta: false },
    ],
    imagens: [],
    formulas: [],
    ...over,
  };
}

describe("escapeAttr / cdata", () => {
  it("escapa os metacaracteres de atributo XML", () => {
    expect(escapeAttr('a & b < c > d "e"')).toBe("a &amp; b &lt; c &gt; d &quot;e&quot;");
  });

  it("quebra sequência ]]> dentro do CDATA", () => {
    expect(cdata("x ]]> y")).toBe("<![CDATA[x ]]]]><![CDATA[> y]]>");
  });

  it("trata null/undefined como string vazia", () => {
    expect(escapeAttr(undefined as unknown as string)).toBe("");
    expect(cdata(null as unknown as string)).toBe("<![CDATA[]]>");
  });
});

describe("montarQuestaoXml", () => {
  it("gera multichoice com uma correta (fraction 100) e uma incorreta (fraction 0)", () => {
    const xml = montarQuestaoXml(questaoBase());
    expect(xml).toContain('<question type="multichoice">');
    expect(xml).toContain('<answer fraction="100" format="html"><text><![CDATA[Brasília]]></text></answer>');
    expect(xml).toContain('<answer fraction="0" format="html"><text><![CDATA[Rio de Janeiro]]></text></answer>');
    expect(xml).toContain("<single>true</single>");
  });

  it("gera essay para Discursiva, sem <answer>", () => {
    const xml = montarQuestaoXml(questaoBase({ tipo: "Discursiva", alternativas: [] }));
    expect(xml).toContain('<question type="essay">');
    expect(xml).toContain("<responseformat>editor</responseformat>");
    expect(xml).not.toContain("<answer ");
  });

  it("substitui o marcador de imagem por <img @@PLUGINFILE@@> e anexa o <file> base64", () => {
    const xml = montarQuestaoXml(
      questaoBase({
        enunciado: "Veja __MOODLE_IMAGE_AB12__ abaixo",
        imagens: [
          { nome: "grafico.png", marcador: "__MOODLE_IMAGE_AB12__", contentType: "image/png", dadosBase64: "QUJD" },
        ],
      }),
    );
    expect(xml).toContain("@@PLUGINFILE@@/grafico.png");
    expect(xml).toContain('<file name="grafico.png" path="/" encoding="base64">QUJD</file>');
    expect(xml).not.toContain("__MOODLE_IMAGE_AB12__");
  });

  it("substitui o marcador de fórmula pelo LaTeX entre \\( \\) e não gera <file>", () => {
    const xml = montarQuestaoXml(
      questaoBase({
        enunciado: "Calcule __MOODLE_FORMULA_FF01__",
        formulas: [{ marcador: "__MOODLE_FORMULA_FF01__", latex: "x^2 + 1" }],
      }),
    );
    expect(xml).toContain("\\(x^2 + 1\\)");
    expect(xml).not.toContain("__MOODLE_FORMULA_FF01__");
    expect(xml).not.toContain("encoding=\"base64\"");
  });

  it("escapa o título no <name>", () => {
    const xml = montarQuestaoXml(questaoBase({ titulo: "A & B <teste>" }));
    expect(xml).toContain("<name><text>A &amp; B &lt;teste&gt;</text></name>");
  });
});

describe("montarXmlQuiz", () => {
  it("abre com o preâmbulo, a categoria e uma <question> por item", () => {
    const xml = montarXmlQuiz("Geografia", [questaoBase(), questaoBase({ id: "q2", titulo: "Questão 2" })]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<quiz>')).toBe(true);
    expect(xml).toContain("$course$/top/Geografia");
    expect(xml.match(/<question type="multichoice">/g)).toHaveLength(2);
    expect(xml.endsWith("</quiz>")).toBe(true);
  });
});

describe("validarQuestoes", () => {
  it("não acusa nada numa questão válida", () => {
    expect(validarQuestoes([questaoBase()])).toEqual([]);
  });

  it("acusa objetiva sem alternativa correta", () => {
    const avisos = validarQuestoes([
      questaoBase({
        alternativas: [
          { texto: "a", correta: false },
          { texto: "b", correta: false },
        ],
      }),
    ]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/sem alternativa correta/);
  });

  it("acusa objetiva com mais de uma correta e com menos de 2 alternativas", () => {
    expect(
      validarQuestoes([
        questaoBase({
          alternativas: [
            { texto: "a", correta: true },
            { texto: "b", correta: true },
          ],
        }),
      ])[0],
    ).toMatch(/2 alternativas corretas/);

    expect(
      validarQuestoes([questaoBase({ alternativas: [{ texto: "só uma", correta: true }] })]).some((a) =>
        a.includes("menos de 2 alternativas"),
      ),
    ).toBe(true);
  });

  it("acusa enunciado vazio", () => {
    expect(validarQuestoes([questaoBase({ enunciado: "   " })])[0]).toMatch(/enunciado vazio/);
  });

  it("não valida alternativas de Discursiva", () => {
    expect(validarQuestoes([questaoBase({ tipo: "Discursiva", alternativas: [] })])).toEqual([]);
  });
});
