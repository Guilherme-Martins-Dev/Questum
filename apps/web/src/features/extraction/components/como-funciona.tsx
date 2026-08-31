import { FileUp, Sparkles, ClipboardCheck } from "lucide-react";

const passos = [
  { icone: FileUp, titulo: "Envie os .docx", texto: "Uma ou várias provas de uma vez." },
  { icone: Sparkles, titulo: "A IA processa", texto: "Identifica questões, alternativas, imagens e fórmulas." },
  { icone: ClipboardCheck, titulo: "Revise e exporte", texto: "Ajuste o que precisar e gere o XML do Moodle." },
] as const;

/** Tira de 3 passos que orienta quem chega pela primeira vez na extração. */
export function ComoFunciona() {
  return (
    <ol className="mb-6 grid gap-3 sm:grid-cols-3">
      {passos.map((passo, i) => (
        <li
          key={passo.titulo}
          className="flex gap-3 rounded-lg border border-border bg-card/50 p-3"
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
            <passo.icone className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">
              <span className="text-muted-foreground">{i + 1}.</span> {passo.titulo}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{passo.texto}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
