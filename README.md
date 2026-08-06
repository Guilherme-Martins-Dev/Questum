# Questum

> 🧪 Branch: `developer` — inclui o módulo experimental de extração via IA.

## 📋 Sobre o projeto

**Questum** — do latim *quaestum*, forma supina do verbo *quaerere* ("buscar", "perguntar", "investigar"), mesma raiz de onde vem a palavra "questão" — é um conversor de arquivos Word (`.docx`) contendo questões de prova para os formatos **GIFT** e **XML** utilizados pelo Moodle, automatizando um processo que hoje é feito manualmente por professores e pela equipe pedagógica.

O maior desafio do projeto não é a geração dos arquivos de saída (isso já está resolvido), mas sim a **identificação da estrutura das questões** dentro do Word: separar enunciado, alternativas, identificar qual alternativa é a correta e capturar justificativas — tudo isso a partir de documentos que cada professor formata de um jeito diferente.

## 🧩 Conteúdo desta branch

Esta branch (`developer`) contém o núcleo funcional **e** o protótipo de extração via IA, lado a lado para comparação:

```
.
├── questoes.py        # Núcleo: extração heurística + geração de GIFT/XML
├── extracao_ia.py      # Experimental: extração de questões via IA (Gemini)
├── README.md
└── .gitignore
```

### `questoes.py` — Núcleo do projeto (funcional)

Extração heurística (dezenas de parsers, um por padrão de prova já identificado) + geração de GIFT/XML. Ver detalhes no README da branch `main`.

### `extracao_ia.py` — Extração via IA (protótipo, em avaliação)

Em vez de múltiplos parsers heurísticos, um único fluxo que:

1. Extrai o texto do documento preservando os sinais visuais relevantes como marcadores inline (`[VERMELHO]...[/VERMELHO]`, `[MARCADO]...[/MARCADO]`, `[NEGRITO]...[/NEGRITO]`)
2. **Extrai também as imagens** ancoradas em cada parágrafo (DrawingML e VML legado), registrando os bytes em `IMAGENS_EXTRAIDAS` e inserindo no texto um marcador de posição no formato `__MOODLE_IMAGE_<hash>__` — a IA é instruída a preservar esse marcador exatamente como está e na posição correta (enunciado, alternativa ou justificativa)
3. Envia o texto marcado para o Gemini com instruções para identificar a estrutura da questão
4. Recebe de volta um JSON estruturado, no **mesmo formato** já usado pelos parsers atuais (`titulo`, `enunciado`, `tipo`, `correta`, `incorretas`, `justificativa`) — o que permite plugar essa saída direto nas funções `montar_gift()` / `gerar_moodle_xml()` já existentes, sem precisar alterá-las

**Importante:** este protótipo usa a API do Gemini apenas como ponto de partida para validar a abordagem. A escolha definitiva de qual IA será usada em produção **ainda está em avaliação** — outras opções (ex: OpenAI, Claude) podem ser testadas e comparadas antes de uma decisão final.

#### Detalhes técnicos desta versão

- **SDK:** usa a biblioteca nova `google-genai` (não mais `google-generativeai`, usada no protótipo anterior)
- **Modelo padrão:** `gemini-3.5-flash-lite` — GA, com tier gratuito, indicado para extração/estruturação de texto em alto volume
- **Consistência da saída:** a partir do Gemini 3.x, os parâmetros `temperature`/`top_p`/`top_k` foram descontinuados pela API. O controle de consistência entre execuções agora vem da instrução de sistema (reforçada explicitamente no prompt) e de `thinking_config(thinking_level="minimal")` — nível de raciocínio padrão do Flash-Lite, adequado para uma tarefa de extração/estruturação (mais rápido e barato que níveis de raciocínio mais altos)
- **Suporte a imagens:** diferente do protótipo anterior (texto puro), esta versão localiza imagens no `.docx`, gera um marcador único por imagem (baseado em hash SHA-256 dos bytes) e instrui a IA a preservar esse marcador na posição correta da questão — permitindo reconstruir a imagem depois na geração do GIFT/XML

## ⚙️ Requisitos

```
python-docx
```

Para o módulo de extração via IA:

```
google-genai
```

## 🚀 Como usar

### Conversão heurística (núcleo)

```bash
python questoes.py caminho/para/prova.docx
```

### Extração via IA (experimental)

```bash
pip install google-genai python-docx
export GEMINI_API_KEY="sua_chave"          # PowerShell: $env:GEMINI_API_KEY="sua_chave"
python extracao_ia.py caminho/para/prova.docx
```

> A chave gratuita da API do Gemini pode ser obtida em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## 🗺️ Roadmap

- [x] Extração heurística de questões (parsers por formato)
- [x] Geração de arquivos GIFT e XML
- [x] Protótipo de extração via IA (Gemini) — validação de conceito
- [x] Suporte a extração e preservação de imagens no fluxo via IA
- [ ] Avaliar e comparar outras IAs para a extração (ex: OpenAI, Claude)
- [ ] Comparar qualidade da extração via IA vs. heurística em casos reais
- [ ] Integrar a extração via IA como alternativa (ou substituição) aos parsers heurísticos
- [ ] Testes automatizados

## 🎓 Contexto

Projeto desenvolvido para uso institucional, com foco em automatizar a criação de avaliações no Moodle a partir de provas em Word já elaboradas por professores.

## 📄 Licença

_A definir._