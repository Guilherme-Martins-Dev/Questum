"""
Extração de questões via IA (Gemini) — protótipo isolado para teste.

Este módulo é INDEPENDENTE do seu script principal (questões.py): dá pra
rodar sozinho para validar a qualidade da extração antes de integrar ao
pipeline completo (GIFT/XML).

Requer:
    pip install google-genai python-docx

Uso:
    export GEMINI_API_KEY="sua_chave_aqui"    # ou $env:GEMINI_API_KEY="..." no PowerShell
    python extracao_ia_gemini.py caminho/para/prova.docx

A chave é gratuita em: https://aistudio.google.com/apikey
Modelo padrão: gemini-3.5-flash-lite (GA, com tier gratuito, ideal para
extração/estruturação de texto de alto volume).
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_COLOR_INDEX
from docx.oxml.ns import qn

from google import genai
from google.genai import types

# Registro preenchido durante a leitura do .docx: nome único -> dados da
# imagem. Mesma ideia do IMAGENS_EXTRAIDAS do seu script original — guarde
# essa variável se quiser usar os bytes das imagens depois, na hora de
# montar o GIFT/XML de verdade (substituindo os marcadores por <img>).
IMAGENS_EXTRAIDAS: dict[str, dict] = {}


# =========================
# DETECÇÃO DE FORMATAÇÃO
# (mesma lógica do seu run_vermelho/run_amarelo/run_negrito original —
#  reaproveite as suas se preferir importar do questões.py)
# =========================
def run_vermelho(run) -> bool:
    color = getattr(getattr(run.font, "color", None), "rgb", None)
    if color is None:
        return False
    cor = str(color).upper()
    return cor == "FF0000" or "FF0000" in cor


def run_amarelo(run) -> bool:
    highlight = getattr(run.font, "highlight_color", None)
    return highlight == WD_COLOR_INDEX.YELLOW


def run_negrito(run) -> bool:
    return bool(run.bold)


def _extensao_por_mime(content_type: str, nome_original: str = "") -> str:
    mapa = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/bmp": ".bmp",
    }
    if content_type in mapa:
        return mapa[content_type]
    sufixo = Path(nome_original).suffix.lower()
    return sufixo if sufixo else ".bin"


def extrair_imagens_do_paragrafo(paragrafo, doc) -> list[str]:
    """
    Localiza imagens ancoradas no parágrafo (DrawingML e VML legado),
    registra os bytes em IMAGENS_EXTRAIDAS e devolve a lista de
    marcadores de texto (__MOODLE_IMAGE_<hash>__) na ordem em que aparecem.
    Mesma técnica do seu extrair_imagens_do_paragrafo original.
    """
    marcadores = []
    rel_ids = []

    for blip in paragrafo._p.xpath('.//*[local-name()="blip"]'):
        rid = blip.get(qn("r:embed"))
        if rid:
            rel_ids.append(rid)

    for image_data in paragrafo._p.xpath('.//*[local-name()="imagedata"]'):
        rid = image_data.get(qn("r:id"))
        if rid:
            rel_ids.append(rid)

    for rid in rel_ids:
        parte = doc.part.related_parts.get(rid)
        if parte is None or not hasattr(parte, "blob"):
            continue

        dados = parte.blob
        content_type = getattr(parte, "content_type", "application/octet-stream")
        nome_original = Path(str(getattr(parte, "partname", "imagem"))).name
        extensao = _extensao_por_mime(content_type, nome_original)
        digest = hashlib.sha256(dados).hexdigest()[:16]
        nome = f"img_{digest}{extensao}"
        marcador = f"__MOODLE_IMAGE_{digest.upper()}__"

        if nome not in IMAGENS_EXTRAIDAS:
            IMAGENS_EXTRAIDAS[nome] = {
                "nome": nome,
                "marcador": marcador,
                "content_type": content_type,
                "base64": base64.b64encode(dados).decode("ascii"),
            }

        marcadores.append(marcador)

    return marcadores


# =========================
# 1) DOCX -> TEXTO MARCADO
# =========================
def extrair_texto_marcado(docx_path: str) -> str:
    """
    Lê o .docx e devolve um texto único, com marcadores inline indicando
    formatação: [VERMELHO], [MARCADO] (destaque amarelo) e [NEGRITO].

    Esse texto marcado é o que vai para a IA — ele preserva os mesmos
    sinais visuais que suas heurísticas originais usam para achar a
    alternativa correta, só que em forma de texto que o modelo consegue ler.
    """
    doc = Document(docx_path)
    linhas = []

    for paragrafo in doc.paragraphs:
        texto = paragrafo.text.strip()
        marcadores_imagem = extrair_imagens_do_paragrafo(paragrafo, doc)

        if not texto and not marcadores_imagem:
            continue

        if texto:
            partes = []
            for run in paragrafo.runs:
                trecho = run.text
                if not trecho.strip():
                    partes.append(trecho)
                    continue

                abre, fecha = "", ""
                if run_vermelho(run):
                    abre, fecha = abre + "[VERMELHO]", "[/VERMELHO]" + fecha
                if run_amarelo(run):
                    abre, fecha = abre + "[MARCADO]", "[/MARCADO]" + fecha
                if run_negrito(run):
                    abre, fecha = abre + "[NEGRITO]", "[/NEGRITO]" + fecha

                partes.append(f"{abre}{trecho}{fecha}")

            linhas.append("".join(partes).strip() or texto)

        # Marcador entra em linha própria, logo após o texto do parágrafo —
        # é assim que o script original também posiciona a imagem.
        for marcador in marcadores_imagem:
            linhas.append(marcador)

    return "\n".join(linhas)


# =========================
# 2) PROMPT + SCHEMA DE SAÍDA
# =========================
INSTRUCAO_SISTEMA = """
Você recebe o texto extraído de uma prova em Word. O texto pode conter
marcadores de formatação original: [VERMELHO]...[/VERMELHO],
[MARCADO]...[/MARCADO] (destaque amarelo) e [NEGRITO]...[/NEGRITO]. Esses
marcadores costumam indicar a alternativa correta — mas nem sempre. Use
também o contexto (ex: um gabarito escrito ao final do texto, tipo
"Resposta: C" ou "Alternativa correta: B").

