"""
Formatador — transforma questões estruturadas (dicts vindos da extração via
IA) em XML do Moodle.

Este módulo NÃO fala com nenhuma IA. Ele só recebe:
    - a lista de questões (já estruturadas)
    - o dicionário IMAGENS_EXTRAIDAS (nome -> {marcador, base64, content_type})

e escreve o arquivo XML final. Só existe o caminho XML — o suporte a GIFT
foi removido porque o restante do projeto já opera inteiramente em XML, e
manter os dois formatos era complexidade sem necessidade real.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.dom import minidom


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

    tags_el = ET.SubElement(q, "tags")
    for tag in questao.get("tags", []):
        tag_el = ET.SubElement(tags_el, "tag")
        ET.SubElement(tag_el, "text").text = tag

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
    # Fração 0 fixa: alternativa incorreta não pontua, mas também não
    # penaliza (sem fração negativa) — diferente da prática de dividir
    # -100 entre as incorretas, que subtrairia pontos por errar.
    fracao_incorreta = "0"

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


def gerar_arquivo(
    questoes: list[dict],
    imagens_extraidas: dict,
    pasta_saida: str = ".",
    disciplina: str = "Banco de Questões",
    nome_arquivo: str = "banco_questoes.xml",
) -> None:
    """Escreve UM arquivo XML só, com todas as questões do lote."""
    pasta = Path(pasta_saida)
    pasta.mkdir(parents=True, exist_ok=True)

    if not questoes:
        print("[AVISO] Nenhuma questão para gerar.")
        return

    quiz = ET.Element("quiz")
    categoria = ET.SubElement(quiz, "question", {"type": "category"})
    cat = ET.SubElement(categoria, "category")
    ET.SubElement(cat, "text").text = f"$course$/top/{disciplina}"

    for questao in questoes:
        quiz.append(montar_elemento_xml(questao, imagens_extraidas))

    xml_bonito = minidom.parseString(ET.tostring(quiz, encoding="utf-8")).toprettyxml(indent="  ")
    caminho = pasta / nome_arquivo
    caminho.write_text(xml_bonito, encoding="utf-8")
    print(f"[OK] {len(questoes)} questão(ões) -> {caminho}")
