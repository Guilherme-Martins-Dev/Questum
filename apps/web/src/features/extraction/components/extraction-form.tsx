import { useCallback, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDropzone } from "react-dropzone";
import { z } from "zod";
import { FileText, FileUp, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useExtractQuestions } from "../hooks/use-extract-questions";
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

  // Trava síncrona contra duplo clique/duplo submit: extracao.isPending só
  // vira true depois de um re-render do React, então um clique duplo bem
  // rápido consegue disparar duas mutações antes do botão desabilitar.
  const enviandoRef = useRef(false);

  const {
    register,
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

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="disciplina">Disciplina</Label>
        <Input
          id="disciplina"
          placeholder="Banco de Dados"
          disabled={desabilitado}
          {...register("disciplina")}
        />
        {errors.disciplina && <p className="text-xs text-destructive">{errors.disciplina.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Arquivos .docx</Label>
        <div
          {...getRootProps()}
          className={cn(
            "rounded-md border-2 border-dashed p-6 text-center text-sm text-muted-foreground transition-colors",
            desabilitado && "cursor-not-allowed opacity-60",
            isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          )}
        >
          <input {...getInputProps()} />
          <FileUp className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p>Arraste os arquivos aqui ou clique para selecionar</p>
          <p className="mt-1 text-xs text-muted-foreground">.docx — vários arquivos de uma vez</p>
        </div>
      </div>

      {arquivos.length > 0 && (
        <ul className="space-y-2">
          {arquivos.map((arquivo) => {
            const unidade = detectarUnidadePeloNome(arquivo.name);
            return (
              <li
                key={arquivo.name}
                className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm">{arquivo.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatarTamanho(arquivo.size)}
                  </span>
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
                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                    aria-label={`Remover ${arquivo.name}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button
        type="submit"
        loading={extracao.isPending}
        disabled={arquivos.length === 0}
        className="w-full sm:w-auto"
      >
        {!extracao.isPending && <Sparkles className="h-4 w-4" />}
        {extracao.isPending ? "Enviando…" : "Iniciar extração"}
      </Button>
    </form>
  );
}
