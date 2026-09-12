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

import re

import base64
import hashlib
import json
import os
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_COLOR_INDEX
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from google import genai
from google.genai import errors, types
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

# Registro preenchido durante a leitura do .docx: nome único -> dados da
# imagem. Mesma ideia do IMAGENS_EXTRAIDAS do seu script original — guarde
# essa variável se quiser usar os bytes das imagens depois, na hora de
# montar o GIFT/XML de verdade (substituindo os marcadores por <img>).
IMAGENS_EXTRAIDAS: dict[str, dict] = {}

# Registro preenchido durante a leitura do .docx: nome único -> {marcador,
# latex}. Mesmo princípio de IMAGENS_EXTRAIDAS, só que pra fórmulas
# (equações inseridas via Word > Inserir > Equação, formato OMML).
FORMULAS_EXTRAIDAS: dict[str, dict] = {}

_NS_MATH = "http://schemas.openxmlformats.org/officeDocument/2006/math"
_NS_MC = "http://schemas.openxmlformats.org/markup-compatibility/2006"


def _tag_math(nome: str) -> str:
    return f"{{{_NS_MATH}}}{nome}"


# Símbolos Unicode comuns em fórmula de prova -> comando LaTeX. O Word
# frequentemente guarda o caractere Unicode direto (ex: "β"), não o nome.
_SIMBOLOS_LATEX = {
    "α": r"\alpha", "β": r"\beta", "γ": r"\gamma", "Δ": r"\Delta",
    "δ": r"\delta", "θ": r"\theta", "λ": r"\lambda", "μ": r"\mu",
    "π": r"\pi", "Σ": r"\Sigma", "σ": r"\sigma", "φ": r"\phi",
    "Ω": r"\Omega", "×": r"\times", "÷": r"\div", "±": r"\pm",
    "≤": r"\leq", "≥": r"\geq", "≠": r"\neq", "∞": r"\infty",
}


def _texto_latex(texto: str) -> str:
    for simbolo, comando in _SIMBOLOS_LATEX.items():
        if simbolo in texto:
            texto = texto.replace(simbolo, comando + " ")
    return texto


def _omml_para_latex(elemento) -> str:
    """
    Converte um nó OMML (fórmula do Word) pra uma string LaTeX equivalente.
    Reconhece as estruturas mais comuns em prova: texto, potência/expoente
    (sSup), subscrito (sSub), fração (f), raiz (rad), delimitador tipo
    parênteses/chaves (d) e matriz (m). Qualquer estrutura não reconhecida
    cai no caso genérico: concatena o texto de dentro, na ordem — não
    fica com notação perfeita, mas não quebra e não perde conteúdo.
    """
    if elemento.tag == _tag_math("t"):
        return _texto_latex(elemento.text or "")

    if elemento.tag == _tag_math("sSup"):
        base = elemento.find(_tag_math("e"))
        exp = elemento.find(_tag_math("sup"))
        return f"{_omml_filhos_para_latex(base)}^{{{_omml_filhos_para_latex(exp)}}}"

    if elemento.tag == _tag_math("sSub"):
        base = elemento.find(_tag_math("e"))
        sub = elemento.find(_tag_math("sub"))
        return f"{_omml_filhos_para_latex(base)}_{{{_omml_filhos_para_latex(sub)}}}"

    if elemento.tag == _tag_math("sSubSup"):
        base = elemento.find(_tag_math("e"))
        sub = elemento.find(_tag_math("sub"))
        sup = elemento.find(_tag_math("sup"))
        return (
            f"{_omml_filhos_para_latex(base)}"
            f"_{{{_omml_filhos_para_latex(sub)}}}^{{{_omml_filhos_para_latex(sup)}}}"
        )

    if elemento.tag == _tag_math("f"):
        num = elemento.find(_tag_math("num"))
        den = elemento.find(_tag_math("den"))
        return f"\\frac{{{_omml_filhos_para_latex(num)}}}{{{_omml_filhos_para_latex(den)}}}"

    if elemento.tag == _tag_math("rad"):
        deg = elemento.find(_tag_math("deg"))
        base = elemento.find(_tag_math("e"))
        texto_deg = _omml_filhos_para_latex(deg)
        base_latex = _omml_filhos_para_latex(base)
        return f"\\sqrt[{texto_deg}]{{{base_latex}}}" if texto_deg else f"\\sqrt{{{base_latex}}}"

    if elemento.tag == _tag_math("d"):
        dPr = elemento.find(_tag_math("dPr"))
        beg_chr, end_chr = "(", ")"
        if dPr is not None:
            beg_el = dPr.find(_tag_math("begChr"))
            end_el = dPr.find(_tag_math("endChr"))
            if beg_el is not None:
                beg_chr = beg_el.get(_tag_math("val")) or ""
            if end_el is not None:
                end_chr = end_el.get(_tag_math("val")) or ""
        conteudo = "".join(
            _omml_para_latex(filho) for filho in elemento if filho.tag != _tag_math("dPr")
        )
        abre = "\\{" if beg_chr == "{" else (beg_chr or ".")
        fecha = "\\}" if end_chr == "}" else (end_chr or ".")
        return f"\\left{abre} {conteudo} \\right{fecha}"

    if elemento.tag == _tag_math("m"):
        linhas_latex = []
        for linha in elemento.findall(_tag_math("mr")):
            celulas = [_omml_filhos_para_latex(cel) for cel in linha.findall(_tag_math("e"))]
            linhas_latex.append(" & ".join(celulas))
        return "\\begin{matrix}" + " \\\\ ".join(linhas_latex) + "\\end{matrix}"

    return _omml_filhos_para_latex(elemento)


def _omml_filhos_para_latex(elemento) -> str:
    if elemento is None:
        return ""
    return "".join(_omml_para_latex(filho) for filho in elemento)


