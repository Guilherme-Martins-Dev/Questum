import { ExtractionForm } from "@/features/extraction/components/extraction-form";

export function ExtractionPage() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-medium">Configurar extração</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-500">
        Informe a disciplina e envie os arquivos .docx.
      </p>
      <ExtractionForm />
    </div>
  );
}
