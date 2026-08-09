"""
Orquestrador do pipeline: .docx (um ou mais) -> extração via IA -> XML.

Uso:
    export GEMINI_API_KEY="sua_chave_aqui"
    python main.py "Nome da Disciplina" prova1.docx [prova2.docx ...] [--saida pasta] [--nome-arquivo banco.xml]

Cada arquivo é lido e extraído separadamente (a IA processa um de cada
vez), mas todas as questões de todos os arquivos são reunidas num único
XML final. A unidade de cada questão é determinada em duas etapas:
1. Se o PRÓPRIO DOCUMENTO tiver um cabeçalho "Unidade N"/"Bloco N", a
   extração via IA já preenche isso por questão — tem prioridade.
2. Se o documento não tiver essa informação (campo vazio), tenta-se
   extrair a unidade do NOME DO ARQUIVO (ex: "... - UNI 02.docx" vira
   "Unidade 2") como último recurso.
"""

import argparse
import re
import sys
from pathlib import Path

from extracao_ia_gemini import (
    IMAGENS_EXTRAIDAS,
    extrair_questoes_via_ia,
    extrair_texto_marcado,
)
from formatador import gerar_arquivo

_PADRAO_UNIDADE_NO_NOME = re.compile(r"\bUNI(?:DADE)?[\s_.\-]*0*([0-9]+)", re.IGNORECASE)


def extrair_unidade_do_nome_arquivo(caminho: Path) -> str:
    """
    Fallback: tenta achar "Unidade N" no NOME do arquivo, pra usar quando o
    conteúdo do .docx não traz essa informação. Reconhece variações como
    "UNI 02", "UNIDADE 02", "UNI02", "Unidade_4" (case-insensitive, zeros à
    esquerda ignorados). Devolve "" se não encontrar nada reconhecível.
    """
    encontrado = _PADRAO_UNIDADE_NO_NOME.search(caminho.stem)
    if not encontrado:
        return ""
    numero = int(encontrado.group(1))
    return f"Unidade {numero}"


def processar_arquivo(caminho: Path, disciplina: str) -> list[dict]:
    """Lê um .docx, extrai as questões via IA e devolve a lista de dicts."""
    print(f"  Lendo {caminho.name}...")
    texto_marcado = extrair_texto_marcado(str(caminho))

    print("  Extraindo questões via IA (Gemini)...")
    questoes = extrair_questoes_via_ia(texto_marcado, disciplina=disciplina)

    # Fallback de unidade: só entra em ação se a IA não achou nada no
    # conteúdo do documento (campo "unidade" vazio) para aquela questão.
    unidade_do_nome = extrair_unidade_do_nome_arquivo(caminho)
    if unidade_do_nome:
        for questao in questoes:
            if not questao.get("unidade"):
                questao["unidade"] = unidade_do_nome
                questao["tags"].append(unidade_do_nome)

    print(f"  {len(questoes)} questão(ões) extraída(s) de {caminho.name}.")
    return questoes


def main():
    parser = argparse.ArgumentParser(
        description="Extrai questões de um ou mais .docx via IA e gera um XML do Moodle."
    )
    parser.add_argument("disciplina", help='Nome da disciplina (tag aplicada a todas as questões, ex: "Banco de Dados")')
    parser.add_argument("arquivos", nargs="+", help="Um ou mais caminhos de arquivo .docx")
    parser.add_argument("--saida", default=".", help="Pasta de saída (padrão: pasta atual)")
    parser.add_argument("--nome-arquivo", default="banco_questoes.xml", help="Nome do arquivo XML gerado")
    args = parser.parse_args()

    caminhos = [Path(a) for a in args.arquivos]
    for caminho in caminhos:
        if not caminho.exists():
            print(f"Arquivo não encontrado: {caminho}")
            sys.exit(1)

    todas_questoes: list[dict] = []
    for i, caminho in enumerate(caminhos, start=1):
        print(f"[{i}/{len(caminhos)}] {caminho.name}")
        todas_questoes.extend(processar_arquivo(caminho, disciplina=args.disciplina))

    print(f"\n[INFO] {len(IMAGENS_EXTRAIDAS)} imagem(ns) encontrada(s) no total.")
    print(f"[INFO] {len(todas_questoes)} questão(ões) no total, de {len(caminhos)} arquivo(s).")

    print("Gerando arquivo XML...")
    gerar_arquivo(
        todas_questoes,
        IMAGENS_EXTRAIDAS,
        pasta_saida=args.saida,
        disciplina=args.disciplina,
        nome_arquivo=args.nome_arquivo,
    )


if __name__ == "__main__":
    main()