import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import type { FormulaQuestao, ImagemQuestao } from "@questum/shared";
import { cn } from "@/lib/utils";

// Bate com o formato gerado pelo pipeline: __MOODLE_IMAGE_<HEX>__ e
// __MOODLE_FORMULA_<HEX>__ (digest hexadecimal em maiúsculas).
const MARCADOR_RE = /__MOODLE_(?:IMAGE|FORMULA)_[A-F0-9]+__/g;

export type Segmento =
  | { tipo: "texto"; conteudo: string }
  | { tipo: "imagem"; marcador: string; indice: number; imagem: ImagemQuestao | null }
  | { tipo: "formula"; marcador: string; indice: number; formula: FormulaQuestao | null };

/**
 * Quebra o texto de um campo (enunciado, alternativa, justificativa) nos
 * marcadores de imagem/fórmula, resolvendo cada marcador para o anexo
 * correspondente e numerando-os na ordem em que aparecem — é esse número
 * ("Imagem 1", "Fórmula 2") que dá pro professor identificar o anexo sem
 * depender do hash.
 */
export function segmentarConteudo(
  texto: string | null | undefined,
  imagens: ImagemQuestao[],
  formulas: FormulaQuestao[],
): Segmento[] {
  if (!texto) return [];

  const segmentos: Segmento[] = [];
  let ultimoIndice = 0;
  let numImagem = 0;
  let numFormula = 0;

  for (const match of texto.matchAll(MARCADOR_RE)) {
    const marcador = match[0];
    const inicio = match.index ?? 0;

    if (inicio > ultimoIndice) {
      segmentos.push({ tipo: "texto", conteudo: texto.slice(ultimoIndice, inicio) });
    }

    if (marcador.startsWith("__MOODLE_IMAGE_")) {
      numImagem += 1;
      segmentos.push({
        tipo: "imagem",
        marcador,
        indice: numImagem,
        imagem: imagens.find((i) => i.marcador === marcador) ?? null,
      });
    } else {
      numFormula += 1;
      segmentos.push({
        tipo: "formula",
        marcador,
        indice: numFormula,
        formula: formulas.find((f) => f.marcador === marcador) ?? null,
      });
    }

    ultimoIndice = inicio + marcador.length;
  }

  if (ultimoIndice < texto.length) {
    segmentos.push({ tipo: "texto", conteudo: texto.slice(ultimoIndice) });
  }

  return segmentos;
}

function renderKatex(latex: string, displayMode: boolean): string {
  return katex.renderToString(latex, { throwOnError: false, displayMode });
}

function FormulaInline({ latex }: { latex: string }) {
  const html = useMemo(() => renderKatex(latex, false), [latex]);
  return (
    <span
      className="rounded bg-accent/10 px-1 py-0.5"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

interface RenderedContentProps {
  texto: string | null | undefined;
  imagens: ImagemQuestao[];
  formulas: FormulaQuestao[];
  className?: string;
}

/**
 * Preview somente leitura de um campo, com os marcadores substituídos
 * pela imagem de verdade e pela fórmula renderizada (KaTeX). É o que o
 * professor olha pra saber o que a questão realmente contém — o textarea
 * abaixo continua sendo a fonte editável (com os marcadores crus).
 */
export function RenderedContent({ texto, imagens, formulas, className }: RenderedContentProps) {
  const segmentos = useMemo(
    () => segmentarConteudo(texto, imagens, formulas),
    [texto, imagens, formulas],
  );

  const formulasUsadas = segmentos.filter(
    (s): s is Extract<Segmento, { tipo: "formula" }> => s.tipo === "formula",
  );

  if (segmentos.length === 0) {
    return <p className={cn("text-sm text-muted-foreground", className)}>Sem conteúdo.</p>;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">
        {segmentos.map((segmento, i) => {
          if (segmento.tipo === "texto") {
            return <span key={i}>{segmento.conteudo}</span>;
          }

          if (segmento.tipo === "imagem") {
            return (
              <span key={i} className="my-2 block">
                <span className="mb-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  Imagem {segmento.indice}
                  {segmento.imagem && (
                    <span className="font-normal text-muted-foreground/80">
                      · {segmento.imagem.nome}
                    </span>
                  )}
                </span>
                {segmento.imagem ? (
                  <img
                    src={`data:${segmento.imagem.contentType};base64,${segmento.imagem.dadosBase64}`}
                    alt={segmento.imagem.nome}
                    className="max-h-56 rounded border border-border object-contain"
                  />
                ) : (
                  <span className="text-xs text-destructive">
                    Imagem {segmento.indice} não encontrada (marcador órfão).
                  </span>
                )}
              </span>
            );
          }

          return segmento.formula ? (
            <FormulaInline key={i} latex={segmento.formula.latex} />
          ) : (
            <span key={i} className="text-xs text-destructive">
              [Fórmula {segmento.indice} não encontrada]
            </span>
          );
        })}
      </div>

      {formulasUsadas.length > 0 && (
        <dl className="space-y-1.5 border-t border-border pt-2">
          {formulasUsadas.map((segmento, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs">
              <dt className="font-medium text-muted-foreground">Fórmula {segmento.indice}</dt>
              <dd className="font-mono text-muted-foreground">
                {segmento.formula ? segmento.formula.latex : "(marcador órfão)"}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
