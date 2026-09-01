# Questum

Ferramenta para professores: transforma provas em `.docx` num banco de questões
importável no **Moodle**. A IA (Gemini) lê o documento e identifica enunciado,
alternativas, resposta correta, justificativa, imagens e fórmulas; o professor
revisa/edita na interface e exporta o XML final.

```
.docx (1+ arquivos) ─▶ extração via IA ─▶ Postgres ─▶ revisão/edição ─▶ XML do Moodle
```

## Estrutura (monorepo pnpm)

| Pacote | Stack |
|---|---|
| `apps/web` | Vite + React + TypeScript + Tailwind + shadcn/ui (à mão) + TanStack Query/Table |
| `apps/api` | Fastify 5 + Drizzle ORM + PostgreSQL + `@fastify/helmet` |
| `packages/shared` | tipos e schemas Zod compartilhados web ↔ api |
| `pipeline/` | scripts Python de extração via IA (chamados pela api via `child_process`) |

`apps/web/src` é organizado por **feature** (`features/extraction`, `features/questions`,
`features/export`), com `components/ui` (design system) e `components/layout` (shell).

## Requisitos

- **Node ≥ 20** (o `server.ts` usa `await` no topo do módulo)
- **pnpm 9**
- **Python ≥ 3.10** para o pipeline
- **PostgreSQL 16** (local ou Docker)

## Como levantar

### 1. Dependências JS

```bash
pnpm install
```

### 2. Dependências Python (pipeline)

Use um virtualenv dedicado — evita conflito com outros Pythons da máquina e
mantém o Pylance resolvendo os imports:

```bash
python -m venv pipeline/.venv
pipeline/.venv/Scripts/pip install -r pipeline/requirements.txt   # Linux/Mac: pipeline/.venv/bin/pip
```

No VS Code: **Python: Select Interpreter** → `pipeline/.venv`.

### 3. Postgres

```bash
docker run --name questum-db -e POSTGRES_USER=questum -e POSTGRES_PASSWORD=questum \
  -e POSTGRES_DB=questum -p 5433:5432 -d postgres:16
```

> Use uma porta diferente de `5432` se já tiver um Postgres nativo na máquina —
> é uma fonte comum de erro de autenticação difícil de diagnosticar.

### 4. Variáveis de ambiente da API

```bash
cp apps/api/.env.example apps/api/.env
```

Edite `apps/api/.env`:

| Variável | Obrigatória | Default | Para quê |
|---|---|---|---|
| `DATABASE_URL` | **sim** | — | conexão Postgres |
| `GEMINI_API_KEY` | **sim** | — | chave da API do Gemini ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)) |
| `PYTHON_BIN` | não | `python` no Windows, `python3` no resto | interpretador do pipeline (aponte pro `.venv` acima) |
| `PIPELINE_DIR` | não | resolvido relativo ao arquivo | pasta do pipeline |
| `PIPELINE_TIMEOUT_MS` | não | `600000` (10 min) | mata o pipeline se travar |
| `PIPELINE_MAX_OUTPUT_BYTES` | não | `209715200` (200 MB) | teto da saída do pipeline (proteção contra OOM) |
| `PORT` | não | `3333` | porta da API |
| `HOST` | não | `127.0.0.1` | use `0.0.0.0` pra expor na rede local |
| `CORS_ORIGIN` | não | `http://localhost:5173` | origens liberadas (lista separada por vírgula) |
| `MAX_ARQUIVOS` | não | `20` | máximo de `.docx` por extração |
| `DB_POOL_MAX` / `DB_CONNECT_TIMEOUT` | não | `10` / `10` | pool do Postgres |

### 5. Migrations

```bash
pnpm db:migrate          # aplica as migrations existentes
pnpm db:generate         # só quando alterar apps/api/src/db/schema.ts
```

### 6. Rodar (dois terminais)

```bash
pnpm dev:api    # http://localhost:3333
pnpm dev:web    # http://localhost:5173
```

> Não há script que suba os dois juntos. Se o front mostrar
> `ECONNREFUSED 127.0.0.1:3333`, a API não está no ar.

## Scripts

| Comando | O que faz |
|---|---|
| `pnpm dev:api` / `pnpm dev:web` | sobe cada servidor em modo dev |
| `pnpm test` | roda os testes de todos os pacotes (Vitest) |
| `pnpm --filter @questum/web test:watch` | testes em watch (idem `@questum/api`) |
| `pnpm --filter @questum/web build` | typecheck + build de produção do front |
| `pnpm db:generate` / `pnpm db:migrate` | Drizzle Kit |

## Testes

