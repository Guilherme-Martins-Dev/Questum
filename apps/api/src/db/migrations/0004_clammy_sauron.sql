CREATE TABLE IF NOT EXISTS "formulas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"questao_id" uuid NOT NULL,
	"marcador" text NOT NULL,
	"latex" text NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "formulas" ADD CONSTRAINT "formulas_questao_id_questoes_id_fk" FOREIGN KEY ("questao_id") REFERENCES "public"."questoes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