def extrair_formulas_do_paragrafo(paragrafo) -> list[str]:
    """
    Localiza fórmulas OMML (Word > Inserir > Equação) no parágrafo,
    converte cada uma pra LaTeX, registra em FORMULAS_EXTRAIDAS e devolve
    a lista de marcadores (__MOODLE_FORMULA_<hash>__) na ordem em que
    aparecem. Mesmo padrão de extrair_imagens_do_paragrafo.
    """
    marcadores = []
    for math_el in paragrafo._p.iter(_tag_math("oMath")):
        latex = _omml_para_latex(math_el).strip()
        if not latex:
            continue

        digest = hashlib.sha256(latex.encode("utf-8")).hexdigest()[:16]
        nome = f"formula_{digest}"
        marcador = f"__MOODLE_FORMULA_{digest.upper()}__"

        if nome not in FORMULAS_EXTRAIDAS:
            FORMULAS_EXTRAIDAS[nome] = {"nome": nome, "marcador": marcador, "latex": latex}

        marcadores.append(marcador)

    return marcadores


# =========================
# DETECÇÃO DE FORMATAÇÃO
# (mesma lógica do seu run_vermelho/run_amarelo/run_negrito original —
#  reaproveite as suas se preferir importar do questões.py)
# =========================
def run_vermelho(run) -> bool:
    """
    Detecta texto marcado em tom de vermelho — não só o vermelho puro
    (FF0000). Em documentos reais, professores usam tons variados
    (990000, CC0000, etc.) ao marcar manualmente a resposta correta.
    Regra: canal R dominante e G/B baixos o suficiente pra não confundir
    com laranja, marrom ou rosa.
    """
    color = getattr(getattr(run.font, "color", None), "rgb", None)
    if color is None:
        return False
    cor = str(color).upper()
    if len(cor) != 6:
        return False
    try:
        r, g, b = int(cor[0:2], 16), int(cor[2:4], 16), int(cor[4:6], 16)
    except ValueError:
        return False
    return r >= 100 and g <= 80 and b <= 80 and r > g + 40 and r > b + 40


def run_amarelo(run) -> bool:
    highlight = getattr(run.font, "highlight_color", None)
    return highlight == WD_COLOR_INDEX.YELLOW


def run_negrito(run) -> bool:
    return bool(run.bold)


def obter_info_lista_word(paragrafo) -> tuple[int | None, int | None]:
    """
    Alguns .docx usam numeração AUTOMÁTICA do Word para questões/alternativas
    (o Word desenha "1." ou "a)" na tela, mas esse número não existe no
    paragraph.text — é metadado da lista, invisível pra extração normal de
    texto). Sem captar isso, esses documentos chegariam à IA sem nenhuma
    numeração visível, e a segmentação ficaria praticamente impossível.

    Convenção observada: ilvl == 0 costuma ser o item principal (a questão);
    ilvl == 1 costuma ser o subitem (a alternativa). Não é garantido, mas é
    um sinal estrutural forte, independente de regex sobre o texto.
    """
    pPr = paragrafo._p.pPr
    if pPr is None or pPr.numPr is None:
        return None, None

    numPr = pPr.numPr
    num_id, ilvl = None, None
    if numPr.numId is not None:
        try:
            num_id = int(numPr.numId.val)
        except (TypeError, ValueError):
            pass
    if numPr.ilvl is not None:
        try:
            ilvl = int(numPr.ilvl.val)
        except (TypeError, ValueError):
            pass
    return num_id, ilvl


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


# "Inserir > Símbolo" com as fontes legadas (Symbol / Wingdings) grava um
# <w:sym w:font="..." w:char="F0NN"/> — e o python-docx NÃO lê isso, então
# setas (→), sinais de ≤ ≥ ×, checks etc. sumiam do texto que vai pra IA.
# Mapeia o byte baixo do código (o F000 é só o offset da área de uso
# privado) pro caractere Unicode de verdade. Cobre o que costuma aparecer
# em prova; o resto degrada pra "" (melhor sumir do que virar lixo).
_SYM_SYMBOL = {
    0xAB: "↔", 0xAC: "←", 0xAD: "↑", 0xAE: "→", 0xAF: "↓",
    0xDB: "⇔", 0xDC: "⇐", 0xDD: "⇑", 0xDE: "⇒", 0xDF: "⇓",
    0xB4: "×", 0xB8: "÷", 0xB1: "±", 0xA3: "≤", 0xB3: "≥",
    0xB9: "≠", 0xBB: "≈", 0xD6: "√", 0xA5: "∞",
}
_SYM_WINGDINGS = {
    0xE0: "→", 0xDF: "←", 0xE1: "←", 0xE2: "↑", 0xE3: "↓",
    0xF0: "←", 0xF1: "→", 0xF2: "↑", 0xF3: "↓",
    0xFC: "✔", 0xFB: "✘", 0xFD: "☑", 0xFE: "☒",
    0x6C: "●", 0xA7: "▪",
}


def _sym_para_unicode(font: str | None, char: str | None) -> str:
    if not char:
        return ""
    try:
        codigo = int(char, 16)
    except (TypeError, ValueError):
        return ""
    baixo = codigo & 0xFF
    f = (font or "").lower()
    if "wingding" in f:
        return _SYM_WINGDINGS.get(baixo, "")
    if "symbol" in f:
        return _SYM_SYMBOL.get(baixo, "")
    # Fonte comum: às vezes o char já é um codepoint Unicode real.
    if codigo >= 0x2000 and not (0xE000 <= codigo <= 0xF8FF):
        return chr(codigo)
    return ""


