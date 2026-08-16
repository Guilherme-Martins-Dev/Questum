import { useCallback, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { FileText, FileUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useExtractQuestions } from "../hooks/use-extract-questions";

const PADRAO_UNIDADE_NO_NOME = /\bUNI(?:DADE)?[\s_.-]*0*([0-9]+)/i;

function detectarUnidadePeloNome(nomeArquivo: string): string | null {
  const encontrado = nomeArquivo.match(PADRAO_UNIDADE_NO_NOME);
  return encontrado ? `Unidade ${Number(encontrado[1])}` : null;
}

const formSchema = z.object({
  disciplina: z.string().trim().min(2, "Informe o nome da disciplina."),
});

type FormValues = z.infer<typeof formSchema>;

export function ExtractionForm() {
  const [arquivos, setArquivos] = useState<File[]>([]);
  const extracao = useExtractQuestions();
  const navigate = useNavigate();

  // Trava síncrona contra duplo clique/duplo submit: extracao.isPending só
  // vira true depois de um re-render do React, então um clique duplo bem
  // rápido consegue disparar duas mutações antes do botão desabilitar.
  // Essa ref muda no mesmo instante do clique, sem esperar re-render.
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
    setArquivos((atuais) => [...atuais, ...arquivosAceitos]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
    multiple: true,
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
        onSuccess: (resposta) => {
          navigate(`/questions?disciplinaId=${resposta.disciplinaId}`);
        },
        onSettled: () => {
          enviandoRef.current = false;
        },
      },
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="disciplina">Disciplina</Label>
        <Input id="disciplina" placeholder="Banco de Dados" {...register("disciplina")} />
        {errors.disciplina && <p className="text-xs text-red-600">{errors.disciplina.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Arquivos .docx</Label>
        <div
          {...getRootProps()}
          className={`rounded-md border-2 border-dashed p-6 text-center text-sm text-neutral-500 transition-colors ${
            isDragActive ? "border-neutral-400 bg-neutral-50" : "border-neutral-200"
          }`}
        >
          <input {...getInputProps()} />
          <FileUp className="mx-auto mb-2 h-6 w-6 text-neutral-400" />
          <p>Arraste os arquivos aqui ou clique para selecionar</p>
          <p className="mt-1 text-xs text-neutral-400">.docx — vários arquivos de uma vez</p>
        </div>
      </div>

      {arquivos.length > 0 && (
        <ul className="space-y-2">
          {arquivos.map((arquivo) => {
            const unidade = detectarUnidadePeloNome(arquivo.name);
            return (
              <li
                key={arquivo.name}
                className="flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-neutral-400" />
                  <span className="truncate text-sm">{arquivo.name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {unidade && <Badge variant="accent">{unidade}</Badge>}
                  <button
                    type="button"
                    onClick={() => removerArquivo(arquivo.name)}
                    className="text-xs text-neutral-400 hover:text-neutral-600"
                  >
                    Remover
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Button type="submit" disabled={arquivos.length === 0 || extracao.isPending}>
        <Sparkles className="h-4 w-4" />
        {extracao.isPending ? "Extraindo..." : "Iniciar extração"}
      </Button>
    </form>
  );
}
