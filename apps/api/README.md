# @questum/api

Backend Fastify 5 + Drizzle ORM + PostgreSQL. Recebe os `.docx`, aciona o
pipeline Python em background, persiste o resultado e gera o XML do Moodle.

> Setup, variáveis de ambiente e como rodar: [README da raiz](../../README.md).

## Estrutura

```
src/
├── server.ts                  # bootstrap: helmet, CORS, multipart, shutdown limpo
├── db/
│   ├── client.ts              # pool postgres-js + drizzle
│   ├── schema.ts              # disciplinas, unidades, arquivos, questoes, alternativas, imagens, formulas, extracoes
│   └── migrations/            # geradas por drizzle-kit
├── routes/
│   ├── extractions.routes.ts  # POST /extractions, GET /extractions/:id
│   ├── questions.routes.ts    # GET /disciplinas, /questoes, /questoes/:id, PATCH /questoes/:id
│   └── export.routes.ts       # GET /disciplinas/:id/export
└── services/
    ├── extraction.service.ts      # spawn do pipeline Python (+ timeout, progresso [i/N], teto de saída)
    ├── extraction-job.service.ts  # job em background: transação, dedup por arquivo, status
    ├── xml-export.build.ts        # montagem do XML (puro, sem banco — testado)
    └── xml-export.service.ts      # queries + chama o build
```

## Rotas

| Método | Rota | O quê |
|---|---|---|
| `POST` | `/extractions` | multipart (`disciplina` + `arquivos[]`); responde `202` com `extracaoId`, processa em background |
| `GET` | `/extractions/:id` | status do job (polling): `status`, `arquivosProcessados`, contagens, `aviso` |
| `GET` | `/disciplinas` | lista de disciplinas |
| `GET` | `/questoes?disciplinaId=` | questões da disciplina (com alternativas, imagens sem binário) |
| `GET` | `/questoes/:id` | uma questão completa (imagens com base64) |
| `PATCH` | `/questoes/:id` | salva edição (título, dificuldade, unidade, enunciado, alternativas, justificativa) |
| `GET` | `/disciplinas/:id/export` | XML do Moodle (attachment); avisos não-fatais no header `X-Export-Avisos` |
| `GET` | `/health` | `{ status: "ok" }` |

## Scripts

```bash
pnpm --filter @questum/api dev          # tsx watch
pnpm --filter @questum/api test         # vitest (xml-export.build)
pnpm --filter @questum/api db:generate  # gera migration a partir do schema.ts
pnpm --filter @questum/api db:migrate   # aplica migrations
```