def _texto_do_run(run) -> str:
    """`run.text` + os <w:sym> (Inserir > Símbolo: →, ≤, ✔…) que o
    python-docx ignora. Percorre os filhos do <w:r> em ordem pra manter a
    posição do símbolo no meio do texto."""
    partes: list[str] = []
    for filho in run._r:
        tag = filho.tag
        if tag == qn("w:t"):
            partes.append(filho.text or "")
        elif tag == qn("w:tab"):
            partes.append("\t")
        elif tag in (qn("w:br"), qn("w:cr")):
            partes.append("\n")
        elif tag == qn("w:sym"):
            partes.append(_sym_para_unicode(filho.get(qn("w:font")), filho.get(qn("w:char"))))
    texto = "".join(partes)
    # Se por algum motivo o walk não pegou nada mas o run tem texto, confia
    # no python-docx.
    return texto or run.text


# <w:r> dentro destes elementos NÃO é texto solto do parágrafo: já é
# tratado à parte (forma/imagem) ou é conteúdo de alteração REJEITADA
# (rastreamento de alterações) — não deveria voltar ao texto.
_TAGS_RUN_A_IGNORAR = {qn("w:drawing"), qn("w:pict"), qn("w:del")}


def _run_deve_ignorar(elemento_r) -> bool:
    pai = elemento_r.getparent()
    while pai is not None:
        if pai.tag in _TAGS_RUN_A_IGNORAR:
            return True
        pai = pai.getparent()
    return False


def _runs_do_paragrafo(paragrafo):
    """
    TODOS os <w:r> do parágrafo, em ordem — inclusive os que estão dentro
    de um wrapper que `paragrafo.runs` (python-docx) NÃO atravessa, porque
    só olha filhos diretos de <w:p>:
      <w:sdt>       — Structured Document Tag. Documentos exportados do
                       Google Docs embrulham trechos de texto nisso (tag
                       "goog_rdk_N") e o conteúdo inteiro — uma alternativa,
                       o resto de um comentário — sumia sem deixar rastro
                       nenhum, nem espaço em branco.
      <w:hyperlink> — texto de um link.
      <w:ins>       — alteração rastreada ACEITA (inserção).
    Continua ignorando <w:drawing>/<w:pict> (forma/imagem, tratados à
    parte) e <w:del> (alteração REJEITADA — texto que não devia voltar).
    """
    from docx.text.run import Run

    return [
        Run(r, paragrafo)
        for r in paragrafo._p.xpath('.//*[local-name()="r"]')
        if not _run_deve_ignorar(r)
    ]


def _texto_paragrafo(paragrafo) -> str:
    """`paragrafo.text`, mas incluindo os <w:sym> de cada run E os runs
    escondidos dentro de <w:sdt>/<w:hyperlink>/<w:ins> (ver _runs_do_paragrafo)."""
    return "".join(_texto_do_run(r) for r in _runs_do_paragrafo(paragrafo)) or paragrafo.text


def _dentro_de_fallback(elemento) -> bool:
    """True se o elemento está dentro de um <mc:Fallback> — a cópia VML
    legada que o Word guarda ao lado da versão moderna (DrawingML) de uma
    forma. Sem isso, o texto de cada caixa sairia duplicado."""
    pai = elemento.getparent()
    while pai is not None:
        if pai.tag == f"{{{_NS_MC}}}Fallback":
            return True
        pai = pai.getparent()
    return False


def _linhas_de_texto_ooxml(container) -> list[str]:
    """Texto de um bloco OOXML qualquer, uma linha por parágrafo interno.
    `local-name()` casa tanto <w:p>/<w:t> (caixa de texto do Word) quanto
    <a:p>/<a:t> (texto nativo do DrawingML e do SmartArt)."""
    linhas: list[str] = []
    for p in container.xpath('.//*[local-name()="p"]'):
        texto_p = "".join(
            no.text for no in p.xpath('.//*[local-name()="t"]') if no.text
        ).strip()
        if texto_p:
            linhas.append(texto_p)
    return linhas


def _texto_smartart_do_desenho(desenho, doc) -> list[str]:
    """Um SmartArt guarda só uma referência (<dgm:relIds r:dm="rIdN">) dentro
    do <w:drawing>; o texto de verdade está no part `diagrams/dataN.xml`.
    Resolve a referência e devolve o texto de cada nó do diagrama."""
    linhas: list[str] = []
    for rel_ids in desenho.xpath('.//*[local-name()="relIds"]'):
        rid = rel_ids.get(qn("r:dm"))
        if not rid:
            continue
        parte = doc.part.related_parts.get(rid)
        dados = getattr(parte, "blob", None)
        if not dados:
            continue
        try:
            from lxml import etree

            raiz = etree.fromstring(dados)
        except Exception:
            continue
        # Só os nós de conteúdo (<dgm:pt type="node">); ignora os de
        # apresentação/conectores, que repetem ou vêm vazios.
        for ponto in raiz.xpath(
            './/*[local-name()="pt"][not(@type) or @type="node" or @type="doc"]'
        ):
            for linha in _linhas_de_texto_ooxml(ponto):
                if linha and linha not in linhas:
                    linhas.append(linha)
    return linhas


def extrair_texto_de_formas(paragrafo, doc) -> str | None:
    """
    O Word deixa desenhar caixas de texto, formas, 'canvas' e SmartArt
    (Inserir > Formas / Caixa de Texto / SmartArt) — comuns em questões de
    completar lacunas (banco de palavras), fluxogramas e esquemas. Esse
    texto NÃO aparece em `paragrafo.text` do python-docx, então a questão
    chegava à IA sem o conteúdo do desenho.

    Junta o texto de todas as formas/diagramas ancorados no parágrafo, uma
    linha por parágrafo interno, na ordem em que aparecem. Ignora a cópia
    de fallback (VML) que o Word guarda junto da moderna, pra não duplicar.
    """
    linhas_forma: list[str] = []

    for desenho in paragrafo._p.xpath(
        './/*[local-name()="drawing" or local-name()="pict"]'
    ):
        if _dentro_de_fallback(desenho):
            continue

        # 1) Caixas de texto e formas com texto (txbxContent / txBody).
        for caixa in desenho.xpath(
            './/*[local-name()="txbxContent" or local-name()="txBody"]'
        ):
            linhas_forma.extend(_linhas_de_texto_ooxml(caixa))

        # 2) SmartArt (texto vive num part separado).
        linhas_forma.extend(_texto_smartart_do_desenho(desenho, doc))

    # Remove linhas repetidas mantendo a ordem (grupos/canvas às vezes
    # trazem a mesma caixa em camadas).
    vistas: set[str] = set()
    unicas = [x for x in linhas_forma if not (x in vistas or vistas.add(x))]

    return "\n".join(unicas) if unicas else None


