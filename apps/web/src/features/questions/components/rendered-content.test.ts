import { describe, expect, it } from "vitest";
import { segmentarConteudo, type Segmento } from "./rendered-content";
import type { FormulaQuestao, ImagemQuestao } from "@questum/shared";

const img = (marcador: string, nome = "img.png"): ImagemQuestao => ({
  id: marcador,
  questaoId: "q1",
  nome,
  marcador,
  contentType: "image/png",
  dadosBase64: "QUJD",
});

const formula = (marcador: string, latex = "x^2"): FormulaQuestao => ({
  id: marcador,
  questaoId: "q1",
  marcador,
  latex,
});

const tipos = (segs: Segmento[]) => segs.map((s) => s.tipo);

describe("segmentarConteudo", () => {
  it("texto sem marcador vira um único segmento de texto", () => {
    const segs = segmentarConteudo("só texto puro", [], []);
    expect(segs).toEqual([{ tipo: "texto", conteudo: "só texto puro" }]);
  });

  it("texto vazio / null / undefined devolve lista vazia", () => {
    expect(segmentarConteudo("", [], [])).toEqual([]);
    expect(segmentarConteudo(null, [], [])).toEqual([]);
    expect(segmentarConteudo(undefined, [], [])).toEqual([]);
  });

  it("intercala texto e marcadores na ordem em que aparecem", () => {
    const segs = segmentarConteudo(
      "antes __MOODLE_IMAGE_AA11__ meio __MOODLE_FORMULA_BB22__ depois",
      [img("__MOODLE_IMAGE_AA11__")],
      [formula("__MOODLE_FORMULA_BB22__")],
    );
    expect(tipos(segs)).toEqual(["texto", "imagem", "texto", "formula", "texto"]);
    expect((segs[0] as Extract<Segmento, { tipo: "texto" }>).conteudo).toBe("antes ");
  });

  it("numera imagens e fórmulas separadamente, na ordem de aparição", () => {
    const segs = segmentarConteudo(
      "__MOODLE_IMAGE_A1__ __MOODLE_IMAGE_A2__ __MOODLE_FORMULA_F1__",
      [img("__MOODLE_IMAGE_A1__"), img("__MOODLE_IMAGE_A2__")],
      [formula("__MOODLE_FORMULA_F1__")],
    );
    const imgs = segs.filter((s) => s.tipo === "imagem") as Extract<Segmento, { tipo: "imagem" }>[];
    const fs = segs.filter((s) => s.tipo === "formula") as Extract<Segmento, { tipo: "formula" }>[];
    expect(imgs.map((s) => s.indice)).toEqual([1, 2]);
    expect(fs.map((s) => s.indice)).toEqual([1]);
  });

  it("resolve o marcador para o anexo correspondente", () => {
    const segs = segmentarConteudo("x __MOODLE_IMAGE_ABCD__ y", [img("__MOODLE_IMAGE_ABCD__", "grafico.png")], []);
    const imagem = segs.find((s) => s.tipo === "imagem") as Extract<Segmento, { tipo: "imagem" }>;
    expect(imagem.imagem?.nome).toBe("grafico.png");
  });

  it("marcador órfão (sem anexo) resolve para null, sem quebrar a numeração", () => {
    const segs = segmentarConteudo("__MOODLE_FORMULA_DEAD__", [], []);
    const f = segs.find((s) => s.tipo === "formula") as Extract<Segmento, { tipo: "formula" }>;
    expect(f.formula).toBeNull();
    expect(f.indice).toBe(1);
  });

  it("marcador com hex inválido (fora de [A-F0-9]) é tratado como texto puro", () => {
    const segs = segmentarConteudo("__MOODLE_FORMULA_ZZ99__", [], []);
    expect(segs).toEqual([{ tipo: "texto", conteudo: "__MOODLE_FORMULA_ZZ99__" }]);
  });

  it("marcador no comecinho e no fim não gera segmentos de texto vazios", () => {
    const segs = segmentarConteudo("__MOODLE_IMAGE_A1__", [img("__MOODLE_IMAGE_A1__")], []);
    expect(tipos(segs)).toEqual(["imagem"]);
  });
});
