# Questum

> 🧪 Branch: `developer` — inclui o módulo experimental de extração via IA.

## 📋 Sobre o projeto

**Questum** — do latim *quaestum*, forma supina do verbo *quaerere* ("buscar", "perguntar", "investigar"), mesma raiz de onde vem a palavra "questão" — é um conversor de arquivos Word (`.docx`) contendo questões de prova para o formato **XML** utilizado pelo Moodle, automatizando um processo que hoje é feito manualmente por professores e pela equipe pedagógica.

O maior desafio do projeto não é a geração do arquivo de saída (isso já está resolvido), mas sim a **identificação da estrutura das questões** dentro do Word: separar enunciado, alternativas, identificar qual alternativa é a correta e capturar justificativas — tudo isso a partir de documentos que cada professor formata de um jeito diferente.

## 🧩 Conteúdo desta branch

Esta branch (`developer`) contém o núcleo funcional **e** o pipeline de extração via IA, lado a lado para comparação:

```
.
├── questoes.py               # Núcleo: extração heurística + geração de GIFT/XML
├── extracao_ia_gemini.py     # IA: extração de questões via Gemini (.docx -> lista estruturada)
├── formatador.py             # IA: formata as questões extraídas em XML do Moodle
├── main.py                   # IA: orquestrador — liga extração + formatação, CLI
├── README.md
└── .gitignore
```

### `questoes.py` — Núcleo do projeto (funcional)

Extração heurística (dezenas de parsers, um por padrão de prova já identificado) + geração de GIFT/XML. Ver detalhes no README da branch `main`.

### `extracao_ia_gemini.py` + `formatador.py` + `main.py` — Extração via IA (em avaliação)

Em vez de múltiplos parsers heurísticos, um único fluxo por documento:

1. **`extracao_ia_gemini.py`** extrai o texto do `.docx` — parágrafos **e tabelas**, na ordem real em que aparecem — preservando sinais visuais relevantes como marcadores inline (`[VERMELHO]...[/VERMELHO]`, `[MARCADO]...[/MARCADO]`, `[NEGRITO]...[/NEGRITO]`), marcadores de numeração automática do Word (`[ITEM_LISTA_NIVEL0]`/`[ITEM_LISTA_NIVEL1]`) e marcadores de imagem (`__MOODLE_IMAGE_<hash>__`).
2. Envia esse texto marcado para o Gemini, com um prompt que reúne um catálogo de padrões reais já observados em documentos de professores diferentes (ver seção abaixo).
3. Recebe de volta um JSON estruturado por questão — `titulo`, `tipo`, `unidade`, `dificuldade`, `enunciado`, `correta`, `incorretas`, `justificativa`, `tags`, entre outros campos calculados.
4. **`formatador.py`** transforma essa lista em um único arquivo **XML do Moodle**, embutindo imagens em base64 e as tags (disciplina, tipo, unidade, dificuldade) em cada questão.
5. **`main.py`** orquestra os dois passos acima, aceitando **um ou mais** arquivos `.docx` numa única execução — todas as questões de todos os arquivos vão para um único XML combinado.

**Importante:** este pipeline usa a API do Gemini apenas como ponto de partida para validar a abordagem. A escolha definitiva de qual IA será usada em produção **ainda está em avaliação** — outras opções (ex: OpenAI, Claude) podem ser testadas e comparadas antes de uma decisão final.

#### Por que só XML (sem GIFT)

O protótipo inicial gerava GIFT ou XML dependendo do conteúdo da questão (GIFT para texto simples, XML quando havia imagem, código ou fórmula — o GIFT escapa caracteres como `{ } = ~ # :`, que colidem com sintaxe de código e expressões matemáticas). Como o restante do projeto já opera inteiramente em XML, o suporte a GIFT foi removido: manter os dois formatos era complexidade sem necessidade real. Hoje **todo o pipeline de IA gera exclusivamente XML**.

#### Tags automáticas por questão

Cada questão recebe uma lista de tags, adicionada tanto ao XML quanto usada internamente para checagens determinísticas:

| Tag | Origem | Obrigatória? |
|---|---|---|
| Disciplina | Parâmetro informado na execução (`main.py "Nome da Disciplina" ...`) | Sim |
| Tipo (`Objetiva`/`Discursiva`) | Identificado pela IA a partir do conteúdo | Sim |
| Unidade (`Unidade N`) | 1º: cabeçalho "Unidade N"/"Bloco N" dentro do próprio documento. 2º (fallback): nome do arquivo (ex: `"... UNI 02.docx"` → `Unidade 2`) | Não (fica vazia se não encontrada em nenhuma das duas fontes) |
| Dificuldade (`Fácil`/`Média`/`Difícil`) | Indicação explícita no texto ou numa tabela do documento (ex: "Dificuldade: Fácil", coluna "Dificuldade") — a IA nunca julga/infere dificuldade pelo conteúdo | Não (fica vazia se não houver indicação explícita) |

