# Questum — Monorepo

## Estrutura

- `apps/web` — Vite + React + TypeScript + Tailwind + shadcn/ui
- `apps/api` — Fastify + Drizzle ORM + PostgreSQL
- `packages/shared` — tipos e schemas Zod compartilhados entre web e api
- `pipeline/` — scripts Python de extração via IA (chamados pela api via `child_process`)

## Como levantar

1. Instalar dependências JS (na raiz, resolve tudo via workspace):
   ```bash
   pnpm install
   ```

2. Instalar dependências Python:
   ```bash
   cd pipeline
   pip install -r requirements.txt --break-system-packages
   cd ..
   ```

3. Configurar variáveis de ambiente da API:
   ```bash
   cp apps/api/.env.example apps/api/.env
   # edite apps/api/.env com DATABASE_URL e GEMINI_API_KEY reais
   ```

4. Subir um Postgres local (exemplo via Docker):
   ```bash
   docker run --name questum-db -e POSTGRES_USER=questum -e POSTGRES_PASSWORD=questum -e POSTGRES_DB=questum -p 5432:5432 -d postgres:16
   ```

5. Gerar e aplicar as migrations:
   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

6. Rodar os dois servidores (em terminais separados):
   ```bash
   pnpm dev:api    # http://localhost:3333
   pnpm dev:web    # http://localhost:5173
   ```

## Inicializar os componentes shadcn/ui

Depois do `pnpm install`, dentro de `apps/web`:
```bash
npx shadcn@latest init
npx shadcn@latest add button input form table dialog sheet dropdown-menu sonner
```

## Status deste esqueleto

- [x] Workspace configurado (pnpm)
- [x] Schema do Postgres (Drizzle) — disciplinas, unidades, arquivos, questões, alternativas, imagens
- [x] Rota `POST /extractions` — aciona o pipeline Python e persiste o resultado
- [x] Rotas do frontend (react-router) com páginas placeholder
- [ ] Componentes shadcn/ui de fato instalados (rodar o `init` acima)
- [ ] Formulário de extração (`features/extraction`)
- [ ] Tabela de revisão de questões (`features/questions`, TanStack Table)
- [ ] Associação imagem <-> questão na persistência (hoje as imagens vêm no resultado mas não são gravadas na tabela `imagens` ainda — ver TODO em `extractions.routes.ts`)
- [ ] `xml-export.service.ts` (geração do XML a partir dos dados persistidos/editados)
