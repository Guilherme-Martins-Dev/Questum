import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ComoFunciona } from "@/features/extraction/components/como-funciona";
import { ExtractionForm } from "@/features/extraction/components/extraction-form";

export function ExtractionPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nova extração"
        description="Envie os arquivos .docx com as questões e deixe a IA fazer o trabalho pesado."
      />
      <ComoFunciona />
      <Card>
        <CardContent className="pt-6">
          <ExtractionForm />
        </CardContent>
      </Card>
    </div>
  );
}
