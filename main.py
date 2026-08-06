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
    extrair_questoes_via_ia,
    extrair_texto_marcado,
)
from formatador import gerar_arquivos


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
    com_imagem = sum(1 for q in questoes if q["formato"] == "xml")
    sem_imagem = len(questoes) - com_imagem
    print(f"      {len(questoes)} questão(ões): {sem_imagem} -> GIFT, {com_imagem} -> XML.")

    print("[3/3] Gerando arquivos...")
    gerar_arquivos(questoes, IMAGENS_EXTRAIDAS, pasta_saida=pasta_saida)


if __name__ == "__main__":
    main()