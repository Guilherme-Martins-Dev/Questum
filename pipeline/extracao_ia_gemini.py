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


def _iter_blocos_documento(doc):
    """
    Percorre parágrafos E TABELAS na ordem real em que aparecem no
    documento (por padrão, doc.paragraphs e doc.tables vêm em duas listas
    separadas, perdendo a posição relativa entre eles). Sem isso, uma
    tabela de gabarito/dificuldade que aparece entre as questões ficaria
    invisível pra extração — ela simplesmente não é lida.
    """
    for filho in doc.element.body.iterchildren():
        if filho.tag == qn("w:p"):
            yield Paragraph(filho, doc)
        elif filho.tag == qn("w:tbl"):
            yield Table(filho, doc)


def _texto_tabela_marcado(tabela) -> str:
    """
    Representa uma tabela do Word como texto simples, uma linha por linha
    da tabela, colunas separadas por " | ". Preserva a informação (ex:
    tabela de gabarito com colunas Questão/Resposta/Dificuldade) sem
    tentar interpretar o significado — isso fica a cargo da IA.
    """
    linhas_tabela = []
    for linha in tabela.rows:
        celulas = [celula.text.strip() for celula in linha.cells]
        linhas_tabela.append(" | ".join(celulas))
    corpo = "\n".join(linhas_tabela)
    return f"[TABELA]\n{corpo}\n[/TABELA]"


# =========================
# 1) DOCX -> TEXTO MARCADO
# =========================
def extrair_texto_marcado(docx_path: str) -> str:
    """
    Lê o .docx e devolve um texto único, com marcadores inline indicando
    formatação: [VERMELHO], [MARCADO] (destaque amarelo) e [NEGRITO].
    Também inclui o conteúdo de tabelas (ex: uma tabela-resumo de gabarito
    ou dificuldade), marcado com [TABELA]...[/TABELA], na posição em que
    aparece no documento.

    Esse texto marcado é o que vai para a IA — ele preserva os mesmos
    sinais visuais que suas heurísticas originais usam para achar a
    alternativa correta, só que em forma de texto que o modelo consegue ler.
    """
    doc = Document(docx_path)
    linhas = []

    for bloco in _iter_blocos_documento(doc):
        if isinstance(bloco, Paragraph):
            paragrafo = bloco
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

                linha_texto = "".join(partes).strip() or texto

                # Numeração automática do Word (sem dígito visível no texto):
                # marca o nível pra a IA usar como pista estrutural extra.
                _, ilvl = obter_info_lista_word(paragrafo)
                if ilvl == 0:
                    linha_texto = f"[ITEM_LISTA_NIVEL0] {linha_texto}"
                elif ilvl == 1:
                    linha_texto = f"[ITEM_LISTA_NIVEL1] {linha_texto}"

                linhas.append(linha_texto)

            # Marcador entra em linha própria, logo após o texto do
            # parágrafo — mesma posição que o script original usa.
            for marcador in marcadores_imagem:
                linhas.append(marcador)
        else:
            # É uma tabela.
            linhas.append(_texto_tabela_marcado(bloco))

    return "\n".join(linhas)


