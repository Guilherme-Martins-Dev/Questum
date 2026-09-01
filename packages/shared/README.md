# @questum/shared

Tipos TypeScript e schemas Zod usados nos **dois** lados (web e api) — uma
fonte de verdade só pra validação e formato de dados.

```
src/
├── types/question.ts      # TipoQuestao, Dificuldade, Questao, Alternativa, QuestaoLista,
│                          #   QuestaoComRelacoes, ImagemQuestao, FormulaQuestao, Disciplina
├── types/extraction.ts    # ExtracaoJob (status do polling), ExtracaoIniciada
├── schemas/question.schema.ts  # iniciarExtracaoSchema, editarQuestaoSchema, editarAlternativaSchema
└── index.ts               # re-exporta tudo
```

Sem build próprio — o TypeScript resolve o pacote direto do fonte (`workspace:*`).
O `editarQuestaoSchema` é o mesmo objeto usado pelo `react-hook-form` no front e
pela validação da rota `PATCH /questoes/:id` no back.
