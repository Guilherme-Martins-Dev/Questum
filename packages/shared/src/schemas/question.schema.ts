import { z } from "zod";

/**
 * Schema Zod usado nos DOIS lados: o formulário de extração no frontend
 * valida com isso, e a rota da API valida o corpo da requisição com o
 * MESMO schema — evita duas fontes de verdade pra validação.
 */
export const iniciarExtracaoSchema = z.object({
  disciplina: z
    .string()
    .trim()
    .min(2, "Informe o nome da disciplina (mínimo 2 caracteres)."),
  arquivoIds: z
    .array(z.string())
    .min(1, "Envie pelo menos um arquivo .docx."),
});

export type IniciarExtracaoInput = z.infer<typeof iniciarExtracaoSchema>;

export const editarAlternativaSchema = z.object({
  id: z.string(),
  texto: z.string().trim().min(1, "A alternativa não pode ficar vazia."),
  correta: z.boolean(),
});

export const editarQuestaoSchema = z.object({
  titulo: z.string().trim().min(1, "O título não pode ficar vazio."),
  dificuldade: z.enum(["Fácil", "Média", "Difícil", ""]).optional(),
  unidade: z.string().trim().optional(),
  enunciado: z.string().trim().min(1, "O enunciado não pode ficar vazio."),
  justificativa: z.string().optional(),
  // Ausente/undefined para questões Discursivas (não têm alternativas).
  // Quando presente, exatamente uma alternativa deve estar marcada como
  // correta — a mesma regra que a extração via IA já segue.
  alternativas: z
    .array(editarAlternativaSchema)
    .min(2, "Uma questão objetiva precisa de pelo menos 2 alternativas.")
    .refine((lista) => lista.filter((a) => a.correta).length === 1, {
      message: "Marque exatamente uma alternativa como correta.",
    })
    .optional(),
});

export type EditarAlternativaInput = z.infer<typeof editarAlternativaSchema>;
export type EditarQuestaoInput = z.infer<typeof editarQuestaoSchema>;
