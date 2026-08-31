import { useCallback, useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDropzone } from "react-dropzone";
import { z } from "zod";
import { FileText, FileUp, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDisciplinas } from "@/features/questions/hooks/use-disciplinas";
import { useExtractQuestions } from "../hooks/use-extract-questions";
import { DisciplinaCombobox } from "./disciplina-combobox";
import { ExtractionProgress } from "./extraction-progress";

const PADRAO_UNIDADE_NO_NOME = /\bUNI(?:DADE)?[\s_.-]*0*([0-9]+)/i;

function detectarUnidadePeloNome(nomeArquivo: string): string | null {
  const encontrado = nomeArquivo.match(PADRAO_UNIDADE_NO_NOME);
  return encontrado ? `Unidade ${Number(encontrado[1])}` : null;
}

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const formSchema = z.object({
  disciplina: z.string().trim().min(2, "Informe o nome da disciplina."),
});

type FormValues = z.infer<typeof formSchema>;

export function ExtractionForm() {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [extracaoId, setExtracaoId] = useState<string | null>(null);
  const extracao = useExtractQuestions();
  const disciplinas = useDisciplinas();

  // Trava síncrona contra duplo clique/duplo submit: extracao.isPending só
  // vira true depois de um re-render do React, então um clique duplo bem
  // rápido consegue disparar duas mutações antes do botão desabilitar.
  const enviandoRef = useRef(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { disciplina: "" },
  });

  const onDrop = useCallback((arquivosAceitos: File[]) => {
    setArquivos((atuais) => {
      // Evita duplicar o mesmo arquivo se for solto duas vezes.
      const nomesAtuais = new Set(atuais.map((a) => a.name));
      return [...atuais, ...arquivosAceitos.filter((a) => !nomesAtuais.has(a.name))];
    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
    multiple: true,
    disabled: extracao.isPending,
  });

  function removerArquivo(nome: string) {
    setArquivos((atuais) => atuais.filter((arquivo) => arquivo.name !== nome));
  }

  function onSubmit(dados: FormValues) {
    if (arquivos.length === 0 || enviandoRef.current) return;
    enviandoRef.current = true;

    extracao.mutate(
      { disciplina: dados.disciplina, arquivos },
      {
        onSuccess: (resposta) => setExtracaoId(resposta.extracaoId),
        onSettled: () => {
          enviandoRef.current = false;
        },
      },
    );
  }

  // Enquanto há um job em andamento, o formulário some e dá lugar ao
  // acompanhamento. "Voltar/Tentar de novo" traz o formulário de volta com
  // os arquivos preservados.
  if (extracaoId) {
    return <ExtractionProgress extracaoId={extracaoId} onReset={() => setExtracaoId(null)} />;
  }

  const desabilitado = extracao.isPending;
  const tamanhoTotal = arquivos.reduce((soma, a) => soma + a.size, 0);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="disciplina">Disciplina</Label>
        <Controller
          control={control}
          name="disciplina"
          render={({ field }) => (
            <DisciplinaCombobox
              id="disciplina"
              value={field.value}
              onChange={field.onChange}
              disciplinas={(disciplinas.data ?? []).map((d) => d.nome)}
              disabled={desabilitado}
              error={errors.disciplina?.message}
            />
          )}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Arquivos .docx</Label>
        <div
          {...getRootProps()}
          className={cn(
            "flex flex-col items-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-all",
            desabilitado && "cursor-not-allowed opacity-60",
            isDragActive
              ? "border-primary bg-primary/10 ring-2 ring-primary/20"
              : "border-border hover:border-accent/60 hover:bg-accent/5",
          )}
        >
          <input {...getInputProps()} />
          <div
            className={cn(
              "mb-3 flex h-12 w-12 items-center justify-center rounded-full transition-colors",
              isDragActive ? "bg-primary/15 text-primary" : "bg-accent/10 text-accent",
            )}
          >
            <FileUp className="h-6 w-6" />
          </div>
          <p className="text-sm font-medium">
            {isDragActive ? "Solte para adicionar" : "Arraste os arquivos aqui"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            ou <span className="font-medium text-foreground">clique para selecionar</span> · .docx ·
            vários de uma vez
          </p>
        </div>
      </div>

      {arquivos.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {arquivos.length} {arquivos.length === 1 ? "arquivo" : "arquivos"} ·{" "}
              {formatarTamanho(tamanhoTotal)}
            </span>
            {!desabilitado && (
              <button
                type="button"
                onClick={() => setArquivos([])}
                className="transition-colors hover:text-foreground"
              >
                Limpar tudo
              </button>
            )}
          </div>
          <ul className="space-y-2">
            {arquivos.map((arquivo) => {
              const unidade = detectarUnidadePeloNome(arquivo.name);
              return (
                <li
                  key={arquivo.name}
                  className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{arquivo.name}</p>
                      <p className="text-xs text-muted-foreground">{formatarTamanho(arquivo.size)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {unidade && (
                      <SimpleTooltip content="Palpite a partir do nome do arquivo. A unidade de cada questão é definida pela IA durante a extração — não por isto.">
                        <Badge variant="accent">detectado: {unidade}</Badge>
                      </SimpleTooltip>
                    )}
                    <button
                      type="button"
                      onClick={() => removerArquivo(arquivo.name)}
                      disabled={desabilitado}
                      className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                      aria-label={`Remover ${arquivo.name}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <Button
        type="submit"
        loading={extracao.isPending}
        disabled={arquivos.length === 0}
        className="w-full sm:w-auto"
      >
        {!extracao.isPending && <Sparkles className="h-4 w-4" />}
        {extracao.isPending
          ? "Enviando…"
          : arquivos.length > 0
            ? `Extrair ${arquivos.length} ${arquivos.length === 1 ? "arquivo" : "arquivos"}`
            : "Iniciar extração"}
      </Button>
    </form>
  );
}