def _iter_blocos(elemento_pai, doc):
    """
    Percorre parágrafos E TABELAS filhos diretos de um elemento — o corpo
    do documento OU a célula de uma tabela — na ordem real em que aparecem
    (por padrão, doc.paragraphs e doc.tables vêm em duas listas separadas,
    perdendo a posição relativa entre eles). Sem isso, uma tabela de
    gabarito/dificuldade que aparece entre as questões ficaria invisível
    pra extração — ela simplesmente não é lida.
    """
    for filho in elemento_pai.iterchildren():
        if filho.tag == qn("w:p"):
            yield Paragraph(filho, doc)
        elif filho.tag == qn("w:tbl"):
            yield Table(filho, doc)


def _iter_blocos_documento(doc):
    yield from _iter_blocos(doc.element.body, doc)


def _tabela_e_layout(tabela) -> bool:
    """
    Muita gente usa uma tabela do Word só pra DESENHAR uma borda/caixa ao
    redor de um bloco de texto comum — a questão inteira, só as
    alternativas, só o comentário — em vez de bordas de parágrafo. Isso
    NÃO é uma tabela de dados de verdade (tipo um gabarito com colunas
    Questão/Resposta/Dificuldade); é um contêiner visual.

    Heurística: uma tabela de UMA coluna só não tem como carregar
    informação tabular relevante (não há colunas pra comparar) — é sempre
    esse uso de "caixa". Tabelas de 2+ colunas continuam tratadas como
    dado (gabarito etc.), que é o caso ambíguo de verdade.
    """
    try:
        return len(tabela.columns) <= 1
    except Exception:
        return all(len(linha.cells) <= 1 for linha in tabela.rows)


def _texto_tabela_marcado(tabela) -> str:
    """
    Representa uma tabela de DADOS do Word como texto simples, uma linha
    por linha da tabela, colunas separadas por " | ". Preserva a
    informação (ex: tabela de gabarito com colunas Questão/Resposta/
    Dificuldade) sem tentar interpretar o significado — isso fica a cargo
    da IA. (Tabelas usadas só como caixa/borda visual — uma coluna só —
    nem chegam aqui: veja _tabela_e_layout.)
    """
    linhas_tabela = []
    for linha in tabela.rows:
        celulas = [
            "\n".join(_texto_paragrafo(p) for p in celula.paragraphs).strip()
            for celula in linha.cells
        ]
        linhas_tabela.append(" | ".join(celulas))
    corpo = "\n".join(linhas_tabela)
    return f"[TABELA]\n{corpo}\n[/TABELA]"


# =========================
# 1) DOCX -> TEXTO MARCADO
# =========================
def _processar_paragrafo(paragrafo, doc) -> list[str]:
    """
    Converte UM parágrafo nas linhas de texto marcado correspondentes
    (0, 1 ou mais — um parágrafo com imagem/fórmula/desenho vira várias).
    Função reaproveitada tanto pro corpo do documento quanto pra dentro de
    uma tabela usada só como caixa/borda visual (ver _tabela_e_layout) —
    nesse caso o parágrafo é tratado exatamente igual a um solto no texto.
    """
    linhas: list[str] = []
    texto = _texto_paragrafo(paragrafo).strip()
    marcadores_imagem = extrair_imagens_do_paragrafo(paragrafo, doc)
    marcadores_formula = extrair_formulas_do_paragrafo(paragrafo)
    texto_forma = extrair_texto_de_formas(paragrafo, doc)

    if not texto and not marcadores_imagem and not marcadores_formula and not texto_forma:
        return linhas

    if texto:
        partes = []
        for run in _runs_do_paragrafo(paragrafo):
            trecho = _texto_do_run(run)
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

        linha_texto = "".join(partes).strip() or texto

        # Numeração automática do Word (sem dígito visível no texto):
        # marca o nível pra a IA usar como pista estrutural extra.
        _, ilvl = obter_info_lista_word(paragrafo)
        if ilvl == 0:
            linha_texto = f"[ITEM_LISTA_NIVEL0] {linha_texto}"
        elif ilvl == 1:
            linha_texto = f"[ITEM_LISTA_NIVEL1] {linha_texto}"

        linhas.append(linha_texto)

    # Marcador entra em linha própria, logo após o texto do parágrafo —
    # mesma posição que o script original usa.
    for marcador in marcadores_imagem:
        linhas.append(marcador)
    for marcador in marcadores_formula:
        linhas.append(marcador)
    if texto_forma:
        linhas.append(f"[DESENHO]\n{texto_forma}\n[/DESENHO]")

    return linhas


def _processar_blocos(blocos, doc) -> list[str]:
    linhas: list[str] = []
    for bloco in blocos:
        if isinstance(bloco, Paragraph):
            linhas.extend(_processar_paragrafo(bloco, doc))
        elif _tabela_e_layout(bloco):
            # Não é tabela de dados — é uma caixa/borda visual em volta de
            # texto comum (a questão inteira, só as alternativas, só o
            # comentário...). "Abre" a tabela: processa cada parágrafo de
            # cada célula igual a um parágrafo solto do documento, em vez
            # de esmagar tudo numa linha [TABELA] com "|" — senão a IA via
            # um bloco de "dado tabular" em vez da questão de verdade, e
            # alternativas/enunciado/comentário dentro da caixa somiam.
            for linha_tabela in bloco.rows:
                for celula in linha_tabela.cells:
                    linhas.extend(_processar_blocos(_iter_blocos(celula._tc, doc), doc))
        else:
            linhas.append(_texto_tabela_marcado(bloco))
    return linhas


