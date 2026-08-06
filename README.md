# Questum

> ⚠️ **Status:** em desenvolvimento ativo. O núcleo de conversão (heurístico) está funcional; a camada de extração via IA ainda está em fase de prototipagem/avaliação.

## 📋 Sobre o projeto

**Questum** — do latim *quaestum*, forma supina do verbo *quaerere* ("buscar", "perguntar", "investigar"), mesma raiz de onde vem a palavra "questão" — é um conversor de arquivos Word (`.docx`) contendo questões de prova para os formatos **GIFT** e **XML** utilizados pelo Moodle, automatizando um processo que hoje é feito manualmente por professores e pela equipe pedagógica.

O maior desafio do projeto não é a geração dos arquivos de saída (isso já está resolvido), mas sim a **identificação da estrutura das questões** dentro do Word: separar enunciado, alternativas, identificar qual alternativa é a correta e capturar justificativas — tudo isso a partir de documentos que cada professor formata de um jeito diferente.

## 🧩 Como o projeto está organizado

O repositório está dividido em duas partes, propositalmente separadas:

```
.
├── questoes.py           # Script principal: extração heurística + geração de GIFT/XML
├── extracao_ia/           # Módulo experimental: extração de questões via IA
│   └── extracao_ia_gemini.py
├── README.md
└── .gitignore
```

### `questoes.py` — Núcleo do projeto (funcional)

Contém toda a lógica já validada em produção:

- Leitura e conversão de arquivos `.doc`/`.docx`
- Extração de parágrafos, runs e imagens dos documentos
- Detecção de formatação relevante (texto em vermelho, destacado em amarelo, negrito) — sinais usados para identificar a alternativa correta
- Dezenas de parsers heurísticos, um para cada padrão de formatação de prova já identificado (`separar_questoes_avaliacao_resposta_correta`, `parse_questao_modelo_forum_questionario`, `processar_template_questao_justificativa`, entre outros)
- Geração dos arquivos finais em **GIFT** e **XML** (`montar_gift`, `gerar_moodle_xml`)

Essa abordagem funciona bem, mas tem uma limitação clara: **cada novo formato de prova exige escrever um novo parser**. Isso torna a manutenção cada vez mais complexa conforme mais professores e departamentos passam a usar o conversor.

### `extracao_ia/` — Extração via IA (protótipo, em avaliação)

Para resolver a limitação acima, está em teste uma abordagem alternativa: em vez de múltiplos parsers heurísticos, um único fluxo que:

1. Extrai o texto do documento preservando os sinais visuais relevantes como marcadores inline de texto (ex: `[VERMELHO]...[/VERMELHO]`, `[MARCADO]...[/MARCADO]`, `[NEGRITO]...[/NEGRITO]`)
2. Envia esse texto para um modelo de IA com instruções para identificar a estrutura da questão
3. Recebe de volta um JSON estruturado, no **mesmo formato** já usado pelos parsers atuais (`titulo`, `enunciado`, `tipo`, `correta`, `incorretas`, `justificativa`) — o que permite plugar essa saída direto nas funções `montar_gift()` / `gerar_moodle_xml()` já existentes, sem precisar alterá-las

**Importante:** o protótipo atual (`extracao_ia_gemini.py`) usa a API do Gemini apenas como ponto de partida para validar a abordagem. A escolha definitiva de qual IA será usada em produção **ainda está em avaliação** — outras opções (ex: OpenAI, Claude) podem ser testadas e comparadas antes de uma decisão final.

## ⚙️ Requisitos

```
python-docx
```

Para testar o módulo de extração via IA (protótipo com Gemini):

```
google-generativeai
```

## 🚀 Como usar

### Conversão heurística (núcleo atual)

```bash
python questoes.py caminho/para/prova.docx
```

### Protótipo de extração via IA (experimental)

```bash
pip install google-generativeai python-docx
export GEMINI_API_KEY="sua_chave"
python extracao_ia/extracao_ia_gemini.py caminho/para/prova.docx
```

> A chave gratuita da API do Gemini pode ser obtida em [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## 🗺️ Roadmap

- [x] Extração heurística de questões (parsers por formato)
- [x] Geração de arquivos GIFT e XML
- [x] Protótipo de extração via IA (Gemini) — validação de conceito
- [ ] Avaliar e comparar outras IAs para a extração (ex: OpenAI, Claude)
- [ ] Comparar qualidade da extração via IA vs. heurística em casos reais
- [ ] Integrar a extração via IA como alternativa (ou substituição) aos parsers heurísticos
- [ ] Testes automatizados

## 🎓 Contexto

Projeto desenvolvido para uso institucional, com foco em automatizar a criação de avaliações no Moodle a partir de provas em Word já elaboradas por professores.

## 📄 Licença

_A definir._