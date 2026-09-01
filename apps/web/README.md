# @questum/web

Front Vite + React + TypeScript + Tailwind. Interface de extração, revisão e
exportação. Fala com a API pelo proxy `/api` (ver `vite.config.ts`).

> Setup e como rodar: [README da raiz](../../README.md).

## Estrutura

```
src/
├── main.tsx / App.tsx          # ErrorBoundary + Router; rotas /extraction, /questions, /export, /history, 404
├── app/
│   ├── providers.tsx           # QueryClient, Toaster (sonner)
│   ├── theme-provider.tsx      # dark mode (light/dark/system) + anti-FOUC
│   └── globals.css             # tokens "Academia Tech", prefers-reduced-motion
├── components/
│   ├── ui/                     # design system (shadcn à mão)
│   ├── layout/                 # app-layout, page-header, theme-toggle
│   ├── command-menu.tsx        # paleta de comandos (Ctrl/Cmd+K)
│   └── error-boundary.tsx
├── features/
│   ├── extraction/             # formulário, combobox de disciplina, progresso por arquivo
│   ├── questions/              # tabela (filtros/ordenação/paginação), diálogo de edição, hooks
│   └── export/                 # picker + resumo + download
├── lib/                        # utils (cn)
└── test/setup.ts               # jest-dom
```

## Padrões

- **Feature folders**: cada área tem seus `components/`, `hooks/`, `lib/`, `types.ts`.
- **Design system à mão**: `components/ui/` segue o shadcn mas com classes Tailwind
  diretas (não o sistema de variáveis CSS). Ver nota no README da raiz.
- **Data**: TanStack Query pra tudo que vem da API; `localStorage` só pra
  conveniências (última disciplina, tema).
- **Tema**: 3 estados (`light`/`dark`/`system`); componentes usam só tokens
  (`bg-card`, `text-muted-foreground`, …), nunca cor fixa.

## Scripts

```bash
pnpm --filter @questum/web dev           # vite
pnpm --filter @questum/web test          # vitest (filtrar-questoes, segmentarConteudo)
pnpm --filter @questum/web test:watch
pnpm --filter @questum/web build         # tsc -b && vite build
```
