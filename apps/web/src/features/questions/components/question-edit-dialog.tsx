import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<EditarQuestaoInput>({
    resolver: zodResolver(editarQuestaoSchema),
  });

  const { fields } = useFieldArray({ control, name: "alternativas" });
  const alternativasAtuais = watch("alternativas");

  // O formulário guarda "unidade" como string completa ("Unidade 3"),
  // porque é isso que o backend espera — mas a interface só expõe o
  // número pro usuário editar, com "Unidade" fixo do lado. Esse estado
  // local guarda só o número exibido; a cada mudança, recompõe a string
  // completa e escreve no campo real do formulário.
  const [numeroUnidade, setNumeroUnidade] = useState("");

  function alterarNumeroUnidade(valor: string) {
    setNumeroUnidade(valor);
    setValue("unidade", valor.trim() ? `Unidade ${valor.trim()}` : "");
  }

  // Repopula o formulário toda vez que uma questão diferente é aberta
  // pra edição (o diálogo é o mesmo componente reaproveitado).
  useEffect(() => {
    if (questao) {
      const numeroAtual = questao.unidadeNome?.match(/(\d+)/)?.[1] ?? "";
      setNumeroUnidade(numeroAtual);
      reset({
        titulo: questao.titulo,
        dificuldade: (questao.dificuldade ?? "") as EditarQuestaoInput["dificuldade"],
        unidade: questao.unidadeNome ?? "",
        enunciado: questao.enunciado,
        justificativa: questao.justificativa ?? "",
        alternativas:
          questao.tipo === "Objetiva"
            ? questao.alternativas.map((a) => ({ id: a.id, texto: a.texto, correta: a.correta }))
            : undefined,
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
  const erroAlternativas = errors.alternativas?.root?.message ?? errors.alternativas?.message;

  return (
    <Dialog open={questao !== null} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar questão</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Título, dificuldade e unidade ficam juntos no topo — são os
              metadados da questão, separados do conteúdo (enunciado etc.) */}
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título</Label>
            <Input id="titulo" {...register("titulo")} />
            {errors.titulo && <p className="text-xs text-red-600">{errors.titulo.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
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
              <Label htmlFor="unidade-numero">Unidade</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-500">Unidade</span>
                <Input
                  id="unidade-numero"
                  type="number"
                  min={1}
                  placeholder="N"
                  className="w-20"
                  value={numeroUnidade}
                  onChange={(evento) => alterarNumeroUnidade(evento.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="enunciado">Enunciado</Label>
            <GaleriaImagens imagens={imagensEnunciado} />
            <Textarea id="enunciado" rows={5} {...register("enunciado")} />
            {errors.enunciado && <p className="text-xs text-red-600">{errors.enunciado.message}</p>}
          </div>

          {/* Alternativas: só aparece pra questões Objetivas — Discursivas
              não têm campo "alternativas" no form (fica undefined). */}
          {fields.length > 0 && (
            <div className="space-y-1.5">
              <Label>Alternativas</Label>
              <div className="space-y-2">
                {fields.map((campo, indice) => (
                  <div key={campo.id} className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="alternativa-correta"
                      className="mt-2.5"
                      checked={alternativasAtuais?.[indice]?.correta ?? false}
                      onChange={() => {
                        fields.forEach((_, i) =>
                          setValue(`alternativas.${i}.correta`, i === indice, { shouldValidate: true }),
                        );
                      }}
                      aria-label={`Marcar alternativa ${indice + 1} como correta`}
                    />
                    <Textarea rows={2} className="flex-1" {...register(`alternativas.${indice}.texto`)} />
                  </div>
                ))}
              </div>
              {erroAlternativas && <p className="text-xs text-red-600">{erroAlternativas}</p>}
              <p className="text-xs text-neutral-400">
                Marque o círculo ao lado da alternativa correta. Não é possível adicionar ou remover
                alternativas por aqui.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="justificativa">Justificativa</Label>
            <GaleriaImagens imagens={imagensJustificativa} />
            <Textarea id="justificativa" rows={4} {...register("justificativa")} />
          </div>

          {(imagensEnunciado.length > 0 || imagensJustificativa.length > 0) && (
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
