# pipeline/

Pipeline Python de extração de questões via IA — a parte do Questum que lê `.docx` e identifica a estrutura das questões. É chamado pelo backend (`apps/api`) via `child_process`, mas também funciona sozinho por linha de comando.

## 📋 Sobre

O maior desafio deste pipeline não é gerar o arquivo de saída, mas sim a **identificação da estrutura das questões** dentro do Word: separar enunciado, alternativas, identificar qual alternativa é a correta e capturar justificativas — a partir de documentos que cada professor formata de um jeito diferente.

## 🧩 Estrutura desta pasta

```
pipeline/
├── extracao_ia_gemini.py     # .docx -> texto marcado -> IA (Gemini) -> lista estruturada
├── extrair_json.py           # Extração pura (.docx -> JSON em stdout), chamado pelo apps/api via child_process
├── formatador.py             # Questões -> XML do Moodle, com imagem e fórmula (uso via main.py / CLI)
├── main.py                   # Orquestrador — liga extração + formatação, CLI standalone
├── requirements.txt
├── legacy-heuristico/        # Núcleo original (heurístico/regex), arquivado
│   ├── README.md
│   └── questoes.py
└── README.md
```

## ⚙️ Como funciona

1. **`extracao_ia_gemini.py` → `extrair_texto_marcado()`** monta um texto único a partir do `.docx` — parágrafos **e tabelas**, na ordem real em que aparecem — preservando sinais visuais como marcadores inline (`[VERMELHO]`, `[MARCADO]` (destaque amarelo), `[NEGRITO]`), numeração automática do Word (`[ITEM_LISTA_NIVEL0/1]`), tabelas de dados (`[TABELA]...[/TABELA]`), texto de formas/caixas de texto/SmartArt (`[DESENHO]...[/DESENHO]`), imagens (`__MOODLE_IMAGE_<hash>__`) e fórmulas (`__MOODLE_FORMULA_<hash>__`, OMML→LaTeX).

   Boa parte do trabalho aqui é **recuperar conteúdo que o `python-docx` não enxerga** (`paragraph.runs` só lê `<w:r>` filho direto de `<w:p>`) — ver *Extração de estrutura do .docx* abaixo.
2. Envia esse texto marcado para o Gemini, com um prompt que reúne um catálogo de padrões reais já observados em documentos de professores diferentes (ver seção abaixo).
3. Recebe de volta um JSON estruturado por questão — `titulo`, `tipo`, `unidade`, `dificuldade`, `enunciado`, `correta`, `incorretas`, `justificativa`, `tags`, entre outros campos calculados. Uma limpeza determinística (`_limpar_marcadores_residuais`) tira qualquer marcador de formatação que a IA tenha esquecido, sem tocar em `__MOODLE_IMAGE/FORMULA__`.
4. Duas formas de usar esse resultado:
   - **`extrair_json.py`** — extração pura, imprime só o JSON em `stdout` (logs de progresso — inclusive `[i/N]` por arquivo — em `stderr`). É o que o `apps/api` chama via `child_process`; não gera XML, porque quem gera o XML final é o backend (`xml-export.build.ts`), a partir dos dados já persistidos/editados no Postgres.
   - **`main.py` + `formatador.py`** — pipeline standalone via CLI: extrai **e** já gera um XML do Moodle (com imagem e fórmula), sem precisar do backend. Útil pra testar a extração isoladamente. Aceita **um ou mais** `.docx` numa execução.

**Importante:** este pipeline usa a API do Gemini apenas como ponto de partida. A escolha definitiva de qual IA será usada em produção **ainda está em avaliação** — outras opções (ex: OpenAI, Claude) podem ser testadas e comparadas antes de uma decisão final.

> ⚠️ Só `.docx` é suportado. Arquivos `.doc` (formato antigo do Word) precisam ser convertidos manualmente — abra no Word e use "Salvar como" `.docx` — antes do upload.

### Por que só XML (sem GIFT)

O protótipo inicial gerava GIFT ou XML dependendo do conteúdo da questão (GIFT para texto simples, XML quando havia imagem, código ou fórmula — o GIFT escapa caracteres como `{ } = ~ # :`, que colidem com sintaxe de código e expressões matemáticas). Como o restante do projeto já opera inteiramente em XML, o suporte a GIFT foi removido: manter os dois formatos era complexidade sem necessidade real. Hoje **todo o pipeline gera exclusivamente XML**.

