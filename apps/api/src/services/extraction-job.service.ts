import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  extracoes,
  disciplinas,
  arquivos,
  unidades,
  questoes,
  alternativas,
  imagens,
  formulas,
} from "../db/schema";
import { executarExtracao } from "./extraction.service";

interface LoggerLike {
  info: (msg: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/** Postgres tem teto de ~65k parâmetros por statement — insere em lotes. */
const TAMANHO_LOTE = 500;

async function inserirEmLotes<T>(
  linhas: T[],
  inserir: (lote: T[]) => Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    await inserir(linhas.slice(i, i + TAMANHO_LOTE));
  }
}

/** Cria o job em estado "pendente" e devolve o id pra resposta imediata. */
export async function criarJobExtracao(disciplinaNome: string, totalArquivos: number): Promise<string> {
  const [registro] = await db
    .insert(extracoes)
    .values({ disciplinaNome, totalArquivos, status: "pendente" })
    .returning({ id: extracoes.id });
  return registro.id;
}

async function marcarErro(extracaoId: string, mensagem: string) {
  await db
    .update(extracoes)
    .set({ status: "erro", mensagemErro: mensagem })
    .where(eq(extracoes.id, extracaoId));
}

/**
 * Processa o job em background: roda o pipeline, persiste tudo e atualiza
 * o status da linha em `extracoes`. NÃO lança — todo erro vira status
 * "erro" com mensagem, que o frontend lê pelo polling. Limpa a pasta
 * temporária no fim (sucesso ou falha).
 *
 * Toda a persistência acontece dentro de UMA transação: se algo falhar no
 * meio, nada é gravado (nada de disciplina meio-importada).
 */
export async function processarExtracao(
  extracaoId: string,
  disciplina: string,
  caminhosArquivos: string[],
  pastaTemp: string,
  log: LoggerLike,
): Promise<void> {
  try {
    await db
      .update(extracoes)
      .set({ status: "processando", arquivosProcessados: 0 })
      .where(eq(extracoes.id, extracaoId));

    // Progresso arquivo a arquivo. Fire-and-forget: o polling do frontend
    // lê `arquivosProcessados` do banco.
    const resultado = await executarExtracao(disciplina, caminhosArquivos, (lidos) => {
      db.update(extracoes)
        .set({ arquivosProcessados: lidos })
        .where(eq(extracoes.id, extracaoId))
        .catch((e) => log.error(e, "Falha ao atualizar progresso da extração"));
    });
    const nomesEnviados = caminhosArquivos.map((p) => path.basename(p));

    const { disciplinaId, questoesInseridas, ignorados } = await db.transaction(async (tx) => {
      const [disciplinaRegistro] = await tx
        .insert(disciplinas)
        .values({ nome: disciplina })
        .onConflictDoUpdate({ target: disciplinas.nome, set: { nome: disciplina } })
        .returning();

      // Dedupe por nome de arquivo: pula .docx que já foram importados nessa
      // disciplina antes (reenvio acidental do mesmo arquivo).
      const jaImportados = await tx
        .select({ nomeArquivo: arquivos.nomeArquivo })
        .from(arquivos)
        .where(
          and(
            eq(arquivos.disciplinaId, disciplinaRegistro.id),
            inArray(arquivos.nomeArquivo, nomesEnviados),
          ),
        );
      const nomesJaImportados = new Set(jaImportados.map((a) => a.nomeArquivo));
      const nomesNovos = nomesEnviados.filter((nome) => !nomesJaImportados.has(nome));

      // 1) Um registro de arquivo por .docx NOVO, e um mapa nome -> id.
      const arquivoIdPorNome = new Map<string, string>();
      if (nomesNovos.length > 0) {
        const arquivosInseridos = await tx
          .insert(arquivos)
          .values(
            nomesNovos.map((nomeArquivo) => ({
              disciplinaId: disciplinaRegistro.id,
              nomeArquivo,
              status: "concluido" as const,
            })),
          )
          .returning({ id: arquivos.id, nomeArquivo: arquivos.nomeArquivo });
        for (const a of arquivosInseridos) arquivoIdPorNome.set(a.nomeArquivo, a.id);
      }

      // 2) Unidades: find-or-create por (disciplinaId, nome), agora com
      //    unique constraint — onConflictDoNothing + select cobre a corrida.
      const nomesUnidade = [
        ...new Set(
          resultado.questoes
            .map((q) => q.unidade)
            .filter((nome): nome is string => Boolean(nome)),
        ),
      ];
      const unidadeIdPorNome = new Map<string, string>();
      if (nomesUnidade.length > 0) {
        await tx
          .insert(unidades)
          .values(nomesUnidade.map((nome) => ({ disciplinaId: disciplinaRegistro.id, nome })))
          .onConflictDoNothing();
        const unidadesDaDisciplina = await tx
          .select({ id: unidades.id, nome: unidades.nome })
          .from(unidades)
          .where(eq(unidades.disciplinaId, disciplinaRegistro.id));
        for (const u of unidadesDaDisciplina) unidadeIdPorNome.set(u.nome, u.id);
      }

      // 3) Questões — só as de arquivos novos. Insere em lote, preservando a
      //    ordem pra reassociar cada linha inserida à questão de origem.
      const questoesParaInserir = resultado.questoes
        .map((q) => ({ q, arquivoId: arquivoIdPorNome.get(q.arquivo_origem) }))
        .filter((item): item is { q: (typeof resultado.questoes)[number]; arquivoId: string } => {
          if (!item.arquivoId) {
            log.info(
              `Questão "${item.q.titulo}" ignorada: arquivo_origem "${item.q.arquivo_origem}" não está entre os arquivos novos.`,
            );
            return false;
          }
          return true;
        });

      const questoesInseridas: { id: string; q: (typeof resultado.questoes)[number] }[] = [];
      await inserirEmLotes(questoesParaInserir, async (lote) => {
        const linhas = await tx
          .insert(questoes)
          .values(
            lote.map(({ q, arquivoId }) => ({
              arquivoId,
              unidadeId: q.unidade ? (unidadeIdPorNome.get(q.unidade) ?? null) : null,
              titulo: q.titulo,
              tipo: q.tipo,
              dificuldade: q.dificuldade || null,
              enunciado: q.enunciado,
              justificativa: q.justificativa,
              temCodigoOuCalculo: q.tem_codigo_ou_calculo,
            })),
          )
          .returning({ id: questoes.id });
        linhas.forEach((linha, i) => questoesInseridas.push({ id: linha.id, q: lote[i].q }));
      });

      // 4) Alternativas, imagens e fórmulas — montadas pra todas as questões
      //    e inseridas em lote por tabela.
      const alternativasParaInserir: (typeof alternativas.$inferInsert)[] = [];
      const imagensParaInserir: (typeof imagens.$inferInsert)[] = [];
      const formulasParaInserir: (typeof formulas.$inferInsert)[] = [];

      const todasImagens = Object.values(resultado.imagens);
      const todasFormulas = Object.values(resultado.formulas);

      for (const { id: questaoId, q } of questoesInseridas) {
        if (q.tipo === "Objetiva") {
          alternativasParaInserir.push(
            { questaoId, texto: q.correta, correta: true, ordem: 0 },
            ...q.incorretas.map((texto, i) => ({
              questaoId,
              texto,
              correta: false,
              ordem: i + 1,
            })),
          );
        }

        const textoCompleto = [q.enunciado, q.correta, ...q.incorretas, q.justificativa ?? ""].join("\n");

        for (const imagem of todasImagens) {
          if (textoCompleto.includes(imagem.marcador)) {
            imagensParaInserir.push({
              questaoId,
              nome: imagem.nome,
              marcador: imagem.marcador,
              contentType: imagem.content_type,
              dadosBase64: imagem.base64,
            });
          }
        }
        for (const formula of todasFormulas) {
          if (textoCompleto.includes(formula.marcador)) {
            formulasParaInserir.push({ questaoId, marcador: formula.marcador, latex: formula.latex });
          }
        }
      }

      await inserirEmLotes(alternativasParaInserir, (lote) => tx.insert(alternativas).values(lote));
      // onConflictDoNothing: marcador repetido na mesma questão não duplica.
      await inserirEmLotes(imagensParaInserir, (lote) =>
        tx.insert(imagens).values(lote).onConflictDoNothing(),
      );
      await inserirEmLotes(formulasParaInserir, (lote) =>
        tx.insert(formulas).values(lote).onConflictDoNothing(),
      );

      return {
        disciplinaId: disciplinaRegistro.id,
        questoesInseridas: questoesInseridas.length,
        ignorados: [...nomesJaImportados],
      };
    });

    const aviso =
      ignorados.length > 0
        ? `${ignorados.length} arquivo(s) já tinham sido importados nesta disciplina e foram ignorados: ${ignorados.join(", ")}.`
        : null;

    await db
      .update(extracoes)
      .set({
        status: "concluido",
        disciplinaId,
        arquivosProcessados: caminhosArquivos.length,
        questoesExtraidas: questoesInseridas,
        imagensExtraidas: Object.keys(resultado.imagens).length,
        formulasExtraidas: Object.keys(resultado.formulas).length,
        aviso,
      })
      .where(eq(extracoes.id, extracaoId));
  } catch (erro) {
    log.error(erro, `Extração ${extracaoId} falhou`);
    await marcarErro(extracaoId, (erro as Error).message).catch((e) =>
      log.error(e, "Falha ao marcar extração como erro"),
    );
  } finally {
    fs.rm(pastaTemp, { recursive: true, force: true }, () => {});
  }
}

/**
 * Na subida da API, qualquer job preso em "pendente"/"processando" é de
 * uma execução anterior que foi interrompida (crash, deploy) — não há
 * processo cuidando dele. Marca como erro pra não ficar em loading eterno
 * no frontend.
 */
export async function falharExtracoesInterrompidas(log: LoggerLike): Promise<void> {
  const interrompidas = await db
    .update(extracoes)
    .set({
      status: "erro",
      mensagemErro: "Extração interrompida (a API reiniciou durante o processamento).",
    })
    .where(inArray(extracoes.status, ["pendente", "processando"]))
    .returning({ id: extracoes.id });

  if (interrompidas.length > 0) {
    log.info(`${interrompidas.length} extração(ões) interrompida(s) marcada(s) como erro na subida.`);
  }
}
