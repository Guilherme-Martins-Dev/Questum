# Questum

> 🌿 Branch: `main` — versão estável, apenas conversão heurística.

## 📋 Sobre o projeto

**Questum** — do latim *quaestum*, forma supina do verbo *quaerere* ("buscar", "perguntar", "investigar"), mesma raiz de onde vem a palavra "questão" — é um conversor de arquivos Word (`.docx`) contendo questões de prova para os formatos **GIFT** e **XML** utilizados pelo Moodle, automatizando um processo que hoje é feito manualmente por professores e pela equipe pedagógica.

O maior desafio do projeto não é a geração dos arquivos de saída (isso já está resolvido), mas sim a **identificação da estrutura das questões** dentro do Word: separar enunciado, alternativas, identificar qual alternativa é a correta e capturar justificativas — tudo isso a partir de documentos que cada professor formata de um jeito diferente.

## 🧩 Conteúdo desta branch

Esta branch (`main`) contém apenas o núcleo funcional do projeto:

```
.
├── questoes.py
├── README.md
└── .gitignore
```

### `questoes.py`

Contém toda a lógica já validada em uso:

- Leitura e conversão de arquivos `.doc`/`.docx`
- Extração de parágrafos, runs e imagens dos documentos
- Detecção de formatação relevante (texto em vermelho, destacado em amarelo, negrito) — sinais usados para identificar a alternativa correta
- Dezenas de parsers heurísticos, um para cada padrão de formatação de prova já identificado (`separar_questoes_avaliacao_resposta_correta`, `parse_questao_modelo_forum_questionario`, `processar_template_questao_justificativa`, entre outros)
- Geração dos arquivos finais em **GIFT** e **XML** (`montar_gift`, `gerar_moodle_xml`)

Essa abordagem funciona bem, mas tem uma limitação clara: **cada novo formato de prova exige escrever um novo parser**. Isso torna a manutenção cada vez mais complexa conforme mais professores e departamentos passam a usar o conversor. Uma abordagem alternativa via IA está sendo desenvolvida e testada na branch `developer`.

## ⚙️ Requisitos

```
python-docx
```

## 🚀 Como usar

```bash
python questoes.py caminho/para/prova.docx
```

## 🎓 Contexto

Projeto desenvolvido para uso institucional, com foco em automatizar a criação de avaliações no Moodle a partir de provas em Word já elaboradas por professores.

## 📄 Licença

_A definir._