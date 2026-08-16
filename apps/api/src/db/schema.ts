import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  pgEnum,
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

export const disciplinas = pgTable("disciplinas", {
  id: uuid("id").defaultRandom().primaryKey(),
  nome: text("nome").notNull().unique(),
  criadoEm: timestamp("criado_em").defaultNow().notNull(),
});

export const unidades = pgTable("unidades", {
  id: uuid("id").defaultRandom().primaryKey(),
  disciplinaId: uuid("disciplina_id")
    .references(() => disciplinas.id, { onDelete: "cascade" })
    .notNull(),
  nome: text("nome").notNull(), // ex: "Unidade 1"
});

export const arquivos = pgTable("arquivos", {
  id: uuid("id").defaultRandom().primaryKey(),
  disciplinaId: uuid("disciplina_id")
    .references(() => disciplinas.id, { onDelete: "cascade" })
    .notNull(),
  nomeArquivo: text("nome_arquivo").notNull(),
  status: statusArquivoEnum("status").default("pendente").notNull(),
  mensagemErro: text("mensagem_erro"),
  importadoEm: timestamp("importado_em").defaultNow().notNull(),
});

export const questoes = pgTable("questoes", {
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
  atualizadoEm: timestamp("atualizado_em").defaultNow().notNull(),
});

export const alternativas = pgTable("alternativas", {
  id: uuid("id").defaultRandom().primaryKey(),
  questaoId: uuid("questao_id")
    .references(() => questoes.id, { onDelete: "cascade" })
    .notNull(),
  texto: text("texto").notNull(),
  correta: boolean("correta").default(false).notNull(),
  ordem: integer("ordem").notNull(),
});

export const imagens = pgTable("imagens", {
  id: uuid("id").defaultRandom().primaryKey(),
  questaoId: uuid("questao_id")
    .references(() => questoes.id, { onDelete: "cascade" })
    .notNull(),
  nome: text("nome").notNull(),
  marcador: text("marcador").notNull(), // __MOODLE_IMAGE_<hash>__
  contentType: text("content_type").notNull(),
  dadosBase64: text("dados_base64").notNull(),
});

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
}));

export const alternativasRelations = relations(alternativas, ({ one }) => ({
  questao: one(questoes, { fields: [alternativas.questaoId], references: [questoes.id] }),
}));

export const imagensRelations = relations(imagens, ({ one }) => ({
  questao: one(questoes, { fields: [imagens.questaoId], references: [questoes.id] }),
}));
