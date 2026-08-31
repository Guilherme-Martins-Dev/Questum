CREATE TYPE "public"."status_extracao" AS ENUM('pendente', 'processando', 'concluido', 'erro');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "extracoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "status_extracao" DEFAULT 'pendente' NOT NULL,
	"disciplina_nome" text NOT NULL,
	"total_arquivos" integer NOT NULL,
	"disciplina_id" uuid,
	"questoes_extraidas" integer,
	"imagens_extraidas" integer,
	"formulas_extraidas" integer,
	"mensagem_erro" text,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "extracoes" ADD CONSTRAINT "extracoes_disciplina_id_disciplinas_id_fk" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