O texto também pode conter marcadores de imagem no formato exato
__MOODLE_IMAGE_<código>__ (ex: __MOODLE_IMAGE_A1B2C3D4E5F6A7B8__). Cada um
representa uma imagem que estava naquela posição do documento original.
Regras para esses marcadores:
- Copie o marcador EXATAMENTE como aparece (mesmos caracteres, mesmo
  código), sem alterar, sem inventar, sem descrever a imagem.
- Preserve a posição relativa dele: se a imagem aparecia dentro do
  enunciado, o marcador vai no campo "enunciado"; se aparecia dentro de
  uma alternativa, vai no texto dessa alternativa; se aparecia depois do
  comentário, vai em "justificativa".
- Nunca remova um marcador de imagem nem o mova para um campo diferente
  de onde ele estava no texto original.

Sua tarefa: identificar cada questão do texto e devolver uma lista
estruturada. IMPORTANTE sobre a identificação: este texto vem de provas
feitas por professores/conteudistas diferentes, e cada um formata do seu
jeito — não existe um padrão único. Você pode encontrar, por exemplo:
numeração "1.", "01)", "Questão 1", "QUESTÃO 01", títulos em negrito,
enunciados sem nenhuma numeração (só separados por parágrafo em branco),
alternativas com "a)", "A)", "I.", "-", ou letras entre parênteses, gabarito
disperso ao final do documento em vez de logo após a questão, blocos com ou
sem justificativa. Não assuma um formato fixo: use o SENTIDO do texto (uma
pergunta seguida de um conjunto de opções de resposta = uma questão) para
decidir onde uma questão termina e a próxima começa, mesmo que a
numeração/formatação mude no meio do mesmo documento.

Para cada questão, extraia:

- "titulo": título curto (use "Questão N" se não houver título explícito)
- "tipo": "Objetiva" (múltipla escolha) ou "Discursiva" (sem alternativas)
- "enunciado": o texto da pergunta, SEM marcadores de formatação e SEM as alternativas
- "correta": texto da alternativa correta, sem marcadores (vazio se Discursiva)
- "incorretas": lista com o texto das demais alternativas, sem marcadores (vazio se Discursiva)
- "justificativa": comentário/justificativa da resposta, se existir no texto (senão string vazia)

