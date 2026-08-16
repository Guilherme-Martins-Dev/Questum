import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editarQuestaoSchema, type EditarQuestaoInput, type ImagemQuestao } from "@questum/shared";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateQuestion } from "../hooks/use-update-question";
import type { LinhaQuestao } from "../types";

interface QuestionEditDialogProps {
  questao: LinhaQuestao | null;
  onClose: () => void;
}

const opcoesDificuldade = ["", "Fácil", "Média", "Difícil"] as const;

/** Filtra só as imagens cujo marcador aparece de fato nesse campo específico. */
function imagensDoCampo(imagens: ImagemQuestao[], textoDoCampo: string | null | undefined): ImagemQuestao[] {
  if (!textoDoCampo) return [];
  return imagens.filter((imagem) => textoDoCampo.includes(imagem.marcador));
}

function GaleriaImagens({ imagens }: { imagens: ImagemQuestao[] }) {
  if (imagens.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
      {imagens.map((imagem) => (
        <figure key={imagem.id} className="max-w-[160px]">
          <img
            src={`data:${imagem.contentType};base64,${imagem.dadosBase64}`}
            alt={imagem.nome}
            className="max-h-32 rounded border border-neutral-200 object-contain"
          />
          <figcaption className="mt-1 truncate text-[11px] text-neutral-400">{imagem.marcador}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function QuestionEditDialog({ questao, onClose }: QuestionEditDialogProps) {
  const atualizar = useUpdateQuestion();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditarQuestaoInput>({
    resolver: zodResolver(editarQuestaoSchema),
  });

  useEffect(() => {
    if (questao) {
      reset({
        titulo: questao.titulo,
        enunciado: questao.enunciado,
        dificuldade: (questao.dificuldade ?? "") as EditarQuestaoInput["dificuldade"],
        justificativa: questao.justificativa ?? "",
      });
    }
  }, [questao, reset]);

  function onSubmit(dados: EditarQuestaoInput) {
    if (!questao) return;
    atualizar.mutate(
      { id: questao.id, dados },
      {
        onSuccess: () => onClose(),
      },
    );
  }

  const imagensEnunciado = questao ? imagensDoCampo(questao.imagens, questao.enunciado) : [];
  const imagensJustificativa = questao ? imagensDoCampo(questao.imagens, questao.justificativa) : [];
  const temAlgumaImagem = imagensEnunciado.length > 0 || imagensJustificativa.length > 0;

  return (
    <Dialog open={questao !== null} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar questão</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título</Label>
            <Input id="titulo" {...register("titulo")} />
            {errors.titulo && <p className="text-xs text-red-600">{errors.titulo.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="enunciado">Enunciado</Label>
            <GaleriaImagens imagens={imagensEnunciado} />
            <Textarea id="enunciado" rows={6} {...register("enunciado")} />
            {errors.enunciado && <p className="text-xs text-red-600">{errors.enunciado.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dificuldade">Dificuldade</Label>
            <select
              id="dificuldade"
              {...register("dificuldade")}
              className="h-9 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm"
            >
              {opcoesDificuldade.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao || "Não informada"}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="justificativa">Justificativa</Label>
            <GaleriaImagens imagens={imagensJustificativa} />
            <Textarea id="justificativa" rows={4} {...register("justificativa")} />
          </div>

          {temAlgumaImagem && (
            <p className="text-xs text-neutral-400">
              Não remova os marcadores <code>__MOODLE_IMAGE_...__</code> dos campos acima — é assim que a imagem
              é reencaixada na exportação final.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={atualizar.isPending}>
              {atualizar.isPending ? "Salvando..." : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
