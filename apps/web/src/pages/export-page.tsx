import { Link } from "react-router-dom";
import { FileUp, Inbox } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisciplinas } from "@/features/questions/hooks/use-disciplinas";
import { ExportForm } from "@/features/export/components/export-form";

export function ExportPage() {
  const disciplinas = useDisciplinas();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Exportar para o Moodle"
        description="Gera o arquivo XML de importação de questões a partir do que já foi revisado."
      />

      <Card>
        <CardContent className="pt-6">
          {disciplinas.isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-[72px] w-full" />
              <Skeleton className="h-28 w-full" />
            </div>
          )}

          {disciplinas.isError && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Não foi possível carregar as disciplinas. Verifique a conexão e tente novamente.
            </p>
          )}

          {disciplinas.data && disciplinas.data.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium">Nada para exportar ainda</p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                  Assim que você processar uma prova, ela aparece aqui pronta pro Moodle.
                </p>
              </div>
              <Button asChild variant="secondary">
                <Link to="/extraction">
                  <FileUp className="h-4 w-4" />
                  Ir para a extração
                </Link>
              </Button>
            </div>
          )}

          {disciplinas.data && disciplinas.data.length > 0 && (
            <ExportForm disciplinas={disciplinas.data} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
