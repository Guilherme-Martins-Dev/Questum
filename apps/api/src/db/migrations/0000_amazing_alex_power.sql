CREATE TYPE "public"."dificuldade" AS ENUM('Facil', 'Media', 'Dificil');--> statement-breakpoint
CREATE TYPE "public"."status_arquivo" AS ENUM('pendente', 'extraindo', 'concluido', 'erro');--> statement-breakpoint
CREATE TYPE "public"."tipo_questao" AS ENUM('Objetiva', 'Discursiva');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alternativas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"questao_id" uuid NOT NULL,
	"texto" text NOT NULL,
	"correta" boolean DEFAULT false NOT NULL,
	"ordem" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "arquivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"disciplina_id" uuid NOT NULL,
	"nome_arquivo" text NOT NULL,
	"status" "status_arquivo" DEFAULT 'pendente' NOT NULL,
	"mensagem_erro" text,
	"importado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "disciplinas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "disciplinas_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "imagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"questao_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"marcador" text NOT NULL,
	"content_type" text NOT NULL,
	"dados_base64" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "questoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"arquivo_id" uuid NOT NULL,
	"unidade_id" uuid,
	"titulo" text NOT NULL,
	"tipo" "tipo_questao" NOT NULL,
	"dificuldade" "dificuldade",
	"enunciado" text NOT NULL,
	"justificativa" text,
	"tem_codigo_ou_calculo" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp DEFAULT now() NOT NULL,
	"atualizado_em" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "unidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"disciplina_id" uuid NOT NULL,
	"nome" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "alternativas" ADD CONSTRAINT "alternativas_questao_id_questoes_id_fk" FOREIGN KEY ("questao_id") REFERENCES "public"."questoes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "arquivos" ADD CONSTRAINT "arquivos_disciplina_id_disciplinas_id_fk" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "imagens" ADD CONSTRAINT "imagens_questao_id_questoes_id_fk" FOREIGN KEY ("questao_id") REFERENCES "public"."questoes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questoes" ADD CONSTRAINT "questoes_arquivo_id_arquivos_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."arquivos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "questoes" ADD CONSTRAINT "questoes_unidade_id_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."unidades"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "unidades" ADD CONSTRAINT "unidades_disciplina_id_disciplinas_id_fk" FOREIGN KEY ("disciplina_id") REFERENCES "public"."disciplinas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
