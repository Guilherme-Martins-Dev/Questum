import { describe, expect, it } from "vitest";
import { filtrarQuestoes, normalizar, temFiltroAtivo, FILTROS_VAZIOS } from "./filtrar-questoes";
import type { LinhaQuestao } from "../types";

function q(over: Partial<LinhaQuestao> = {}): LinhaQuestao {
  return {
    id: "1",
    arquivoId: "a1",
    disciplinaId: "d1",
    unidadeId: "u1",
    titulo: "Questão 1",
    tipo: "Objetiva",
    dificuldade: "Média",
    enunciado: "Enunciado padrão",
    justificativa: "",
    temCodigoOuCalculo: false,
    criadoEm: "2026-01-01T00:00:00Z",
    unidadeNome: "Unidade 1",
    disciplinaNome: "Disc",
    alternativas: [],
    imagens: [],
    formulas: [],
    ...over,
  } as LinhaQuestao;
}

const base = [
  q({ id: "1", titulo: "Derivada de função", tipo: "Objetiva", dificuldade: "Fácil", unidadeNome: "Unidade 1" }),
  q({ id: "2", titulo: "Integral definida", tipo: "Discursiva", dificuldade: "Difícil", unidadeNome: "Unidade 2" }),
  q({ id: "3", titulo: "Limites", tipo: "Objetiva", dificuldade: "", unidadeNome: null, enunciado: "cálculo de limite" }),
];

describe("normalizar", () => {
  it("tira acento e caixa", () => {
    expect(normalizar("Função ÁÉÍÓÚ Ç")).toBe("funcao aeiou c");
  });
});

describe("temFiltroAtivo", () => {
  it("false pra filtros vazios", () => {
    expect(temFiltroAtivo(FILTROS_VAZIOS)).toBe(false);
  });
  it("true se qualquer campo tem valor", () => {
    expect(temFiltroAtivo({ ...FILTROS_VAZIOS, unidade: "Unidade 1" })).toBe(true);
  });
});

describe("filtrarQuestoes", () => {
  it("sem filtros devolve tudo", () => {
    expect(filtrarQuestoes(base, FILTROS_VAZIOS)).toHaveLength(3);
  });

  it("filtra por tipo", () => {
    const r = filtrarQuestoes(base, { ...FILTROS_VAZIOS, tipo: "Objetiva" });
    expect(r.map((x) => x.id)).toEqual(["1", "3"]);
  });

  it("filtra por dificuldade, tratando vazio como categoria própria", () => {
    expect(filtrarQuestoes(base, { ...FILTROS_VAZIOS, dificuldade: "Difícil" }).map((x) => x.id)).toEqual(["2"]);
  });

  it("filtra por unidade exata (não pega null)", () => {
    expect(filtrarQuestoes(base, { ...FILTROS_VAZIOS, unidade: "Unidade 2" }).map((x) => x.id)).toEqual(["2"]);
  });

  it("busca é tolerante a acento e caixa, e cobre título + enunciado", () => {
    expect(filtrarQuestoes(base, { ...FILTROS_VAZIOS, busca: "FUNCAO" }).map((x) => x.id)).toEqual(["1"]);
    expect(filtrarQuestoes(base, { ...FILTROS_VAZIOS, busca: "calculo" }).map((x) => x.id)).toEqual(["3"]);
  });

  it("combina filtros (AND)", () => {
    const r = filtrarQuestoes(base, { ...FILTROS_VAZIOS, tipo: "Objetiva", busca: "limite" });
    expect(r.map((x) => x.id)).toEqual(["3"]);
  });

  it("não muta a lista de entrada", () => {
    const copia = [...base];
    filtrarQuestoes(base, { ...FILTROS_VAZIOS, tipo: "Objetiva" });
    expect(base).toEqual(copia);
  });
});
