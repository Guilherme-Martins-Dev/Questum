ALTER TABLE "public"."questoes" ALTER COLUMN "dificuldade" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."dificuldade";--> statement-breakpoint
CREATE TYPE "public"."dificuldade" AS ENUM('Facil', 'Media', 'Dificil');--> statement-breakpoint
ALTER TABLE "public"."questoes" ALTER COLUMN "dificuldade" SET DATA TYPE "public"."dificuldade" USING "dificuldade"::"public"."dificuldade";