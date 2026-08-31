import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Loader2, Search, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { QuestionsTable } from "@/features/questions/components/questions-table";
import { useDisciplinas } from "@/features/questions/hooks/use-disciplinas";
import { useQuestions } from "@/features/questions/hooks/use-questions";
import { useExportXml } from "@/features/questions/hooks/use-export-xml";
import {
  escolherDisciplinaInicial,
  salvarDisciplinaPreferida,
} from "@/features/questions/lib/disciplina-preferida";

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function QuestionsReviewPage() {
  const disciplinas = useDisciplinas();
  const [searchParams, setSearchParams] = useSearchParams();
  const disciplinaId = searchParams.get("disciplinaId");

  // A URL manda. Quando chega sem disciplinaId (acesso direto à página),
  // usa a última disciplina aberta (localStorage) ou a primeira da lista.
  // Quando a URL traz uma disciplina válida, memoriza pra próxima visita.
  useEffect(() => {
    if (!disciplinas.data || disciplinas.data.length === 0) return;

    if (disciplinaId) {
      if (disciplinas.data.some((d) => d.id === disciplinaId)) {
        salvarDisciplinaPreferida(disciplinaId);
      }
      return;
    }

    const inicial = escolherDisciplinaInicial(disciplinas.data);
    if (inicial) {
      setSearchParams({ disciplinaId: inicial.id }, { replace: true });
    }
  }, [disciplinas.data, disciplinaId, setSearchParams]);

  const questoes = useQuestions(disciplinaId);

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroDificuldade, setFiltroDificuldade] = useState("");
  const [filtroUnidade, setFiltroUnidade] = useState("");

  // Trocar de disciplina zera os filtros: as unidades são diferentes entre
  // disciplinas e um "Unidade 2" preso de outra disciplina esconde tudo
  // sem deixar claro o porquê (o select de unidade some quando a nova
  // disciplina não tem unidades).
  useEffect(() => {
    setBusca("");
    setFiltroTipo("");
    setFiltroDificuldade("");
    setFiltroUnidade("");
  }, [disciplinaId]);

  const unidadesDisponiveis = useMemo(() => {
    const nomes = new Set<string>();
    for (const q of questoes.data ?? []) {
      if (q.unidadeNome) nomes.add(q.unidadeNome);
    }
    return [...nomes].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  }, [questoes.data]);

  const questoesFiltradas = useMemo(() => {
    const termo = normalizar(busca.trim());
    return (questoes.data ?? []).filter((q) => {
      if (filtroTipo && q.tipo !== filtroTipo) return false;
      if (filtroDificuldade && (q.dificuldade || "") !== filtroDificuldade) return false;
      if (filtroUnidade && q.unidadeNome !== filtroUnidade) return false;
      if (termo && !normalizar(`${q.titulo} ${q.enunciado}`).includes(termo)) return false;
      return true;
    });
  }, [questoes.data, busca, filtroTipo, filtroDificuldade, filtroUnidade]);

  const temFiltroAtivo = Boolean(busca || filtroTipo || filtroDificuldade || filtroUnidade);
  const total = questoes.data?.length ?? 0;

  const { exportar, gerando } = useExportXml();

  function limparFiltros() {
    setBusca("");
    setFiltroTipo("");
    setFiltroDificuldade("");
    setFiltroUnidade("");
  }

  const semDisciplinas = disciplinas.data && disciplinas.data.length === 0;

  return (
    <div>
      <PageHeader
        title="Revisar questões"
        description="Confira e edite o que a extração via IA identificou antes de exportar."
        actions={
          <>
            {disciplinas.data && disciplinas.data.length > 0 && (
              <Select
                value={disciplinaId ?? ""}
                onChange={(evento) => setSearchParams({ disciplinaId: evento.target.value })}
                className="w-48"
                aria-label="Disciplina"
              >
                {disciplinas.data.map((disciplina) => (
                  <option key={disciplina.id} value={disciplina.id}>
                    {disciplina.nome}
                  </option>
                ))}
              </Select>
            )}
            {total > 0 && (
              <Button
                onClick={() => disciplinaId && exportar(disciplinaId)}
                disabled={!disciplinaId || gerando}
              >
                {gerando ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Exportar XML
                  </>
                )}
              </Button>
            )}
          </>
        }
      />

      {semDisciplinas && (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            Nenhuma disciplina processada ainda. Rode uma extração primeiro.
          </p>
        </div>
      )}

      {disciplinas.isLoading && <TabelaSkeleton />}

      {(disciplinas.isError || questoes.isError) && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">
            Não foi possível carregar os dados. Verifique a conexão e tente novamente.
          </p>
        </div>
      )}

      {disciplinaId && questoes.isLoading && <TabelaSkeleton />}

      {disciplinaId && questoes.data && (
        <>
          {total === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhuma questão nesta disciplina. Rode uma extração primeiro.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="relative flex-1 sm:min-w-[220px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={busca}
                    onChange={(evento) => setBusca(evento.target.value)}
                    placeholder="Buscar por título ou enunciado…"
                    className="pl-8"
                  />
                </div>

                <Select
                  value={filtroTipo}
                  onChange={(evento) => setFiltroTipo(evento.target.value)}
                  className="sm:w-40"
                  aria-label="Filtrar por tipo"
                >
                  <option value="">Todos os tipos</option>
                  <option value="Objetiva">Objetiva</option>
                  <option value="Discursiva">Discursiva</option>
                </Select>

                <Select
                  value={filtroDificuldade}
                  onChange={(evento) => setFiltroDificuldade(evento.target.value)}
                  className="sm:w-44"
                  aria-label="Filtrar por dificuldade"
                >
                  <option value="">Todas as dificuldades</option>
                  <option value="Fácil">Fácil</option>
                  <option value="Média">Média</option>
                  <option value="Difícil">Difícil</option>
                </Select>

                {unidadesDisponiveis.length > 0 && (
                  <Select
                    value={filtroUnidade}
                    onChange={(evento) => setFiltroUnidade(evento.target.value)}
                    className="sm:w-40"
                    aria-label="Filtrar por unidade"
                  >
                    <option value="">Todas as unidades</option>
                    {unidadesDisponiveis.map((nome) => (
                      <option key={nome} value={nome}>
                        {nome}
                      </option>
                    ))}
                  </Select>
                )}

                {temFiltroAtivo && (
                  <Button variant="ghost" size="sm" onClick={limparFiltros}>
                    Limpar filtros
                  </Button>
                )}
              </div>

              <p className="text-sm text-muted-foreground">
                {temFiltroAtivo ? (
                  <>
                    <span className="font-medium text-foreground">{questoesFiltradas.length}</span> de {total}{" "}
                    {total === 1 ? "questão" : "questões"}
                  </>
                ) : (
                  <>
                    <span className="font-medium text-foreground">{total}</span>{" "}
                    {total === 1 ? "questão" : "questões"}
                  </>
                )}
              </p>

              {questoesFiltradas.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-10 text-center">
                  <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma questão corresponde aos filtros.
                  </p>
                  <Button variant="secondary" size="sm" onClick={limparFiltros}>
                    Limpar filtros
                  </Button>
                </div>
              ) : (
                <QuestionsTable questoes={questoesFiltradas} unidades={unidadesDisponiveis} />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabelaSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-14 w-full" />
      <div className="space-y-2 rounded-lg border border-border p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    </div>
  );
}
