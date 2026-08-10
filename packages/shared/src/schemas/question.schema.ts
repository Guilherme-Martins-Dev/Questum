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

export const editarQuestaoSchema = z.object({
  titulo: z.string().trim().min(1, "O título não pode ficar vazio."),
  enunciado: z.string().trim().min(1, "O enunciado não pode ficar vazio."),
  dificuldade: z.enum(["Fácil", "Média", "Difícil", ""]).optional(),
  justificativa: z.string().optional(),
});

export type EditarQuestaoInput = z.infer<typeof editarQuestaoSchema>;
