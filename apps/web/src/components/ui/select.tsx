import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Wrapper leve em cima do <select> nativo — mantém acessibilidade e
 * comportamento mobile de graça, só padroniza a aparência com os tokens
 * do tema (evita os selects "crus" que destoavam do resto da UI).
 *
 * `className` estiliza o container (onde vão largura/margem); o <select>
 * em si ocupa 100% dele.
 */
const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className={cn("relative", className)}>
      <select
        ref={ref}
        className="h-9 w-full appearance-none rounded-md border border-input bg-card px-3 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  ),
);
Select.displayName = "Select";

export { Select };