def extrair_texto_marcado(docx_path: str) -> str:
    """
    Lê o .docx e devolve um texto único, com marcadores inline indicando
    formatação: [VERMELHO], [MARCADO] (destaque amarelo) e [NEGRITO].
    Também inclui o conteúdo de tabelas de DADOS (ex: uma tabela-resumo de
    gabarito ou dificuldade), marcado com [TABELA]...[/TABELA]. Tabelas
    usadas só pra desenhar uma caixa/borda ao redor de texto comum são
    "abertas" e tratadas como parágrafos normais (ver _tabela_e_layout) —
    não viram [TABELA].

    Esse texto marcado é o que vai para a IA — ele preserva os mesmos
    sinais visuais que suas heurísticas originais usam para achar a
    alternativa correta, só que em forma de texto que o modelo consegue ler.
    """
    doc = Document(docx_path)
    linhas = _processar_blocos(_iter_blocos_documento(doc), doc)
    return "\n".join(linhas)


# =========================
# 2) PROMPT + SCHEMA DE SAÍDA
# =========================
INSTRUCAO_SISTEMA = """
Você recebe o texto extraído de uma prova em Word. Provas vêm de professores/conteudistas diferentes, cada um formatando do seu jeito — não existe um padrão único. Use o SENTIDO do texto pra decidir onde uma questão começa e termina, mesmo que a formatação mude no meio do mesmo documento.

MARCADORES NO TEXTO (como interpretar a entrada):
- [VERMELHO]...[/VERMELHO], [MARCADO]...[/MARCADO] (destaque amarelo), [NEGRITO]...[/NEGRITO]: formatação original do Word. Frequentemente indicam a alternativa correta, mas cruze sempre com o contexto (ex: um gabarito escrito no texto, tipo "Resposta: C"). [VERMELHO] cobre qualquer tom de vermelho (990000, CC0000, FF0000...), não só o puro.
- __MOODLE_IMAGE_<código>__ (ex: __MOODLE_IMAGE_A1B2C3D4E5F6A7B8__): posição exata de uma imagem. Copie EXATAMENTE como está, no campo onde ela aparece no texto original (enunciado, alternativa ou justificativa) — nunca altere, descreva, remova ou mova pra outro campo.
- __MOODLE_FORMULA_<código>__ (ex: __MOODLE_FORMULA_A1B2C3D4E5F6A7B8__): posição exata de uma fórmula/equação matemática inserida pelo Word (Inserir > Equação). Mesma regra da imagem: copie EXATAMENTE como está, no campo onde aparece, nunca descreva, remova ou mova. Você não vê o conteúdo da fórmula (só o marcador), então não tente resolver, avaliar ou comentar sobre ela — apenas preserve o marcador no lugar certo.
- [ITEM_LISTA_NIVEL0] / [ITEM_LISTA_NIVEL1]: numeração automática do Word, sem dígito visível no texto. Nível 0 sugere item principal (nova questão); nível 1 sugere subitem (alternativa). É pista estrutural, não garantia — um título de seção também pode estar no nível 0.
- [TABELA]...[/TABELA]: tabela do Word, uma linha por linha do documento, colunas separadas por " | " (primeira linha costuma ser cabeçalho). Pode funcionar como gabarito-resumo (colunas tipo Questão/Resposta/Dificuldade/Unidade) — use o número da linha pra casar com a questão correspondente (mesma lógica do gabarito comentado, ver abaixo).
- [DESENHO]...[/DESENHO]: texto que estava dentro de formas/caixas de texto desenhadas no Word (esquemas, fluxogramas, banco de palavras). Aparece logo após o parágrafo em que a forma está ancorada, quase sempre a própria questão. Incorpore esse conteúdo ao campo em que faz sentido — em geral o "enunciado" (ex: numa questão de "complete as lacunas com os termos:", os termos vêm num [DESENHO]; junte-os ao enunciado, separados por vírgula ou em lista). Se claramente forem alternativas, trate como alternativas. Nunca ignore um [DESENHO] que traga conteúdo da questão.
Remova todos esses marcadores do resultado final (exceto o de imagem, que deve permanecer) — nenhum deve aparecer no texto extraído.

IDENTIFICANDO CADA QUESTÃO:
Formatos variam bastante: "1.", "01)", "Questão 1", "QUESTÃO 01", título em negrito, ou sem numeração nenhuma (só parágrafo em branco separando). Alternativas: "a)", "A)", "I.", "-", letra entre parênteses. Gabarito pode vir logo após a questão ou disperso ao final do documento.

Falsos positivos comuns:
- Subtítulo temático de seção ("1. Conceito de psicomotricidade"): curto (até ~12 palavras), não termina em ":" nem "?", sem verbo de comando ("assinale", "marque", "identifique", "avalie", "qual", "corresponde a") — é cabeçalho, não questão.
- Sigla parecendo numeral romano de subitem ("MDIC -", "CIF -", "ONU -"): só conta como romano de verdade se decodificar pra um valor pequeno e plausível (1 a ~20).
- Cabeçalhos "Unidade N"/"Bloco N"/"Módulo N"/"Capítulo N"/"Tema N"/"Semana N"/"Assunto: ..."/"Fórum N"/"Questionário N": nunca são questão — servem só pra preencher o campo "unidade" (ver regras de campo abaixo).
- Subitens dentro da MESMA questão (não são alternativas nem questão nova): "I – ...", "II – ...", letras soltas "A – ...", marcadores V/F "( ) ...", sequências "V, F, V".

Fronteira da justificativa sem rótulo explícito: rótulos como "Justificativa:", "Comentário:", "Feedback:" ajudam, mas nem todo documento os usa. Sem rótulo, decida pela POSIÇÃO — qualquer conteúdo (texto, imagem, lista, tabela) entre o fim das alternativas de uma questão e o PRÓXIMO sinal inequívoco de nova questão pertence à justificativa da questão ANTERIOR, nunca ao enunciado da seguinte. Na dúvida entre "ainda é da questão de trás" ou "já é da da frente", prefira manter na de trás.

Afirmativas sem numeração visível + alternativas de combinação: às vezes frases/parágrafos soltos (sem "I."/"II." escrito) vêm um atrás do outro, seguidos de opções de resposta curtas que são combinações deles, tipo "I e II", "II e III", "I, II e III". Nesse padrão, as frases longas são AFIRMATIVAS e ficam no campo "enunciado" (na ordem, numere I/II/III você mesmo se ajudar) — NUNCA em "correta"/"incorretas". Só as combinações curtas finais são alternativas de resposta de verdade. Esse é o erro mais comum nesse tipo de documento: misturar as afirmativas longas na lista de alternativas junto com as combinações.

GABARITO — DOIS FORMATOS:

1) SEPARADO ao final do documento: numa seção própria (cabeçalho "GABARITO", "GABARITO COMENTADO", "RESPOSTAS COMENTADAS") como uma lista curta ("1. C – texto da justificativa...", "2. B – ...") ou numa tabela [TABELA] com colunas equivalentes. Use o NÚMERO pra localizar a questão correspondente (mesma ordem de numeração usada no início do documento) e a LETRA pra escolher, entre as alternativas já listadas naquela questão, qual é a "correta" — mesmo que essa seção esteja muitos parágrafos distante da questão.

2) INLINE, logo depois das alternativas da própria questão: MUITO comum. Depois de listar A/B/C/D/E, o documento REPETE o texto da alternativa correta numa linha isolada — às vezes com a letra ("C) Elementos ajustáveis como velocidade, amplitude e força"), às vezes só o texto, às vezes precedido de "Resposta:"/"Resposta correta:"/"Gabarito:". Essa linha repetida em geral vem ANTES de um "Comentário:"/"Justificativa:". Regras:
   - Essa linha repetida NÃO é uma alternativa nova nem parte do enunciado — é o gabarito. Use-a só pra marcar qual das alternativas JÁ LISTADAS é a "correta" (casa pelo texto; a letra, se houver, confirma). NÃO a coloque em nenhum campo de saída.
   - O que vem depois dela ("Comentário: ...", "Justificativa: ...", ou texto explicativo sem rótulo) é a "justificativa".
   - "correta"/"incorretas" continuam sendo o texto das alternativas ORIGINAIS listadas na questão, não o texto repetido do gabarito.

Em qualquer formato: se a conclusão do gabarito não corresponder a NENHUMA alternativa listada, é inconsistência do documento — não force; deixe "correta" vazio e devolva todas em "incorretas".

CAMPOS DE CADA QUESTÃO:
- "titulo": cabeçalho da questão POR INTEIRO, exatamente como está no texto (ex: "Questão 3 — Cardinalidade 1:N/N:N", não apenas "Questão 3"). Use o genérico "Questão N" só quando não houver nenhum texto descritivo depois do número.
- "tipo": "Objetiva" (tem alternativas) ou "Discursiva" (não tem).
- "unidade": preencha só se o documento tiver, em QUALQUER lugar (cabeçalho de seção, título geral do documento, ou coluna de uma tabela), algo como "Unidade N"/"Bloco N"/"Módulo N"/"Capítulo N"/"Tema N"/"Semana N". Normalize sempre para o formato "Unidade N" (romano vira arábico: "Unidade III" → "Unidade 3"; "Módulo 02" → "Unidade 2"). Documento com mais de uma unidade: cada questão leva a do cabeçalho mais próximo ACIMA dela. Nunca invente — string vazia se não houver indicação em lugar nenhum.
- "dificuldade": preencha só com indicação EXPLÍCITA no documento ("Dificuldade: Fácil", "Nível: Médio", coluna de tabela "Dificuldade"/"Nível") — nunca julgue ou infira pelo conteúdo da questão. Normalize para exatamente "Fácil", "Média" (inclui "intermediária"/"intermediário"/"médio") ou "Difícil". String vazia se não houver indicação explícita.
- "enunciado": o texto da pergunta, sem marcadores de formatação, sem as alternativas. O enunciado TERMINA onde começa a primeira alternativa. ERRO GRAVE a evitar: jogar as alternativas (A/B/C/D/E, ou lista por número/traço) dentro do "enunciado" e deixar "correta"/"incorretas" vazias — se a questão tem opções de resposta listadas, elas SEMPRE vão pra "correta"/"incorretas", nunca pro enunciado.
- "correta" / "incorretas": texto de cada alternativa, sem marcadores de formatação. REMOVA qualquer prefixo de letra ou numeração da própria alternativa ("A)", "(A)", "a)", "B.", "1)", "I)") — o campo deve conter só o conteúdo da alternativa, nunca esse prefixo. O prefixo original (quando existir) ainda serve como pista pra decidir QUAL alternativa é a correta (junto com cor, gabarito etc.), mas não faz parte do texto final de nenhuma alternativa. Esses dois campos vêm de onde a questão lista as opções de resposta (o corpo da questão) — SEMPRE preencha os dois com o conteúdo de verdade das alternativas, independente do que acontecer no campo "justificativa" a seguir.
- "justificativa": comentário/explicação da resposta, se existir no texto (senão string vazia). Um bloco tipo "Justificativa:"/"Justificativas:"/"Comentário:" que recapitula cada alternativa por letra, dizendo se é correta ou incorreta, é conteúdo de JUSTIFICATIVA. Nesse bloco, remova o prefixo de letra de CADA linha/item antes de juntar no campo — o prefixo é só a letra entre/seguida de parênteses ou ponto no início do item ("(A)", "(B)", "A)", "A.", "1)"), nunca o resto da frase. Exemplo exato de transformação, item por item:
    Texto original:        "(A) Correta: equilíbrio entre atividades profissionais, descanso e vida pessoal favorece bem-estar e desempenho sustentável."
    Vira no campo:          "Correta: equilíbrio entre atividades profissionais, descanso e vida pessoal favorece bem-estar e desempenho sustentável."
  Ou seja, some SÓ o "(A) " do começo — o resto da frase (incluindo "Correta:"/"Incorreta:") permanece intacto, palavra por palavra. Faça essa mesma remoção em CADA item do bloco antes de montar o texto final de "justificativa" — não é opcional, e não deixe nenhum "(A)", "(B)", "(C)", "(D)" sobrando no resultado. IMPORTANTE: extrair esse bloco de justificativa NUNCA deve esvaziar ou substituir os campos "correta"/"incorretas" — são campos independentes um do outro. Se o documento tiver as alternativas curtas em um lugar (ex: logo após o enunciado) e depois um bloco de justificativa recapitulando cada uma com mais detalhe, preencha "correta"/"incorretas" com as alternativas curtas originais E "justificativa" com o texto explicativo (já sem os prefixos de letra) — nunca deixe "correta"/"incorretas" vazios só porque a justificativa também menciona as alternativas.
- "tem_codigo_ou_calculo": true se QUALQUER campo desta questão (enunciado, correta, incorretas, justificativa) contiver (a) trecho de código de programação em qualquer linguagem — reconheça por chaves, ponto e vírgula, palavras-chave (def, class, function, SELECT, INSERT, void, public, import, #include, tags HTML) — ou (b) fórmula/equação/operação matemática — operadores, frações, raízes, somatórios, potências, qualquer cálculo que o aluno precise resolver. Números soltos em prosa comum (datas, percentuais, quantidades) não contam. Na dúvida real, marque true.

REGRAS GERAIS:
- Nunca invente conteúdo que não está no texto original.
- Nunca invente valor pra um campo opcional (unidade, dificuldade, correta) só pra preencher — string vazia é sempre preferível a um palpite.
- Seja consistente: a mesma entrada deve sempre produzir a mesma extração, sem variar redação ou estrutura entre execuções.

""".strip()

