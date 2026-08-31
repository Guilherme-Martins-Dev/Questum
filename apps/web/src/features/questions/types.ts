// Lista (GET /questoes): imagens sem binário — só a contagem é usada na tabela.
export type { QuestaoLista as LinhaQuestao } from "@questum/shared";
// Detalhe (GET /questoes/:id): questão completa, com o base64 das imagens.
export type { QuestaoComRelacoes as QuestaoDetalhe } from "@questum/shared";
