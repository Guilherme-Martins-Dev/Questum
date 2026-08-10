# pipeline/

Pipeline Python de extração de questões via IA — a parte do Questum que lê `.docx` e identifica a estrutura das questões. É chamado pelo backend (`apps/api`) via `child_process`, mas também funciona sozinho por linha de comando.

## 📋 Sobre

O maior desafio deste pipeline não é gerar o arquivo de saída, mas sim a **identificação da estrutura das questões** dentro do Word: separar enunciado, alternativas, identificar qual alternativa é a correta e capturar justificativas — a partir de documentos que cada professor formata de um jeito diferente.

## 🧩 Estrutura desta pasta

```
pipeline/
├── extracao_ia_gemini.py     # Extração de questões via IA (Gemini): .docx -> lista estruturada
├── extrair_json.py           # Extração pura (.docx -> JSON em stdout), chamado pelo apps/api via child_process
├── formatador.py             # Formata as questões extraídas em XML do Moodle (uso via main.py / CLI)
├── main.py                   # Orquestrador — liga extração + formatação, CLI standalone
├── requirements.txt
├── legacy-heuristico/        # Núcleo original (heurístico/regex), arquivado
│   ├── README.md
│   └── questoes.py
└── README.md
```

## ⚙️ Como funciona

1. **`extracao_ia_gemini.py`** extrai o texto do `.docx` — parágrafos **e tabelas**, na ordem real em que aparecem — preservando sinais visuais relevantes como marcadores inline (`[VERMELHO]...[/VERMELHO]`, `[MARCADO]...[/MARCADO]`, `[NEGRITO]...[/NEGRITO]`), marcadores de numeração automática do Word (`[ITEM_LISTA_NIVEL0]`/`[ITEM_LISTA_NIVEL1]`) e marcadores de imagem (`__MOODLE_IMAGE_<hash>__`).
2. Envia esse texto marcado para o Gemini, com um prompt que reúne um catálogo de padrões reais já observados em documentos de professores diferentes (ver seção abaixo).
3. Recebe de volta um JSON estruturado por questão — `titulo`, `tipo`, `unidade`, `dificuldade`, `enunciado`, `correta`, `incorretas`, `justificativa`, `tags`, entre outros campos calculados.
4. Duas formas de usar esse resultado:
   - **`extrair_json.py`** — extração pura, imprime só o JSON em `stdout` (logs em `stderr`). É o que o `apps/api` chama via `child_process`; não gera XML, porque quem gera o XML final agora é o backend (`xml-export.service.ts`), a partir dos dados já persistidos/editados no Postgres.
   - **`main.py` + `formatador.py`** — pipeline standalone via CLI: extrai **e** já gera um XML do Moodle, sem precisar do backend. Útil pra testar a extração isoladamente. Aceita **um ou mais** `.docx` numa única execução.

**Importante:** este pipeline usa a API do Gemini apenas como ponto de partida. A escolha definitiva de qual IA será usada em produção **ainda está em avaliação** — outras opções (ex: OpenAI, Claude) podem ser testadas e comparadas antes de uma decisão final.

### Por que só XML (sem GIFT)

O protótipo inicial gerava GIFT ou XML dependendo do conteúdo da questão (GIFT para texto simples, XML quando havia imagem, código ou fórmula — o GIFT escapa caracteres como `{ } = ~ # :`, que colidem com sintaxe de código e expressões matemáticas). Como o restante do projeto já opera inteiramente em XML, o suporte a GIFT foi removido: manter os dois formatos era complexidade sem necessidade real. Hoje **todo o pipeline gera exclusivamente XML**.

### Tags automáticas por questão

Cada questão recebe uma lista de tags:

| Tag | Origem | Obrigatória? |
|---|---|---|
| Disciplina | Parâmetro informado na execução | Sim |
| Tipo (`Objetiva`/`Discursiva`) | Identificado pela IA a partir do conteúdo | Sim |
| Unidade (`Unidade N`) | 1º: cabeçalho "Unidade N"/"Bloco N" dentro do próprio documento. 2º (fallback): nome do arquivo (ex: `"... UNI 02.docx"` → `Unidade 2`) | Não |
| Dificuldade (`Fácil`/`Média`/`Difícil`) | Indicação explícita no texto ou numa tabela do documento — a IA nunca julga/infere dificuldade pelo conteúdo | Não |

### Catálogo de padrões reconhecidos na extração

- Numeração de questão em formatos variados ("1.", "01)", "Questão 1", numeração automática do Word sem dígito visível no texto)
- Cabeçalhos de seção que não são questões ("Unidade 3", "Bloco 2", "Assunto: ...") — usados como contexto e como fonte da tag de unidade
- Subtítulo temático numerado vs. questão real (ex: "1. Conceito de X" é título de seção, não pergunta)
- Sigla vs. numeral romano de subitem (ex: "MDIC -" não é um subitem romano "II -")
- Gabarito comentado disperso ao final do documento, associado por número à questão correspondente, mesmo estando parágrafos de distância
- Afirmativas numeradas (I, II, III...) sem numeração visível no texto, seguidas de alternativas que são combinações dessas afirmativas — tratadas como parte do enunciado, nunca como alternativas
- Tabelas de gabarito/dificuldade/tema, lidas e associadas por número de questão
- Marcação de resposta correta por cor, reconhecendo variações de tom de vermelho (não só vermelho puro)
- Trechos de código de programação (qualquer linguagem) ou fórmulas/cálculos — sinalizados no campo `tem_codigo_ou_calculo` (IA + verificação por regex como reforço)

### Detalhes técnicos

- **SDK:** usa a biblioteca `google-genai` (não mais `google-generativeai`, descontinuada)
- **Modelo padrão:** `gemini-3.5-flash-lite` — GA, com tier gratuito, indicado para extração/estruturação de texto em alto volume
- **Consistência da saída:** a partir do Gemini 3.x, os parâmetros `temperature`/`top_p`/`top_k` foram descontinuados pela API. O controle de consistência entre execuções vem da instrução de sistema e de `thinking_config(thinking_level="minimal")`
- **Suporte a imagens:** localiza imagens no `.docx`, gera um marcador único por imagem (hash SHA-256 dos bytes) e instrui a IA a preservar esse marcador na posição correta da questão
- **Suporte a tabelas:** parágrafos e tabelas são lidos na ordem real do documento

## 🗄️ Sobre o núcleo anterior (heurístico)

O projeto começou com uma abordagem heurística/regex, com um parser dedicado por padrão de prova. Foi comparada com a extração via IA em casos reais e descontinuada como núcleo — exigia uma regra nova a cada formato de documento diferente e crescia continuamente em complexidade. Preservado em [`legacy-heuristico/`](./legacy-heuristico/) como referência histórica.

## ⚙️ Requisitos

```
pip install -r requirements.txt
```

## 🚀 Como usar (standalone, sem o backend)

```bash
export GEMINI_API_KEY="sua_chave"          # PowerShell: $env:GEMINI_API_KEY="sua_chave"

python main.py "Nome da Disciplina" prova1.docx [prova2.docx ...] [--saida pasta] [--nome-arquivo banco.xml]
```

> A chave gratuita da API do Gemini pode ser obtida em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
