import { spawn } from "node:child_process";
import path from "node:path";
import type { ResultadoExtracao } from "@questum/shared";

const PIPELINE_DIR = process.env.PIPELINE_DIR ?? "../../pipeline";
const PYTHON_BIN = process.env.PYTHON_BIN ?? "python3";

/**
 * Aciona o pipeline Python (extrair_json.py) via child_process e devolve
 * as questões + imagens extraídas. NÃO gera XML — isso é responsabilidade
 * do xml-export.service.ts, a partir dos dados já persistidos/editados.
 *
 * Contrato com o Python: stdout deve conter EXCLUSIVAMENTE uma linha de
 * JSON (ver extrair_json.py); qualquer log de progresso vai para stderr.
 */
export async function executarExtracao(
  disciplina: string,
  caminhosArquivos: string[],
): Promise<ResultadoExtracao> {
  const scriptPath = path.resolve(PIPELINE_DIR, "extrair_json.py");

  return new Promise((resolve, reject) => {
    const processo = spawn(PYTHON_BIN, [scriptPath, disciplina, ...caminhosArquivos], {
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    processo.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });

    processo.stderr.on("data", (chunk: Buffer) => {
      const linha = chunk.toString("utf-8");
      stderr += linha;
      // Log de progresso do pipeline — útil pra acompanhar no terminal da
      // API enquanto a extração roda (pode levar alguns segundos por
      // arquivo, já que cada um é uma chamada à API do Gemini).
      console.log(`[pipeline] ${linha.trim()}`);
    });

    processo.on("error", (erro) => {
      reject(new Error(`Não foi possível iniciar o pipeline Python: ${erro.message}`));
    });

    processo.on("close", (codigo) => {
      if (codigo !== 0) {
        reject(new Error(`Pipeline Python falhou (exit ${codigo}): ${stderr.trim()}`));
        return;
      }
      try {
        const resultado = JSON.parse(stdout) as ResultadoExtracao;
        resolve(resultado);
      } catch (erroParse) {
        reject(
          new Error(
            `Saída do pipeline não é um JSON válido: ${(erroParse as Error).message}\nstdout bruto: ${stdout.slice(0, 500)}`,
          ),
        );
      }
    });
  });
}