Vitest + Testing Library. Cobre a lógica pura crítica:

- `apps/api` — `xml-export.build.ts` (formatação do XML: essay/multichoice, CDATA, imagem→`<file>`, fórmula→LaTeX, `validarQuestoes`)
- `apps/web` — `filtrar-questoes.ts` (filtros da revisão) e `segmentarConteudo` (parser dos marcadores de imagem/fórmula)

```bash
pnpm test
```

## Fluxo da aplicação

1. **Extração** (`/extraction`) — informa a disciplina (combobox com as já
   processadas; diz se vai criar nova ou adicionar a uma existente) e envia
   um ou mais `.docx`. A extração roda em background; a tela acompanha o
   progresso **arquivo a arquivo**.
2. **Revisão** (`/questions`) — tabela das questões (busca, filtros por
   tipo/dificuldade/unidade, ordenação, paginação). O diálogo de edição
   mostra prévia de imagem/fórmula (KaTeX) por campo e permite editar
   enunciado, alternativas, resposta correta, justificativa e unidade.
3. **Exportação** (`/export`) — escolhe a disciplina, vê um resumo
   (questões/unidades/imagens/fórmulas) e baixa o XML. O arquivo é gerado a
   partir dos dados **já editados** no Postgres, não do resultado bruto da IA.
   Avisos não-fatais (ex: objetiva sem resposta correta) aparecem num toast.

## Segurança

- `@fastify/helmet` — CSP `default-src 'none'` (a API só devolve JSON/XML),
  `X-Content-Type-Options`, `X-Frame-Options: DENY`, HSTS só com
  `NODE_ENV=production`.
- CORS restrito a `CORS_ORIGIN`.
- `HOST` default `127.0.0.1` — a API não fica exposta na rede sem escolha
  explícita. **Não há autenticação** — o modelo é de ferramenta local.
- Upload: nome de arquivo sanitizado (`path.basename`), limites de tamanho e
  quantidade no multipart.
- Shutdown limpo (SIGINT/SIGTERM drenam o servidor e fecham o pool).

## Componentes shadcn/ui

Os componentes em `apps/web/src/components/ui/` foram escritos à mão seguindo o
padrão shadcn, com classes Tailwind diretas em vez do sistema de variáveis CSS
(`components.json` com `cssVariables: true`). Se rodar a CLI oficial
(`npx shadcn@latest add <componente>`) o resultado pode vir num padrão
levemente diferente — vale alinhar depois.

## Funcionalidades

**Extração**
- [x] `POST /extractions` (multipart) — recebe os `.docx`, roda o pipeline em
  background, persiste tudo numa transação
- [x] Progresso arquivo a arquivo (`GET /extractions/:id`, polling)
- [x] Dedup: reenviar o mesmo `.docx` numa disciplina existente é ignorado
  (vira aviso, não duplica)
- [x] Imagens (associadas por marcador), fórmulas (OMML→LaTeX), tags
  automáticas (disciplina/tipo/unidade/dificuldade)

**Revisão / Exportação**
- [x] `GET /disciplinas`, `GET /questoes?disciplinaId=`, `GET /questoes/:id`,
  `PATCH /questoes/:id`
- [x] `GET /disciplinas/:id/export` — XML do Moodle (CDATA correto, imagens
  embutidas em base64, fórmulas via MathJax), validado num Moodle real
- [x] Tabela com filtros/ordenação/paginação; edição de alternativas,
  resposta correta e unidade; prévia de imagem/fórmula por campo
- [x] Download via `fetch`+blob (erro vira toast, não uma página de JSON cru)
- [x] Última disciplina lembrada (localStorage), filtros resetam ao trocar de
  disciplina

**Plataforma**
- [x] Dark mode (segue o SO ou escolha manual), paleta "Academia Tech"
- [x] Paleta de comandos (Ctrl/Cmd+K) — navega entre páginas e disciplinas
- [x] Tela 404, `prefers-reduced-motion`, headers de segurança, code-split
- [x] Testes (Vitest + Testing Library)

**Pendente**
- [ ] Página de histórico de importações (`/history` existe mas está vazia)
- [ ] Recuperar um job de extração após fechar a aba (`extracaoId` só vive em memória)
- [ ] ESLint / Prettier / CI
- [ ] Avaliar outras IAs além do Gemini (OpenAI, Claude)

## Limitações conhecidas

- Só `.docx` — `.doc` (Word antigo) precisa ser convertido manualmente antes do upload.
- SmartArt e formas com **imagem vetorial sem texto** (um diagrama puramente
  gráfico) não são capturados — só o texto de dentro é.
- Sem autenticação (ver *Segurança*).
