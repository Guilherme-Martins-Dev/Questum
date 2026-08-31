import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResultadoExtracao } from "@questum/shared";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// PIPELINE_DIR (se setado) é resolvido contra o cwd, como antes; sem ele,
// cai num caminho relativo a ESTE arquivo — robusto a de onde o processo
// foi lançado. `src/services` e `dist/services` ficam na mesma profundidade,
// então o mesmo `../../../../pipeline` serve pros dois.
const PIPELINE_DIR = process.env.PIPELINE_DIR
  ? path.resolve(process.env.PIPELINE_DIR)
  : path.resolve(AQUI, "../../../../pipeline");

// `python3` não existe no Windows por padrão — usa `python` lá.
const PYTHON_BIN =
  process.env.PYTHON_BIN ?? (process.platform === "win32" ? "python" : "python3");

const SCRIPT_PATH = path.resolve(PIPELINE_DIR, "extrair_json.py");

// Mata o pipeline se passar disso — evita job preso em "processando" pra
// sempre quando o Gemini pendura ou o script entra em deadlock.
const TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS ?? 10 * 60 * 1000);

// Teto de saída do pipeline. O JSON inclui as imagens em base64, então
// precisa ser generoso — mas não infinito, senão um pipeline defeituoso
// derruba a API por OOM.
const MAX_STDOUT_BYTES = Number(process.env.PIPELINE_MAX_OUTPUT_BYTES ?? 200 * 1024 * 1024);

interface LoggerLike {
  info: (msg: string) => void;
  warn?: (msg: string) => void;
  error: (obj: unknown, msg?: string) => void;
}

/**
 * Checagem de sanidade no boot: o Python roda? O script existe? Só loga —
 * não derruba a API (o operador pode querer subir mesmo sem o pipeline
 * pronto), mas deixa o motivo claro ANTES da primeira extração falhar.
 */
export function verificarAmbientePipeline(log: LoggerLike): void {
  if (!fs.existsSync(SCRIPT_PATH)) {
    log.warn?.(
      `Pipeline não encontrado em ${SCRIPT_PATH}. Ajuste PIPELINE_DIR no .env — extrações vão falhar até isso ser resolvido.`,
    );
  }

  try {
    const versao = spawnSync(PYTHON_BIN, ["--version"], { encoding: "utf-8", timeout: 10_000 });
    if (versao.error || versao.status !== 0) {
      log.warn?.(
        `Não consegui executar "${PYTHON_BIN} --version". Ajuste PYTHON_BIN no .env — extrações vão falhar até isso ser resolvido.`,
      );
    } else {
      log.info(`Pipeline: ${PYTHON_BIN} ${(versao.stdout || versao.stderr).trim()} — ${SCRIPT_PATH}`);
    }
  } catch (erro) {
    log.warn?.(`Falha ao verificar o Python (${PYTHON_BIN}): ${(erro as Error).message}`);
  }
}

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
  return new Promise((resolve, reject) => {
    const processo = spawn(PYTHON_BIN, [SCRIPT_PATH, disciplina, ...caminhosArquivos], {
      env: {
        ...process.env,
        // Sem isso, o Windows usa a codificação do console (cp1252) pra
        // stdout/stderr do processo filho, que não sabe representar
        // caracteres como "≈" — o Python quebra com UnicodeEncodeError na
        // hora de imprimir o JSON. Forçar UTF-8 aqui resolve isso e
        // também os "�" que apareciam nos logs de progresso.
        PYTHONIOENCODING: "utf-8",
      },
    });

    let stdout = "";
    let stdoutBytes = 0;
    let stderr = "";
    let finalizado = false;

    const encerrar = (fn: () => void) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timer);
      fn();
    };

    const timer = setTimeout(() => {
      processo.kill("SIGKILL");
      encerrar(() =>
        reject(new Error(`Pipeline Python excedeu o tempo limite (${Math.round(TIMEOUT_MS / 1000)}s) e foi encerrado.`)),
      );
    }, TIMEOUT_MS);

    processo.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        processo.kill("SIGKILL");
        encerrar(() =>
          reject(
            new Error(
              `Saída do pipeline passou de ${Math.round(MAX_STDOUT_BYTES / 1024 / 1024)}MB — extração abortada (imagens grandes demais?).`,
            ),
          ),
        );
        return;
      }
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
      encerrar(() =>
        reject(new Error(`Não foi possível iniciar o pipeline Python: ${erro.message}`)),
      );
    });

    processo.on("close", (codigo) => {
      encerrar(() => {
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
  });
}
