import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  pgEnum,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const tipoQuestaoEnum = pgEnum("tipo_questao", ["Objetiva", "Discursiva"]);
export const dificuldadeEnum = pgEnum("dificuldade", ["Fácil", "Média", "Difícil"]);
export const statusArquivoEnum = pgEnum("status_arquivo", [
  "pendente",
  "extraindo",
  "concluido",
  "erro",
]);

export const statusExtracaoEnum = pgEnum("status_extracao", [
  "pendente",
  "processando",
  "concluido",
  "erro",
]);

export const disciplinas = pgTable("disciplinas", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: text("nome").notNull().unique(),
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
});

export const unidades = pgTable(
  "unidades",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    disciplinaId: uuid("disciplina_id")
      .references(() => disciplinas.id, { onDelete: "cascade" })
      .notNull(),
    nome: text("nome").notNull(), // ex: "Unidade 1"
  },
  (t) => [
    // Uma unidade tem nome único DENTRO da disciplina — permite find-or-create
    // por (disciplinaId, nome) sem risco de duplicata em corrida.
    unique("unidades_disciplina_nome_unq").on(t.disciplinaId, t.nome),
  ],
);

/**
 * Job de extração assíncrona. Uma linha por chamada de POST /extractions —
 * criada com status "pendente", processada em background, e consultada via
 * polling pelo frontend. Também é o registro que a página de Histórico vai
 * listar.
 */
export const extracoes = pgTable(
  "extracoes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    status: statusExtracaoEnum("status").default("pendente").notNull(),
    disciplinaNome: text("disciplina_nome").notNull(),
    totalArquivos: integer("total_arquivos").notNull(),
    disciplinaId: uuid("disciplina_id").references(() => disciplinas.id, { onDelete: "set null" }),
    questoesExtraidas: integer("questoes_extraidas"),
    imagensExtraidas: integer("imagens_extraidas"),
    formulasExtraidas: integer("formulas_extraidas"),
    mensagemErro: text("mensagem_erro"),
    /** Aviso não-fatal (ex: arquivos ignorados por já terem sido importados). */
    aviso: text("aviso"),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
    atualizadoEm: timestamp("atualizado_em")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index("extracoes_status_idx").on(t.status)],
);

export const arquivos = pgTable(
  "arquivos",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    disciplinaId: uuid("disciplina_id")
      .references(() => disciplinas.id, { onDelete: "cascade" })
      .notNull(),
    nomeArquivo: text("nome_arquivo").notNull(),
    status: statusArquivoEnum("status").default("pendente").notNull(),
    mensagemErro: text("mensagem_erro"),
    importadoEm: timestamp("importado_em").defaultNow().notNull(),
  },
  (t) => [index("arquivos_disciplina_nome_idx").on(t.disciplinaId, t.nomeArquivo)],
);

export const questoes = pgTable(
  "questoes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    arquivoId: uuid("arquivo_id")
      .references(() => arquivos.id, { onDelete: "cascade" })
      .notNull(),
    unidadeId: uuid("unidade_id").references(() => unidades.id, { onDelete: "set null" }),
    titulo: text("titulo").notNull(),
    tipo: tipoQuestaoEnum("tipo").notNull(),
    dificuldade: dificuldadeEnum("dificuldade"),
    enunciado: text("enunciado").notNull(),
    justificativa: text("justificativa"),
    temCodigoOuCalculo: boolean("tem_codigo_ou_calculo").default(false).notNull(),
    criadoEm: timestamp("criado_em").defaultNow().notNull(),
    atualizadoEm: timestamp("atualizado_em")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("questoes_arquivo_idx").on(t.arquivoId),
    index("questoes_unidade_idx").on(t.unidadeId),
  ],
);

export const alternativas = pgTable(
  "alternativas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questaoId: uuid("questao_id")
      .references(() => questoes.id, { onDelete: "cascade" })
      .notNull(),
    texto: text("texto").notNull(),
    correta: boolean("correta").default(false).notNull(),
    ordem: integer("ordem").notNull(),
  },
  (t) => [index("alternativas_questao_idx").on(t.questaoId)],
);

export const imagens = pgTable(
  "imagens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questaoId: uuid("questao_id")
      .references(() => questoes.id, { onDelete: "cascade" })
      .notNull(),
    nome: text("nome").notNull(),
    marcador: text("marcador").notNull(), // __MOODLE_IMAGE_<hash>__
    contentType: text("content_type").notNull(),
    dadosBase64: text("dados_base64").notNull(),
  },
  (t) => [unique("imagens_questao_marcador_unq").on(t.questaoId, t.marcador)],
);

export const formulas = pgTable(
  "formulas",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    questaoId: uuid("questao_id")
      .references(() => questoes.id, { onDelete: "cascade" })
      .notNull(),
    marcador: text("marcador").notNull(), // __MOODLE_FORMULA_<hash>__
    latex: text("latex").notNull(),
  },
  (t) => [unique("formulas_questao_marcador_unq").on(t.questaoId, t.marcador)],
);

// --- Relações (só pra consultas aninhadas do Drizzle, não afeta o schema SQL) ---

export const disciplinasRelations = relations(disciplinas, ({ many }) => ({
  unidades: many(unidades),
  arquivos: many(arquivos),
}));

export const arquivosRelations = relations(arquivos, ({ one, many }) => ({
  disciplina: one(disciplinas, {
    fields: [arquivos.disciplinaId],
    references: [disciplinas.id],
  }),
  questoes: many(questoes),
}));

export const questoesRelations = relations(questoes, ({ one, many }) => ({
  arquivo: one(arquivos, { fields: [questoes.arquivoId], references: [arquivos.id] }),
  unidade: one(unidades, { fields: [questoes.unidadeId], references: [unidades.id] }),
  alternativas: many(alternativas),
  imagens: many(imagens),
  formulas: many(formulas),
}));

export const alternativasRelations = relations(alternativas, ({ one }) => ({
  questao: one(questoes, { fields: [alternativas.questaoId], references: [questoes.id] }),
}));

export const imagensRelations = relations(imagens, ({ one }) => ({
  questao: one(questoes, { fields: [imagens.questaoId], references: [questoes.id] }),
}));

export const formulasRelations = relations(formulas, ({ one }) => ({
  questao: one(questoes, { fields: [formulas.questaoId], references: [questoes.id] }),
}));
