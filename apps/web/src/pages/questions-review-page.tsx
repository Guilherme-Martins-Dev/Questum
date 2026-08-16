import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuestionsTable } from "@/features/questions/components/questions-table";
import { useDisciplinas } from "@/features/questions/hooks/use-disciplinas";
import { useQuestions } from "@/features/questions/hooks/use-questions";

export function QuestionsReviewPage() {
  const disciplinas = useDisciplinas();
  const [searchParams, setSearchParams] = useSearchParams();
  const disciplinaId = searchParams.get("disciplinaId");

  // Se chegou sem disciplinaId na URL (ex: acesso direto à página, não
  // vindo da extração), seleciona a primeira disciplina disponível assim
  // que a lista carrega.
  useEffect(() => {
    if (!disciplinaId && disciplinas.data && disciplinas.data.length > 0) {
      setSearchParams({ disciplinaId: disciplinas.data[0].id });
    }
  }, [disciplinas.data, disciplinaId, setSearchParams]);

  const questoes = useQuestions(disciplinaId);

  function baixarXml() {
    if (!disciplinaId) return;
    // Deixa o navegador tratar como download nativo (o Content-Disposition
    // que o backend manda já cuida do nome do arquivo e do "salvar como").
    window.location.href = `/api/disciplinas/${disciplinaId}/export`;
  }

  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-medium">Revisar questões</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Confira e edite o que a extração via IA identificou antes de exportar.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {disciplinas.data && disciplinas.data.length > 0 && (
            <select
              value={disciplinaId ?? ""}
              onChange={(evento) => setSearchParams({ disciplinaId: evento.target.value })}
              className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm"
            >
              {disciplinas.data.map((disciplina) => (
                <option key={disciplina.id} value={disciplina.id}>
                  {disciplina.nome}
                </option>
              ))}
            </select>
          )}

          {questoes.data && questoes.data.length > 0 && (
            <Button onClick={baixarXml}>
              <Download className="h-4 w-4" />
              Exportar XML
            </Button>
          )}
        </div>
      </div>

      {disciplinas.isLoading && <p className="text-sm text-neutral-500">Carregando disciplinas...</p>}

      {disciplinas.data && disciplinas.data.length === 0 && (
        <p className="rounded-md border border-dashed border-neutral-200 p-8 text-center text-sm text-neutral-500">
          Nenhuma disciplina processada ainda. Rode uma extração primeiro.
        </p>
      )}

      {questoes.isLoading && disciplinaId && <p className="text-sm text-neutral-500">Carregando questões...</p>}

      {questoes.data && <QuestionsTable questoes={questoes.data} />}
    </div>
  );
}