SCHEMA_RESPOSTA = {
    "type": "ARRAY",
    "items": {
        "type": "OBJECT",
        "properties": {
            "titulo": {"type": "STRING"},
            "tipo": {"type": "STRING", "enum": ["Objetiva", "Discursiva"]},
            "unidade": {"type": "STRING"},
            "dificuldade": {"type": "STRING"},
            "enunciado": {"type": "STRING"},
            "correta": {"type": "STRING"},
            "incorretas": {"type": "ARRAY", "items": {"type": "STRING"}},
            "justificativa": {"type": "STRING"},
            "tem_codigo_ou_calculo": {"type": "BOOLEAN"},
        },
        "required": [
            "titulo", "tipo", "unidade", "dificuldade", "enunciado", "correta",
            "incorretas", "justificativa", "tem_codigo_ou_calculo",
        ],
    },
}

# Rede de segurança determinística: mesmo que a IA erre a marcação acima,
# essas expressões pegam os casos mais óbvios de código/matemática por
# regex — combinada por OR com o campo que a IA devolveu.
_PADRAO_CODIGO = re.compile(
    r"(\bdef\s+\w+\s*\(|\bclass\s+\w+|\bfunction\s*\(|\bSELECT\b.+\bFROM\b"
    r"|\bINSERT\s+INTO\b|\bpublic\s+(static\s+)?\w+\s+\w+\s*\(|#include\s*<"
    r"|\bimport\s+\w+|console\.log\s*\(|System\.out\.print"
    r"|[{;]\s*$|^\s*[{}]\s*$|<\?php|</?[a-z]+[^>]*>)",
    re.IGNORECASE | re.MULTILINE,
)
_PADRAO_CALCULO = re.compile(
    r"(\d+\s*[\+\-\*/\^]\s*\d+\s*=|[√∑∫≥≤±÷×∞]|\\frac|\\sqrt"
    r"|\b\d+\s*x\s*\d*\s*[\+\-]|[a-zA-Z]\(\s*x\s*\)\s*=)"
)


