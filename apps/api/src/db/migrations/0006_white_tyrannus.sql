ALTER TABLE "extracoes" ADD COLUMN "aviso" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alternativas_questao_idx" ON "alternativas" USING btree ("questao_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "arquivos_disciplina_nome_idx" ON "arquivos" USING btree ("disciplina_id","nome_arquivo");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "extracoes_status_idx" ON "extracoes" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questoes_arquivo_idx" ON "questoes" USING btree ("arquivo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "questoes_unidade_idx" ON "questoes" USING btree ("unidade_id");--> statement-breakpoint

-- Limpeza de duplicatas antes das UNIQUE (dados legados dos bugs corrigidos nesta leva).
-- imagens/formulas: mantém a linha de menor ctid por (questao_id, marcador).
DELETE FROM "imagens" a USING "imagens" b
  WHERE a.ctid > b.ctid AND a."questao_id" = b."questao_id" AND a."marcador" = b."marcador";--> statement-breakpoint
DELETE FROM "formulas" a USING "formulas" b
  WHERE a.ctid > b.ctid AND a."questao_id" = b."questao_id" AND a."marcador" = b."marcador";--> statement-breakpoint

-- unidades: repõe as questões para a unidade sobrevivente e remove as demais.
-- (Postgres não tem MIN(uuid); usa first_value ORDER BY ctid pra eleger a mantida.)
UPDATE "questoes" q SET "unidade_id" = d.manter
  FROM (SELECT id, first_value(id) OVER (PARTITION BY disciplina_id, nome ORDER BY ctid) AS manter FROM "unidades") d
  WHERE q."unidade_id" = d.id AND d.id <> d.manter;--> statement-breakpoint
DELETE FROM "unidades" u
  USING (SELECT id, first_value(id) OVER (PARTITION BY disciplina_id, nome ORDER BY ctid) AS manter FROM "unidades") d
  WHERE u.id = d.id AND d.id <> d.manter;--> statement-breakpoint

ALTER TABLE "formulas" ADD CONSTRAINT "formulas_questao_marcador_unq" UNIQUE("questao_id","marcador");--> statement-breakpoint
ALTER TABLE "imagens" ADD CONSTRAINT "imagens_questao_marcador_unq" UNIQUE("questao_id","marcador");--> statement-breakpoint
ALTER TABLE "unidades" ADD CONSTRAINT "unidades_disciplina_nome_unq" UNIQUE("disciplina_id","nome");