### Tags automáticas por questão

Cada questão recebe uma lista de tags:

| Tag | Origem | Obrigatória? |
|---|---|---|
| Disciplina | Parâmetro informado na execução | Sim |
| Tipo (`Objetiva`/`Discursiva`) | Identificado pela IA a partir do conteúdo | Sim |
| Unidade (`Unidade N`) | 1º: cabeçalho "Unidade N"/"Bloco N"/"Módulo N"/"Capítulo N"/"Tema N"/"Semana N" dentro do próprio documento. 2º (fallback): nome do arquivo (ex: `"... UNI 02.docx"` → `Unidade 2`) | Não |
| Dificuldade (`Fácil`/`Média`/`Difícil`) | Indicação explícita no texto ou numa tabela do documento — a IA nunca julga/infere dificuldade pelo conteúdo | Não |

### Catálogo de padrões reconhecidos na extração

- Numeração de questão em formatos variados ("1.", "01)", "Questão 1", numeração automática do Word sem dígito visível no texto)
- Cabeçalhos de seção que não são questões ("Unidade 3", "Bloco 2", "Módulo 2", "Capítulo 4", "Tema 1", "Semana 3", "Assunto: ...") — usados como contexto e como fonte da tag de unidade
- Subtítulo temático numerado vs. questão real (ex: "1. Conceito de X" é título de seção, não pergunta)
- Sigla vs. numeral romano de subitem (ex: "MDIC -" não é um subitem romano "II -")
- Gabarito comentado disperso ao final do documento, associado por número à questão correspondente, mesmo estando parágrafos de distância
- Afirmativas numeradas (I, II, III...) sem numeração visível no texto, seguidas de alternativas que são combinações dessas afirmativas — tratadas como parte do enunciado, nunca como alternativas
- Tabelas de gabarito/dificuldade/tema, lidas e associadas por número de questão
- Enunciado, alternativas ou comentário dentro de uma tabela usada só como caixa/borda visual (ver *Extração de estrutura do .docx*)
- Banco de palavras / esquema desenhado em caixas de texto ou SmartArt (`[DESENHO]`), incorporado ao enunciado
- Marcação de resposta correta por cor, reconhecendo variações de tom de vermelho (não só vermelho puro)
- Trechos de código de programação (qualquer linguagem) ou fórmulas/cálculos escritos como texto comum (não como objeto de equação do Word) — sinalizados no campo `tem_codigo_ou_calculo` (IA + verificação por regex como reforço)
- Fronteira da justificativa sem rótulo explícito ("Justificativa:", "Comentário:"): quando o documento não usa nenhum rótulo, o conteúdo entre o fim das alternativas e o próximo sinal inequívoco de nova questão é tratado como justificativa da questão anterior, nunca como enunciado da seguinte
- Prefixo de letra ("A)", "(A)") removido tanto das alternativas de resposta quanto da justificativa quando ela recapitula cada alternativa por letra — reforçado por regex determinístico além da instrução no prompt
- Fórmulas matemáticas inseridas via Word (Inserir > Equação, formato OMML) são convertidas para LaTeX (reconhece potência, fração, raiz, subscrito e matriz) e representadas por um marcador (`__MOODLE_FORMULA_<hash>__`), do mesmo jeito que imagem

### Extração de estrutura do .docx

O `python-docx` só lê texto "reto" (`<w:t>` em `<w:r>` filho direto de `<w:p>`). Muita coisa comum de prova ficava invisível — questão chegava sem alternativas, comentário truncado. O que é recuperado hoje:

| Recurso do Word | Como aparecia no arquivo | O que a extração faz |
|---|---|---|
| **`<w:sdt>` (Structured Document Tag)** | Provas **exportadas do Google Docs** embrulham trechos em `<w:sdt>` (tag `goog_rdk_N`) — de forma errática, só alguns parágrafos | `_runs_do_paragrafo()` pega todos os `<w:r>` via xpath recursivo, inclusive dentro de `<w:sdt>`/`<w:hyperlink>`/`<w:ins>`. Ignora `<w:drawing>`/`<w:pict>` (tratados à parte) e `<w:del>` (alteração rejeitada) |
| **`<w:sym>` (Inserir > Símbolo)** | Setas `→`, `≤ ≥ × ÷ √`, checks `✔` com fonte Symbol/Wingdings viram `<w:sym w:char="F0NN">`, não texto | Mapeados pro caractere Unicode real |
| **Caixas de texto / formas / canvas / SmartArt** | Texto em `<w:txbxContent>`, `<a:txBody>` ou no part `diagrams/dataN.xml` (SmartArt) | Sai como `[DESENHO]...[/DESENHO]` logo após o parágrafo âncora — a IA incorpora ao campo certo (em geral o enunciado, ex: banco de palavras de "complete as lacunas") |
| **Tabela de 1 coluna usada só como borda/caixa** | Comum: professor "delimita" a questão ou as alternativas numa tabela visual | `_tabela_e_layout()` detecta e "abre" a tabela — cada parágrafo vira texto solto, em vez de virar bloco `[TABELA]` (que a IA lê como gabarito). Tabelas de 2+ colunas continuam como `[TABELA]` |

### Detalhes técnicos

- **SDK:** usa a biblioteca `google-genai` (não mais `google-generativeai`, descontinuada)
- **Modelo padrão:** `gemini-3.5-flash-lite` — GA, com tier gratuito, indicado para extração/estruturação de texto em alto volume
- **Consistência da saída:** a partir do Gemini 3.x, os parâmetros `temperature`/`top_p`/`top_k` foram descontinuados pela API. O controle de consistência entre execuções vem da instrução de sistema e de `thinking_config(thinking_level="minimal")`
- **Imagens:** marcador único por imagem (hash SHA-256 dos bytes); a IA preserva o marcador na posição correta, o backend/`formatador.py` troca por `<img>` + `<file>` base64
- **Fórmulas:** equações do Word (Inserir > Equação) convertidas de OMML para LaTeX; a renderização acontece no Moodle via filtro MathJax
- **Tabelas de dados:** parágrafos e tabelas lidos na ordem real do documento
- **Retry automático:** chamadas ao Gemini com erro transitório (`429`, `5xx`) são repetidas (até 4 tentativas, espera crescente) via `tenacity` — erros permanentes (`400`, `404`) nunca
- **Timeout / teto de saída:** o backend mata o processo se passar de `PIPELINE_TIMEOUT_MS` ou `PIPELINE_MAX_OUTPUT_BYTES`

### Depurar uma extração

`extrair_texto_marcado()` é local e grátis (não chama a IA). Para ver exatamente o que a IA recebeu de um `.docx`:

```python
from extracao_ia_gemini import extrair_texto_marcado
print(extrair_texto_marcado("prova.docx"))
```

Se o conteúdo já falta aí, o problema é a leitura do `.docx` (não a IA). O arquivo de origem de uma questão persistida sai de `questoes.arquivo_id → arquivos.nome_arquivo`.

## 🗄️ Sobre o núcleo anterior (heurístico)

O projeto começou com uma abordagem heurística/regex, com um parser dedicado por padrão de prova. Foi comparada com a extração via IA em casos reais e descontinuada como núcleo — exigia uma regra nova a cada formato de documento diferente e crescia continuamente em complexidade. Preservado em [`legacy-heuristico/`](./legacy-heuristico/) como referência histórica.

## ⚙️ Requisitos

Python ≥ 3.10. Use um virtualenv dedicado (evita conflito com outros Pythons da máquina):

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt    # Linux/Mac: .venv/bin/pip
```

`requirements.txt`: `python-docx`, `google-genai`, `tenacity`.

## 🚀 Como usar (standalone, sem o backend)

```bash
export GEMINI_API_KEY="sua_chave"          # PowerShell: $env:GEMINI_API_KEY="sua_chave"

python main.py "Nome da Disciplina" prova1.docx [prova2.docx ...] [--saida pasta] [--nome-arquivo banco.xml]
```

> A chave gratuita da API do Gemini pode ser obtida em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

Quando chamado pelo backend, o interpretador vem de `PYTHON_BIN` no `apps/api/.env` — aponte pro `.venv` acima.