def _contem_codigo_ou_calculo_regex(questao: dict) -> bool:
    campos = [
        questao.get("enunciado", ""),
        questao.get("correta", ""),
        " ".join(questao.get("incorretas", [])),
        questao.get("justificativa", ""),
    ]
    texto_completo = "\n".join(campos)
    # Marcador de fórmula sobrando em qualquer campo já é certeza — não
    # depende de regex genérico, é o mesmo princípio de "checagem
    # determinística em vez de julgamento" que já usamos noutros lugares.
    if "__MOODLE_FORMULA_" in texto_completo:
        return True
    return bool(_PADRAO_CODIGO.search(texto_completo) or _PADRAO_CALCULO.search(texto_completo))


# Rede de segurança pra remoção de prefixo de letra na justificativa: a
# instrução no prompt pede pra IA remover "(A)", "B)", "A." etc. do início
# de cada item recapitulado, mas essa é uma transformação mecânica que a
# IA nem sempre aplica de forma consistente — então reforçamos por regex
# depois, igual já fazemos com tem_codigo_ou_calculo. Exige a letra COLADA
# em pontuação (parênteses ou ponto) pra nunca remover uma letra "solta"
# que por acaso comece uma frase comum (ex: "A resposta correta é...").
_PADRAO_PREFIXO_ALTERNATIVA = re.compile(r"^[\*\-•]?\s*(\([A-Za-z]\)|[A-Za-z][.\)])\s+", re.MULTILINE)


def _remover_prefixos_alternativa(texto: str) -> str:
    if not texto:
        return texto
    return _PADRAO_PREFIXO_ALTERNATIVA.sub("", texto)