#### Catálogo de padrões reconhecidos na extração

O prompt de extração reúne, como referência (não como lista fechada), padrões reais já identificados em documentos de professores distintos:

- Numeração de questão em formatos variados ("1.", "01)", "Questão 1", numeração automática do Word sem dígito visível no texto)
- Cabeçalhos de seção que não são questões ("Unidade 3", "Bloco 2", "Assunto: ...") — usados como contexto e como fonte da tag de unidade
- Subtítulo temático numerado vs. questão real (ex: "1. Conceito de X" é título de seção, não pergunta)
- Sigla vs. numeral romano de subitem (ex: "MDIC -" não é um subitem romano "II -")
- Gabarito comentado disperso ao final do documento, associado por número à questão correspondente, mesmo estando parágrafos de distância
- Afirmativas numeradas (I, II, III...) sem numeração visível no texto, seguidas de alternativas que são combinações dessas afirmativas — tratadas como parte do enunciado, nunca como alternativas
- Tabelas de gabarito/dificuldade/tema, lidas e associadas por número de questão
- Marcação de resposta correta por cor, reconhecendo variações de tom de vermelho (não só vermelho puro)
- Trechos de código de programação (qualquer linguagem) ou fórmulas/cálculos — sinalizados no campo `tem_codigo_ou_calculo` (IA + verificação por regex como reforço)

#### Detalhes técnicos desta versão

- **SDK:** usa a biblioteca `google-genai` (não mais `google-generativeai`, descontinuada)
- **Modelo padrão:** `gemini-3.5-flash-lite` — GA, com tier gratuito, indicado para extração/estruturação de texto em alto volume
- **Consistência da saída:** a partir do Gemini 3.x, os parâmetros `temperature`/`top_p`/`top_k` foram descontinuados pela API. O controle de consistência entre execuções vem da instrução de sistema (reforçada explicitamente no prompt) e de `thinking_config(thinking_level="minimal")`
- **Suporte a imagens:** localiza imagens no `.docx` (DrawingML e VML legado), gera um marcador único por imagem (hash SHA-256 dos bytes) e instrui a IA a preservar esse marcador na posição correta da questão — a imagem é embutida em base64 no XML final via `<file>`
- **Suporte a tabelas:** parágrafos e tabelas são lidos na ordem real do documento (não em listas separadas), então uma tabela de gabarito/dificuldade posicionada entre as questões não fica invisível para a extração

## ⚙️ Requisitos

```
python-docx
google-genai
```

## 🚀 Como usar

### Conversão heurística (núcleo)

```bash
python questoes.py caminho/para/prova.docx
```

### Extração via IA (em avaliação)

```bash
pip install google-genai python-docx
export GEMINI_API_KEY="sua_chave"          # PowerShell: $env:GEMINI_API_KEY="sua_chave"

python main.py "Nome da Disciplina" prova1.docx [prova2.docx ...] [--saida pasta] [--nome-arquivo banco.xml]
```

Exemplo com múltiplos arquivos (uma disciplina, várias unidades, um único XML de saída):

```bash
python main.py "Banco de Dados" "Unidade 02.docx" "Unidade 04.docx" --saida ./saida
```

> A chave gratuita da API do Gemini pode ser obtida em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## 🗺️ Roadmap

- [x] Extração heurística de questões (parsers por formato)
- [x] Geração de arquivo XML
- [x] Pipeline de extração via IA (Gemini) — validação de conceito
- [x] Suporte a extração e preservação de imagens no fluxo via IA
- [x] Leitura de tabelas do documento (gabarito, dificuldade, tema)
- [x] Tags automáticas por questão (disciplina, tipo, unidade, dificuldade)
- [x] Suporte a múltiplos arquivos `.docx` numa única execução, com XML combinado
- [x] Remoção do formato GIFT do pipeline de IA (XML exclusivo)
- [ ] Avaliar e comparar outras IAs para a extração (ex: OpenAI, Claude)
- [ ] Comparar qualidade da extração via IA vs. heurística em casos reais
- [ ] Integrar a extração via IA como alternativa (ou substituição) aos parsers heurísticos
- [ ] Testes automatizados

## 🎓 Contexto

Projeto desenvolvido para uso institucional, com foco em automatizar a criação de avaliações no Moodle a partir de provas em Word já elaboradas por professores.

## 📄 Licença

Todos os direitos reservados