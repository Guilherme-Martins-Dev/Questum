"""
Formatador — transforma questões estruturadas (dicts vindos da extração via
IA) em texto GIFT ou XML do Moodle.

Este módulo NÃO fala com nenhuma IA. Ele só recebe:
    - a lista de questões (cada uma já com "formato": "gift" ou "xml")
    - o dicionário IMAGENS_EXTRAIDAS (nome -> {marcador, base64, content_type})

e escreve os arquivos finais. Roteamento: cada questão vai para GIFT ou XML
de acordo com o campo "formato" que a etapa de extração já calculou.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.dom import minidom


# =========================
# GIFT (questões sem imagem)
# =========================
def escapar_gift(texto: str) -> str:
    """Escapa os caracteres especiais do formato GIFT."""
    if not texto:
        return ""
    substituicoes = {
        "\\": "\\\\",
        "~": "\\~",
        "=": "\\=",
        "#": "\\#",
        "{": "\\{",
        "}": "\\}",
        ":": "\\:",
    }
    for original, escapado in substituicoes.items():
        texto = texto.replace(original, escapado)
    return texto


def montar_bloco_gift(questao: dict) -> str:
    """Monta um bloco GIFT para uma questão sem imagens."""
    linhas = [f"::{escapar_gift(questao['titulo'])}::"]
    linhas.append(escapar_gift(questao["enunciado"]))

    if questao.get("tipo") == "Discursiva":
        linhas.append("{}")
        return "\n".join(linhas)

    linhas.append("{")
    linhas.append(f"    ={escapar_gift(questao['correta'])}")
    for alternativa in questao.get("incorretas", []):
        linhas.append(f"    ~{escapar_gift(alternativa)}")

    if questao.get("justificativa"):
        linhas.append(f"    #### {escapar_gift(questao['justificativa'])}")

    linhas.append("}")
    return "\n".join(linhas)


# =========================
# XML do Moodle (questões com imagem)
# =========================
def _imagem_por_marcador(marcador: str, imagens_extraidas: dict) -> dict | None:
    for imagem in imagens_extraidas.values():
        if imagem["marcador"] == marcador:
            return imagem
    return None


def _texto_html_com_imagens(texto: str, imagens_extraidas: dict) -> tuple[str, list[dict]]:
    """
    Troca cada marcador __MOODLE_IMAGE_...__ por uma tag <img> apontando
    para @@PLUGINFILE@@ (convenção do Moodle para arquivo embutido) e
    devolve também a lista de imagens usadas nesse texto, pra anexar como
    <file> depois.
    """
    if not texto:
        return "", []

    usadas = []
    resultado = texto
    for marcador in re.findall(r"__MOODLE_IMAGE_[A-F0-9]+__", texto):
        imagem = _imagem_por_marcador(marcador, imagens_extraidas)
        if imagem is None:
            continue
        usadas.append(imagem)
        tag = (
            f'<p><img src="@@PLUGINFILE@@/{imagem["nome"]}" '
            f'alt="Imagem da questão" style="max-width:100%;height:auto;"></p>'
        )
        resultado = resultado.replace(marcador, tag)
    return resultado.replace("\n", "<br>"), usadas


def _adicionar_texto(pai, tag: str, valor: str, formato_html: bool = True):
    elemento = ET.SubElement(pai, tag, {"format": "html"} if formato_html else {})
    texto_el = ET.SubElement(elemento, "text")
    texto_el.text = valor or ""
    return elemento


def _anexar_arquivos(pai, imagens_usadas: list[dict]):
    for imagem in imagens_usadas:
        arquivo = ET.SubElement(pai, "file", {
            "name": imagem["nome"],
            "path": "/",
            "encoding": "base64",
        })
        arquivo.text = imagem["base64"]


def montar_elemento_xml(questao: dict, imagens_extraidas: dict) -> ET.Element:
    """Monta o elemento <question> completo (com imagens embutidas) para uma questão."""
    tipo_moodle = "essay" if questao.get("tipo") == "Discursiva" else "multichoice"
    q = ET.Element("question", {"type": tipo_moodle})

    _adicionar_texto(q, "name", questao["titulo"], formato_html=False)

    enunciado_html, imagens_enunciado = _texto_html_com_imagens(
        questao.get("enunciado", ""), imagens_extraidas
    )
    questiontext = _adicionar_texto(q, "questiontext", enunciado_html)
    _anexar_arquivos(questiontext, imagens_enunciado)

    justificativa_html, imagens_justificativa = _texto_html_com_imagens(
        questao.get("justificativa", ""), imagens_extraidas
    )
    feedback = _adicionar_texto(q, "generalfeedback", justificativa_html)
    _anexar_arquivos(feedback, imagens_justificativa)

    ET.SubElement(q, "defaultgrade").text = "1.0000000"
    ET.SubElement(q, "penalty").text = "0.3333333"
    ET.SubElement(q, "hidden").text = "0"

    if questao.get("tipo") == "Discursiva":
        ET.SubElement(q, "responseformat").text = "editor"
        ET.SubElement(q, "responserequired").text = "1"
        ET.SubElement(q, "responsefieldlines").text = "15"
        ET.SubElement(q, "attachments").text = "0"
        ET.SubElement(q, "attachmentsrequired").text = "0"
        return q

    ET.SubElement(q, "single").text = "true"
    ET.SubElement(q, "shuffleanswers").text = "true"
    ET.SubElement(q, "answernumbering").text = "abc"

    fracao_correta = "100"
    fracao_incorreta = str(round(-100 / max(len(questao.get("incorretas", [])), 1), 5))

    correta_html, imagens_correta = _texto_html_com_imagens(
        questao.get("correta", ""), imagens_extraidas
    )
    resposta_correta = ET.SubElement(q, "answer", {"fraction": fracao_correta, "format": "html"})
    ET.SubElement(resposta_correta, "text").text = correta_html
    _anexar_arquivos(resposta_correta, imagens_correta)

    for alternativa in questao.get("incorretas", []):
        alt_html, imagens_alt = _texto_html_com_imagens(alternativa, imagens_extraidas)
        resposta = ET.SubElement(q, "answer", {"fraction": fracao_incorreta, "format": "html"})
        ET.SubElement(resposta, "text").text = alt_html
        _anexar_arquivos(resposta, imagens_alt)

    return q


# =========================
# ORQUESTRAÇÃO: separa por formato e escreve os arquivos
# =========================
def gerar_arquivos(
    questoes: list[dict],
    imagens_extraidas: dict,
    pasta_saida: str = ".",
    disciplina: str = "Banco de Questões",
) -> None:
    pasta = Path(pasta_saida)
    pasta.mkdir(parents=True, exist_ok=True)

    questoes_gift = [q for q in questoes if q.get("formato") == "gift"]
    questoes_xml = [q for q in questoes if q.get("formato") == "xml"]

    if questoes_gift:
        blocos = [montar_bloco_gift(q) for q in questoes_gift]
        caminho_gift = pasta / "banco_questoes_gift.txt"
        caminho_gift.write_text("\n\n".join(blocos), encoding="utf-8")
        print(f"[OK] {len(questoes_gift)} questão(ões) sem imagem -> {caminho_gift}")

    if questoes_xml:
        quiz = ET.Element("quiz")
        categoria = ET.SubElement(quiz, "question", {"type": "category"})
        cat = ET.SubElement(categoria, "category")
        ET.SubElement(cat, "text").text = f"$course$/top/{disciplina}"

        for questao in questoes_xml:
            quiz.append(montar_elemento_xml(questao, imagens_extraidas))

        xml_bonito = minidom.parseString(ET.tostring(quiz, encoding="utf-8")).toprettyxml(indent="  ")
        caminho_xml = pasta / "banco_questoes_moodle.xml"
        caminho_xml.write_text(xml_bonito, encoding="utf-8")
        print(f"[OK] {len(questoes_xml)} questão(ões) com imagem -> {caminho_xml}")

    if not questoes_gift and not questoes_xml:
        print("[AVISO] Nenhuma questão para gerar.")