# =========================
# 2) PROMPT + SCHEMA DE SAÍDA
# =========================
INSTRUCAO_SISTEMA = """
Você recebe o texto extraído de uma prova em Word. Provas vêm de professores/conteudistas diferentes, cada um formatando do seu jeito — não existe um padrão único. Use o SENTIDO do texto pra decidir onde uma questão começa e termina, mesmo que a formatação mude no meio do mesmo documento.

MARCADORES NO TEXTO (como interpretar a entrada):
- [VERMELHO]...[/VERMELHO], [MARCADO]...[/MARCADO] (destaque amarelo), [NEGRITO]...[/NEGRITO]: formatação original do Word. Frequentemente indicam a alternativa correta, mas cruze sempre com o contexto (ex: um gabarito escrito no texto, tipo "Resposta: C"). [VERMELHO] cobre qualquer tom de vermelho (990000, CC0000, FF0000...), não só o puro.
- __MOODLE_IMAGE_<código>__ (ex: __MOODLE_IMAGE_A1B2C3D4E5F6A7B8__): posição exata de uma imagem. Copie EXATAMENTE como está, no campo onde ela aparece no texto original (enunciado, alternativa ou justificativa) — nunca altere, descreva, remova ou mova pra outro campo.
- [ITEM_LISTA_NIVEL0] / [ITEM_LISTA_NIVEL1]: numeração automática do Word, sem dígito visível no texto. Nível 0 sugere item principal (nova questão); nível 1 sugere subitem (alternativa). É pista estrutural, não garantia — um título de seção também pode estar no nível 0.
- [TABELA]...[/TABELA]: tabela do Word, uma linha por linha do documento, colunas separadas por " | " (primeira linha costuma ser cabeçalho). Pode funcionar como gabarito-resumo (colunas tipo Questão/Resposta/Dificuldade/Unidade) — use o número da linha pra casar com a questão correspondente (mesma lógica do gabarito comentado, ver abaixo).
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

GABARITO SEPARADO DAS QUESTÕES:
Às vezes a resposta correta e a justificativa não ficam junto da questão — aparecem numa seção própria (cabeçalho "GABARITO", "GABARITO COMENTADO", "RESPOSTAS COMENTADAS") como uma lista curta ("1. C – texto da justificativa...", "2. B – ...") ou numa tabela [TABELA] com colunas equivalentes. Em qualquer um dos dois formatos: use o NÚMERO pra localizar a questão correspondente (mesma ordem de numeração usada no início do documento) e a LETRA pra escolher, entre as alternativas já listadas naquela questão, qual é a "correta" — mesmo que essa seção esteja muitos parágrafos distante da questão. Se a conclusão do gabarito/comentário não corresponder a NENHUMA alternativa listada, é sinal de inconsistência no documento original — não force nem invente correspondência; deixe "correta" vazio e devolva todas em "incorretas".

CAMPOS DE CADA QUESTÃO:
- "titulo": cabeçalho da questão POR INTEIRO, exatamente como está no texto (ex: "Questão 3 — Cardinalidade 1:N/N:N", não apenas "Questão 3"). Use o genérico "Questão N" só quando não houver nenhum texto descritivo depois do número.
- "tipo": "Objetiva" (tem alternativas) ou "Discursiva" (não tem).
- "unidade": preencha só se o documento tiver, em QUALQUER lugar (cabeçalho de seção, título geral do documento, ou coluna de uma tabela), algo como "Unidade N"/"Bloco N"/"Módulo N"/"Capítulo N"/"Tema N"/"Semana N". Normalize sempre para o formato "Unidade N" (romano vira arábico: "Unidade III" → "Unidade 3"; "Módulo 02" → "Unidade 2"). Documento com mais de uma unidade: cada questão leva a do cabeçalho mais próximo ACIMA dela. Nunca invente — string vazia se não houver indicação em lugar nenhum.
- "dificuldade": preencha só com indicação EXPLÍCITA no documento ("Dificuldade: Fácil", "Nível: Médio", coluna de tabela "Dificuldade"/"Nível") — nunca julgue ou infira pelo conteúdo da questão. Normalize para exatamente "Fácil", "Média" (inclui "intermediária"/"intermediário"/"médio") ou "Difícil". String vazia se não houver indicação explícita.
- "enunciado": o texto da pergunta, sem marcadores de formatação, sem as alternativas.
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


# =========================
# 3) CHAMADA À API (Gemini)
# =========================
_PADRAO_UNIDADE_NO_NOME = re.compile(r"\bUNI(?:DADE)?[\s_.\-]*0*([0-9]+)", re.IGNORECASE)


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
        # Rede de segurança: mesmo que a IA não tenha removido "(A)", "B)"
        # etc. do início de cada item recapitulado na justificativa, essa
        # limpeza mecânica garante que não sobre nenhum.
        q["justificativa"] = _remover_prefixos_alternativa(q.get("justificativa", ""))
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
