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
   No Windows, adicione também `PYTHON_BIN` apontando pro comando/caminho do Python que você usa (ex: `PYTHON_BIN=python`) — o padrão `python3` costuma não existir no Windows.

4. Subir um Postgres local (exemplo via Docker). Use uma porta diferente de `5432` se já tiver algum Postgres nativo instalado na máquina (motivo comum de erro de autenticação difícil de diagnosticar):
   ```bash
   docker run --name questum-db -e POSTGRES_USER=questum -e POSTGRES_PASSWORD=questum -e POSTGRES_DB=questum -p 5433:5432 -d postgres:16
   ```
   E ajuste `DATABASE_URL` no `.env` pra usar a porta `5433`.

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

## Componentes shadcn/ui

Os componentes em `apps/web/src/components/ui/` (button, input, label, badge, card, table, dialog, textarea) foram escritos à mão, seguindo o padrão do shadcn, usando classes Tailwind diretas em vez do sistema de variáveis CSS semânticas que o `components.json` está configurado pra esperar (`cssVariables: true`). Funcionam normalmente, mas se você rodar a CLI oficial pra adicionar mais algum componente:
```bash
npx shadcn@latest init
npx shadcn@latest add <componente>
```
o resultado pode vir num padrão visual levemente diferente dos que já existem — nesse caso, vale alinhar os componentes escritos à mão pro mesmo padrão de variáveis.

## Fluxo da aplicação

Upload (.docx, um ou mais arquivos) → extração via IA (Gemini) → persistência no Postgres → revisão e edição das questões na interface → exportação do XML final do Moodle, gerado a partir dos dados já editados (não do resultado bruto da IA).

## Status

### Pronto
- [x] Workspace configurado (pnpm)
- [x] Schema do Postgres (Drizzle) — disciplinas, unidades, arquivos, questões, alternativas, imagens
- [x] `POST /extractions` (multipart) — recebe os `.docx` de verdade, aciona o pipeline Python, persiste o resultado (questões, alternativas, imagens associadas por marcador, tags derivadas de disciplina/tipo/unidade/dificuldade)
- [x] Correção: extração com múltiplos arquivos não duplica mais questões (cada questão carrega seu `arquivo_origem`)
- [x] `GET /disciplinas`, `GET /questoes?disciplinaId=`, `PATCH /questoes/:id`
- [x] `GET /disciplinas/:id/export` — gera e devolve o XML do Moodle pra download, a partir dos dados persistidos/editados (com CDATA correto pro conteúdo HTML, diferente da versão Python original)
- [x] Formulário de extração (`features/extraction`) — dropzone, disciplina, detecção de unidade pelo nome do arquivo, trava contra duplo clique
- [x] Tela de revisão (`features/questions`) — tabela com TanStack Table, diálogo de edição com prévia de imagem por campo (enunciado/justificativa)
- [x] Botão de exportar XML na tela de revisão
- [x] Navegação automática pra revisão após a extração, com invalidação de cache
- [x] `upload-page.tsx` removida — upload passou a viver dentro do formulário de extração, não é mais uma etapa separada
- [x] Correção: edição de dificuldade na tela de revisão (rota `PATCH /questoes/:id` sem tratamento de erro escondia a causa real de falhas do banco)
- [x] XML gerado validado importando num Moodle de teste real

### Pendente
- [ ] `npx shadcn init` de verdade (os componentes atuais foram escritos à mão)
- [ ] Testes automatizados
- [ ] Avaliar outras IAs além do Gemini (OpenAI, Claude) para a extração
