import { useEffect, useMemo, useState } from "react";
import {
  useForm,
  useFieldArray,
  useWatch,
  type Control,
  type UseFormRegisterReturn,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editarQuestaoSchema, type EditarQuestaoInput, type ImagemQuestao } from "@questum/shared";
import { Eye, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useQuestion } from "../hooks/use-question";
import { useUpdateQuestion } from "../hooks/use-update-question";
import { RenderedContent } from "./rendered-content";
import type { LinhaQuestao } from "../types";

interface QuestionEditDialogProps {
  questao: LinhaQuestao | null;
  onClose: () => void;
  /** Nomes de unidade já usados na disciplina — sugeridos no campo (datalist). */
  unidades: string[];
}

const opcoesDificuldade = ["", "Fácil", "Média", "Difícil"] as const;

const TEM_ANEXO_RE = /__MOODLE_(?:IMAGE|FORMULA)_[A-F0-9]+__/;

/** Espera o valor parar de mudar por `ms` antes de propagá-lo. */
function useDebounced<T>(valor: T, ms: number): T {
  const [debounced, setDebounced] = useState(valor);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(valor), ms);
    return () => clearTimeout(timer);
  }, [valor, ms]);
  return debounced;
}

/**
 * Box de preview mostrado acima do textarea de um campo — só aparece
 * quando o texto tem marcador de imagem/fórmula. Deixa o professor ver a
 * imagem e a fórmula renderizadas enquanto edita o texto cru embaixo.
 */
function PreviewCampo({
  texto,
  questao,
  imagens,
  carregandoImagens,
}: {
  texto: string | null | undefined;
  questao: LinhaQuestao;
  imagens: ImagemQuestao[];
  carregandoImagens: boolean;
}) {
  if (!texto || !TEM_ANEXO_RE.test(texto)) return null;
  const temImagemNoTexto = /__MOODLE_IMAGE_[A-F0-9]+__/.test(texto);
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Eye className="h-3.5 w-3.5" />
        Prévia
      </p>
      {carregandoImagens && temImagemNoTexto ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando imagens…
        </p>
      ) : (
        <RenderedContent texto={texto} imagens={imagens} formulas={questao.formulas} />
      )}
    </div>
  );
}

/**
 * Label + prévia + textarea de um campo de texto longo. Assina só o próprio
 * campo (`useWatch`), então digitar aqui não re-renderiza o diálogo inteiro
 * — e a prévia (KaTeX) só recalcula 200ms depois que o professor para de
 * digitar.
 */
function CampoComPreview({
  control,
  name,
  label,
  rows,
  registro,
  erro,
  questao,
  imagens,
  carregandoImagens,
}: {
  control: Control<EditarQuestaoInput>;
  name: "enunciado" | "justificativa";
  label: string;
  rows: number;
  registro: UseFormRegisterReturn;
  erro?: string;
  questao: LinhaQuestao | null;
  imagens: ImagemQuestao[];
  carregandoImagens: boolean;
}) {
  const valor = useWatch({ control, name });
  const textoPreview = useDebounced(valor ?? "", 200);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      {questao && (
        <PreviewCampo
          texto={textoPreview}
          questao={questao}
          imagens={imagens}
          carregandoImagens={carregandoImagens}
        />
      )}
      <Textarea id={name} rows={rows} {...registro} />
      {erro && <p className="text-xs text-destructive">{erro}</p>}
    </div>
  );
}

