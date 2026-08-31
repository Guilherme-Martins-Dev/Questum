import { Clock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";

export function HistoryPage() {
  return (
    <div>
      <PageHeader
        title="Histórico de importações"
        description="Lotes de arquivos já processados."
      />
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-12 text-center">
        <Clock className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Em breve.</p>
      </div>
    </div>
  );
}
