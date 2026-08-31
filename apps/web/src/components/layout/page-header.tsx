import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** Ações à direita do título (botões, seletores). */
  actions?: ReactNode;
}

/** Cabeçalho padronizado de página: título + descrição + ações opcionais. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