export function QuestionEditDialog({ questao, onClose, unidades }: QuestionEditDialogProps) {
  const atualizar = useUpdateQuestion();
  // Detalhe (com o binário das imagens) — carregado à parte da lista.
  const detalhe = useQuestion(questao?.id ?? null);
  // Ref estável: sem isso, o `?? []` cria array novo a cada render e quebra
  // a memoização do RenderedContent.
  const imagensDetalhe = useMemo(() => detalhe.data?.imagens ?? [], [detalhe.data]);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<EditarQuestaoInput>({
    resolver: zodResolver(editarQuestaoSchema),
  });

  const { fields } = useFieldArray({ control, name: "alternativas" });
  const alternativasAtuais = useWatch({ control, name: "alternativas" });

  // Repopula o formulário toda vez que uma questão diferente é aberta
  // pra edição (o diálogo é o mesmo componente reaproveitado).
  useEffect(() => {
    if (questao) {
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

  const erroAlternativas = errors.alternativas?.root?.message ?? errors.alternativas?.message;
  const temAnexoNaQuestao =
    !!questao && (questao.imagens.length > 0 || questao.formulas.length > 0);

  return (
    <Dialog open={questao !== null} onOpenChange={(aberto) => !aberto && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar questão</DialogTitle>
          <DialogDescription>
            Ajuste o que a IA extraiu. As alterações valem para a exportação do XML.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Título, dificuldade e unidade ficam juntos no topo — são os
              metadados da questão, separados do conteúdo (enunciado etc.) */}
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título</Label>
            <Input id="titulo" {...register("titulo")} />
            {errors.titulo && <p className="text-xs text-destructive">{errors.titulo.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dificuldade">Dificuldade</Label>
              <Select id="dificuldade" {...register("dificuldade")}>
                {opcoesDificuldade.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {opcao || "Não informada"}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="unidade">Unidade</Label>
              <Input
                id="unidade"
                list="unidades-existentes"
                placeholder="Ex.: Unidade 3"
                {...register("unidade")}
              />
              {unidades.length > 0 && (
                <datalist id="unidades-existentes">
                  {unidades.map((nome) => (
                    <option key={nome} value={nome} />
                  ))}
                </datalist>
              )}
              {errors.unidade && (
                <p className="text-xs text-destructive">{errors.unidade.message}</p>
              )}
            </div>
          </div>

          <CampoComPreview
            control={control}
            name="enunciado"
            label="Enunciado"
            rows={5}
            registro={register("enunciado")}
            erro={errors.enunciado?.message}
            questao={questao}
            imagens={imagensDetalhe}
            carregandoImagens={detalhe.isLoading}
          />

          {/* Alternativas: só aparece pra questões Objetivas — Discursivas
              não têm campo "alternativas" no form (fica undefined). */}
          {fields.length > 0 && (
            <fieldset className="min-w-0 space-y-1.5">
              <legend className="mb-1.5 text-sm font-medium leading-none">Alternativas</legend>
              <div className="space-y-2">
                {fields.map((campo, indice) => {
                  const correta = alternativasAtuais?.[indice]?.correta ?? false;
                  return (
                    <div
                      key={campo.id}
                      className={cn(
                        "flex items-start gap-3 rounded-md border p-2 transition-colors",
                        correta ? "border-success/40 bg-success/5" : "border-border",
                      )}
                    >
                      <input
                        type="radio"
                        name="alternativa-correta"
                        className="mt-2.5 h-4 w-4 shrink-0 accent-primary"
                        checked={correta}
                        onChange={() => {
                          fields.forEach((_, i) =>
                            setValue(`alternativas.${i}.correta`, i === indice, { shouldValidate: true }),
                          );
                        }}
                        aria-label={`Marcar alternativa ${indice + 1} como correta`}
                      />
                      <Textarea
                        rows={2}
                        className="min-h-0 flex-1 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
                        {...register(`alternativas.${indice}.texto`)}
                      />
                    </div>
                  );
                })}
              </div>
              {erroAlternativas && <p className="text-xs text-destructive">{erroAlternativas}</p>}
              <p className="text-xs text-muted-foreground">
                Marque o círculo ao lado da alternativa correta. Não é possível adicionar ou remover
                alternativas por aqui.
              </p>
            </fieldset>
          )}

          <CampoComPreview
            control={control}
            name="justificativa"
            label="Justificativa"
            rows={4}
            registro={register("justificativa")}
            erro={errors.justificativa?.message}
            questao={questao}
            imagens={imagensDetalhe}
            carregandoImagens={detalhe.isLoading}
          />

          {temAnexoNaQuestao && (
            <p className="text-xs text-muted-foreground">
              Os marcadores <code className="rounded bg-muted px-1">__MOODLE_IMAGE_…__</code> e{" "}
              <code className="rounded bg-muted px-1">__MOODLE_FORMULA_…__</code> no texto indicam onde a
              imagem ou a fórmula entra — a prévia acima mostra o conteúdo real de cada uma. Não remova os
              marcadores: é por eles que o anexo é reencaixado na exportação.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={atualizar.isPending}>
              {atualizar.isPending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
