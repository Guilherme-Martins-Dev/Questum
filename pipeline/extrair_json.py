"""
Extração pura (.docx -> JSON), sem geração de XML.

Pensado para ser chamado via child_process pelo backend Node (Fastify):
NADA além do JSON final vai para stdout — todo log de progresso vai para
stderr. Isso é o que garante que o Node consiga fazer JSON.parse(stdout)
sem se preocupar em filtrar mensagens misturadas no meio.

Quem gera o XML final não é mais este pipeline: é o backend Node, a partir
dos dados já persistidos (e possivelmente editados pelo usuário) no
Postgres. Este script entrega só a extração bruta.

Uso:
    export GEMINI_API_KEY="sua_chave_aqui"
    python extrair_json.py "Nome da Disciplina" prova1.docx [prova2.docx ...]

Saída em stdout (um único JSON, uma linha):
    {
      "questoes": [ {...}, {...} ],
      "imagens": { "img_xxx.png": {"nome": ..., "base64": ..., ...}, ... }
    }
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# No Windows, stdout/stderr por padrão usam a codificação do console
# (cp1252), que não sabe representar vários caracteres comuns em provas
# (≈, ≤, √, etc.) — isso quebra o print() do JSON final com
# UnicodeEncodeError. Reconfigurar para UTF-8 aqui resolve isso
# independente de como o script for chamado (direto no terminal ou via
# child_process do Node).
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from extracao_ia_gemini import FORMULAS_EXTRAIDAS, IMAGENS_EXTRAIDAS, processar_arquivo


def log(mensagem: str) -> None:
    """Log de progresso — SEMPRE em stderr, nunca em stdout."""
    print(mensagem, file=sys.stderr, flush=True)


def main() -> None:
    if len(sys.argv) < 3:
        log('Uso: python extrair_json.py "Nome da Disciplina" prova1.docx [prova2.docx ...]')
        sys.exit(1)

    disciplina = sys.argv[1]
    caminhos = [Path(a) for a in sys.argv[2:]]

    for caminho in caminhos:
        if not caminho.exists():
            log(f"Arquivo não encontrado: {caminho}")
            sys.exit(1)

    try:
        todas_questoes: list[dict] = []
        for i, caminho in enumerate(caminhos, start=1):
            log(f"[{i}/{len(caminhos)}] {caminho.name}")
            questoes_do_arquivo = processar_arquivo(caminho, disciplina, log=log)
            # Sem isso, o Node não tem como saber de qual arquivo cada
            # questão veio quando a extração cobre mais de um .docx de
            # uma vez — e sem essa informação, a rota de persistência
            # acaba associando as questões ao arquivo errado.
            for questao in questoes_do_arquivo:
                questao["arquivo_origem"] = caminho.name
            todas_questoes.extend(questoes_do_arquivo)

        log(f"[INFO] {len(IMAGENS_EXTRAIDAS)} imagem(ns) encontrada(s) no total.")
        log(f"[INFO] {len(FORMULAS_EXTRAIDAS)} fórmula(s) encontrada(s) no total.")
        log(f"[INFO] {len(todas_questoes)} questão(ões) no total, de {len(caminhos)} arquivo(s).")
    except Exception as erro:
        # Erro limpo em stderr (código de saída != 0), em vez de um
        # traceback bruto — o Node só precisa checar o exit code e ler
        # essa mensagem, sem parsear stack trace de Python.
        log(f"[ERRO] Falha na extração: {erro}")
        sys.exit(1)

    # ÚNICA linha impressa em stdout: o JSON que o Node vai consumir.
    print(
        json.dumps(
            {"questoes": todas_questoes, "imagens": IMAGENS_EXTRAIDAS, "formulas": FORMULAS_EXTRAIDAS},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
