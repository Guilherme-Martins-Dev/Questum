import { useState } from "react";
import { toast } from "sonner";

/**
 * Baixa o XML do Moodle via fetch + blob, em vez de navegar o browser pra
 * URL da API. Assim um 404/500 vira um toast — e não uma página de JSON
 * cru que joga o professor pra fora do app.
 */
function nomeArquivoDoHeader(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      // formato inesperado — tenta o filename simples abaixo
    }
  }
  const simples = header.match(/filename="?([^"]+?)"?(?:;|$)/i);
  return simples ? simples[1] : fallback;
}

/** Mostra os avisos não-fatais que o backend anexou no header do download. */
function avisarSobreProblemas(header: string | null): void {
  if (!header) return;
  try {
    const avisos = JSON.parse(decodeURIComponent(header)) as string[];
    if (!Array.isArray(avisos) || avisos.length === 0) return;
    const amostra = avisos.slice(0, 5).join("\n");
    const resto = avisos.length > 5 ? `\n…e mais ${avisos.length - 5}.` : "";
    toast.warning(`XML gerado com ${avisos.length} aviso(s)`, {
      description: amostra + resto,
      duration: 10_000,
    });
  } catch {
    // header malformado — ignora
  }
}

export function useExportXml() {
  const [gerando, setGerando] = useState(false);

  async function exportar(disciplinaId: string) {
    if (!disciplinaId || gerando) return;
    setGerando(true);
    try {
      const resposta = await fetch(`/api/disciplinas/${disciplinaId}/export`);
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}));
        throw new Error(corpo.erro ?? "Não foi possível gerar o XML. Tente novamente.");
      }

      const blob = await resposta.blob();
      const nomeArquivo = nomeArquivoDoHeader(
        resposta.headers.get("Content-Disposition"),
        "questoes.xml",
      );

      avisarSobreProblemas(resposta.headers.get("X-Export-Avisos"));

      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = nomeArquivo;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch (erro) {
      toast.error((erro as Error).message);
    } finally {
      setGerando(false);
    }
  }

  return { exportar, gerando };
}