Regras importantes:
- Remova os marcadores [VERMELHO], [MARCADO], [NEGRITO] do resultado final — são só pistas, não devem aparecer no texto extraído.
- Não invente conteúdo que não está no texto original.
- Se não conseguir identificar com confiança qual alternativa é a correta, deixe "correta" vazio e devolva todas em "incorretas".
- Seja consistente: para o mesmo texto de entrada, sua extração deve ser sempre a mesma (não varie redação nem estrutura entre execuções).
""".strip()

SCHEMA_RESPOSTA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "titulo": {"type": "STRING"},
            "tipo": {"type": "STRING", "enum": ["Objetiva", "Discursiva"]},
            "enunciado": {"type": "STRING"},
            "correta": {"type": "STRING"},
            "incorretas": {"type": "ARRAY", "items": {"type": "STRING"}},
            "justificativa": {"type": "STRING"},
        },
        "required": ["titulo", "tipo", "enunciado", "correta", "incorretas", "justificativa"],
    },
}


# =========================
# 3) CHAMADA À API (Gemini)
# =========================
def extrair_questoes_via_ia(
    texto_marcado: str,
    disciplina: str,
    modelo: str = "gemini-3.5-flash-lite",
) -> list[dict]:
    """
    Envia o texto marcado para o Gemini e devolve uma lista de dicts no
    MESMO formato que seus parse_questao_*() já produzem hoje, para poder
    plugar direto em montar_gift() / gerar_moodle_xml() depois.

    'disciplina' vem de fora (você informa), não é adivinhada pela IA: o
    nome da disciplina raramente está escrito de forma confiável dentro do
    texto da prova, então é mais seguro receber como parâmetro do que
    arriscar a IA inventar ou errar.

    Nota: a partir do Gemini 3.x, os parâmetros temperature/top_p/top_k
    foram descontinuados (a API os ignora) — por isso não aparecem aqui.
    O controle de consistência agora vem da instrução de sistema.
    thinking_level="minimal" é o padrão do Flash-Lite e já é o ideal para
    uma tarefa de extração/estruturação como essa (mais rápido e barato).
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("Defina a variável de ambiente GEMINI_API_KEY antes de rodar.")

    client = genai.Client(api_key=api_key)

    resposta = client.models.generate_content(
        model=modelo,
        contents=texto_marcado,
        config=types.GenerateContentConfig(
            system_instruction=INSTRUCAO_SISTEMA,
            response_mime_type="application/json",
            response_schema=SCHEMA_RESPOSTA,
            thinking_config=types.ThinkingConfig(thinking_level="minimal"),
        ),
    )

    if not resposta.text:
        raise RuntimeError("O Gemini não retornou conteúdo.")

    questoes = json.loads(resposta.text)

    for q in questoes:
        q["modo"] = "extraido_via_ia"
        q["qtd_alternativas"] = (1 + len(q.get("incorretas", []))) if q["tipo"] == "Objetiva" else 0
        # Tags: tipo já veio da IA (Objetiva/Discursiva); disciplina vem do
        # parâmetro. Calculadas aqui, não pela IA, pelo mesmo motivo de
        # sempre: são fatos que já temos com certeza, não algo a "adivinhar".
        q["tags"] = [disciplina, q["tipo"]]

    return questoes


def definir_formato_arquivo(questoes: list[dict]) -> str:
    """
    Decide o formato do ARQUIVO INTEIRO (não por questão individual).

    Regra: se QUALQUER questão do lote tiver sobrado algum marcador
    __MOODLE_IMAGE_...__ em algum campo de texto, o arquivo inteiro sai em
    XML (que sabe embutir imagem em base64). Só se NENHUMA questão tiver
    imagem, o arquivo inteiro sai em GIFT (texto puro).

    Calculado aqui no código (não pela IA) pelo mesmo motivo de antes: é
    uma checagem de string determinística sobre marcadores que nós mesmos
    geramos, então não depende de julgamento do modelo.
    """
    for questao in questoes:
        campos = [
            questao.get("enunciado", ""),
            questao.get("correta", ""),
            " ".join(questao.get("incorretas", [])),
            questao.get("justificativa", ""),
        ]
        if "__MOODLE_IMAGE_" in " ".join(campos):
            return "xml"
    return "gift"


# =========================
# EXECUÇÃO DIRETA (TESTE MANUAL)
# =========================
def main():
    if len(sys.argv) < 3:
        print("Uso: python extracao_ia_gemini.py caminho/para/prova.docx \"Nome da Disciplina\"")
        sys.exit(1)

    caminho = Path(sys.argv[1])
    disciplina = sys.argv[2]
    if not caminho.exists():
        print(f"Arquivo não encontrado: {caminho}")
        sys.exit(1)

    print(f"[INFO] Lendo {caminho.name}...")
    texto_marcado = extrair_texto_marcado(str(caminho))
    print(f"[INFO] {len(IMAGENS_EXTRAIDAS)} imagem(ns) encontrada(s) no documento.")

    print("[INFO] Enviando para a IA (Gemini)...")
    questoes = extrair_questoes_via_ia(texto_marcado, disciplina=disciplina)

    print(f"\n[OK] {len(questoes)} questão(ões) extraída(s):\n")
    print(json.dumps(questoes, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()