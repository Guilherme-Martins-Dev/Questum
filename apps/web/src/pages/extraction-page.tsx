import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ExtractionForm } from "@/features/extraction/components/extraction-form";

export function ExtractionPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Configurar extração"
        description="Informe a disciplina e envie os arquivos .docx. A IA identifica as questões, alternativas, imagens e fórmulas."
      />
      <Card>
        <CardContent className="pt-6">
          <ExtractionForm />
        </CardContent>
      </Card>
    </div>
  );
}