# O prompt pede pra IA remover os marcadores de formatação/estrutura da
# saída, mas às vezes escapa um. Limpeza determinística: tira as tags e
# mantém o conteúdo. NUNCA toca em __MOODLE_IMAGE__ / __MOODLE_FORMULA__.
_RE_TAG_PAR = re.compile(r"\[/?(?:VERMELHO|MARCADO|NEGRITO|DESENHO|TABELA)\]")
_RE_TAG_SOLTA = re.compile(r"\[ITEM_LISTA_NIVEL[01]\]\s*")


def _limpar_marcadores_residuais(texto: str) -> str:
    if not texto:
        return texto
    texto = _RE_TAG_PAR.sub("", texto)
    texto = _RE_TAG_SOLTA.sub("", texto)
    return texto.strip()


# =========================
# 3) CHAMADA À API (Gemini)
# =========================
_PADRAO_UNIDADE_NO_NOME = re.compile(r"U(?:NI(?:DADE)?)?[\s_.\-]*0*([0-9]{1,2})(?!\d)", re.IGNORECASE)


def extrair_unidade_do_nome_arquivo(caminho) -> str:
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


def processar_arquivo(caminho, disciplina: str, log=print) -> list[dict]:
    """
    Lê um .docx, extrai as questões via IA e devolve a lista de dicts.
    Função de biblioteca — usada tanto pelo main.py (CLI, gera XML) quanto
    pelo extrair_json.py (chamado via child_process pelo backend Node).
    'log' recebe cada mensagem de progresso; por padrão usa print(), mas
    quem chamar pode passar uma função que escreve em stderr, por exemplo.
    """
    log(f"  Lendo {caminho.name}...")
    texto_marcado = extrair_texto_marcado(str(caminho))

    log("  Extraindo questões via IA (Gemini)...")
    questoes = extrair_questoes_via_ia(texto_marcado, disciplina=disciplina)

    # Fallback de unidade: só entra em ação se a IA não achou nada no
    # conteúdo do documento (campo "unidade" vazio) para aquela questão.
    unidade_do_nome = extrair_unidade_do_nome_arquivo(caminho)
    if unidade_do_nome:
        for questao in questoes:
            if not questao.get("unidade"):
                questao["unidade"] = unidade_do_nome
                questao["tags"].append(unidade_do_nome)

    log(f"  {len(questoes)} questão(ões) extraída(s) de {caminho.name}.")
    return questoes


# Códigos HTTP que valem repetir: 429 (limite de taxa) e a faixa 5xx
# (servidor sobrecarregado/instável). NÃO inclui 4xx como 400 (chave
# inválida) ou 404 (modelo inexistente) — esses são erros permanentes,
# repetir só atrasa a falha sem chance de dar certo.
_CODIGOS_TRANSITORIOS = {429, 500, 502, 503, 504}


def _eh_erro_transitorio(excecao: BaseException) -> bool:
    return isinstance(excecao, errors.APIError) and excecao.code in _CODIGOS_TRANSITORIOS


@retry(
    retry=retry_if_exception(_eh_erro_transitorio),
    stop=stop_after_attempt(4),
    wait=wait_exponential(multiplier=2, min=2, max=30),
    reraise=True,
)
def _chamar_gemini(client: genai.Client, modelo: str, texto_marcado: str, config: types.GenerateContentConfig):
    """
    Isola a chamada de rede numa função própria porque o tenacity re-executa
    a função INTEIRA a cada tentativa — não dá pra "retomar do meio" de uma
    função maior. reraise=True: sem isso, depois de esgotar as tentativas,
    o tenacity levantaria a própria exceção dele (RetryError) escondendo a
    mensagem original do Gemini.
    """
    return client.models.generate_content(model=modelo, contents=texto_marcado, config=config)


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

    resposta = _chamar_gemini(
        client,
        modelo,
        texto_marcado,
        types.GenerateContentConfig(
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
        # Rede de segurança: tira qualquer marcador de formatação/estrutura
        # que a IA tenha deixado escapar ([DESENHO], [VERMELHO], [TABELA]…),
        # em todos os campos de texto. Marcadores de imagem/fórmula ficam.
        q["enunciado"] = _limpar_marcadores_residuais(q.get("enunciado", ""))
        q["correta"] = _limpar_marcadores_residuais(q.get("correta", ""))
        q["incorretas"] = [_limpar_marcadores_residuais(x) for x in q.get("incorretas", [])]
        # E, na justificativa, também remove "(A)", "B)" etc. do início de
        # cada item recapitulado, caso a IA não tenha feito.
        q["justificativa"] = _remover_prefixos_alternativa(
            _limpar_marcadores_residuais(q.get("justificativa", ""))
        )
        # Tags: tipo, unidade e dificuldade já vieram da IA; disciplina vem
        # do parâmetro. Disciplina/tipo calculados aqui, não pela IA, pelo
        # mesmo motivo de sempre: já temos certeza deles. Unidade e
        # dificuldade são opcionais — só entram na tag quando a IA achou
        # indicação explícita no documento (campo não vazio).
        q["tags"] = [disciplina, q["tipo"]]
        if q.get("unidade"):
            q["tags"].append(q["unidade"])
        if q.get("dificuldade"):
            q["tags"].append(q["dificuldade"])
        # tem_codigo_ou_calculo: usa o julgamento da IA (que entende o
        # conteúdo) OU a checagem por regex (rede de segurança) — se
        # qualquer um dos dois disser que sim, vale sim. Não decide mais
        # formato de arquivo (só existe XML agora), mas fica como metadado
        # útil — pode virar tag no futuro se quiser filtrar por isso.
        q["tem_codigo_ou_calculo"] = bool(q.get("tem_codigo_ou_calculo")) or _contem_codigo_ou_calculo_regex(q)

    return questoes


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
