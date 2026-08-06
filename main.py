"""
Orquestrador do pipeline: .docx -> extração via IA -> GIFT/XML.

Uso:
    export GEMINI_API_KEY="sua_chave_aqui"
    python main.py caminho/para/prova.docx [pasta_de_saida]
"""

import sys
from pathlib import Path

from extracao_ia_gemini import (
    IMAGENS_EXTRAIDAS,
    definir_formato_arquivo,
    extrair_questoes_via_ia,
    extrair_texto_marcado,
)
from formatador import gerar_arquivo


def main():
    if len(sys.argv) < 2:
        print("Uso: python main.py caminho/para/prova.docx [pasta_de_saida]")
        sys.exit(1)

    caminho = Path(sys.argv[1])
    pasta_saida = sys.argv[2] if len(sys.argv) > 2 else "."

    if not caminho.exists():
        print(f"Arquivo não encontrado: {caminho}")
        sys.exit(1)

    print(f"[1/3] Lendo {caminho.name}...")
    texto_marcado = extrair_texto_marcado(str(caminho))
    print(f"      {len(IMAGENS_EXTRAIDAS)} imagem(ns) encontrada(s).")

    print("[2/3] Extraindo questões via IA (Gemini)...")
    questoes = extrair_questoes_via_ia(texto_marcado)
    formato = definir_formato_arquivo(questoes)
    print(f"      {len(questoes)} questão(ões) extraída(s). Formato do arquivo: {formato.upper()}.")

    print("[3/3] Gerando arquivo...")
    gerar_arquivo(questoes, IMAGENS_EXTRAIDAS, formato=formato, pasta_saida=pasta_saida)


if __name__ == "__main__":
    main()