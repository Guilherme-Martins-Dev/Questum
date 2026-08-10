# legacy-heuristico/

> ⚠️ **Status: descontinuado.** Este diretório preserva o `questoes.py`, o núcleo original do Questum, mantido aqui apenas como referência histórica e para eventual consulta pontual (ex: comparar um caso específico com o resultado da IA).

## O que é isto

`questoes.py` foi a primeira abordagem do projeto: extração das questões via **heurísticas + regex**, com um parser dedicado para cada padrão de prova já identificado. Ele resolvia bem os casos previstos, mas a manutenção não escalava.

## Por que foi descontinuado

Em comparação direta entre a extração heurística e a extração via IA (Gemini) em casos reais, a via IA mostrou eficiência muito maior. Os motivos observados no uso do `questoes.py`:

- **Cobertura frágil a novos formatos** — cada professor formata a prova de um jeito diferente. Sempre que aparecia um arquivo com um padrão ainda não previsto, o script dava erro ou simplesmente não conseguia importar as questões.
- **Explosão de regras** — a única forma de cobrir um novo padrão era adicionar mais um parser específico, o que foi fazendo o código crescer continuamente em linhas e em complexidade.
- **Dificuldade crescente de manutenção/otimização** — com dezenas de parsers coexistindo, alterar ou otimizar um trecho corria o risco de quebrar outros casos já cobertos, tornando cada mudança mais arriscada e demorada.

A extração via IA (ver `extracao_ia_gemini.py`, `formatador.py` e `main.py` na branch `developer`) substituiu essa lógica por um único fluxo por documento, que generaliza para padrões novos sem precisar de um parser dedicado a cada um.

## Quando ainda vale olhar para este código

- Para comparar, caso a caso, o resultado da extração heurística com o da extração via IA.
- Como referência dos padrões de prova que já foram mapeados manualmente ao longo do projeto (útil como checklist ao validar a extração via IA em documentos novos).

## Como usar (se necessário)

Diferente do pipeline de IA, este script **não recebe argumentos de linha de comando** — ele é totalmente interativo. Os arquivos `.docx`/`.doc` precisam estar na mesma pasta do script.

```bash
python questoes.py
```

O script então pergunta, em sequência:

1. **Tipo de material** — `DTCOM` ou `Uniateneu`
2. **Nome da disciplina**
3. **Modo de processamento** — arquivo único com várias unidades, ou vários arquivos separados por unidade
4. **Nome do(s) arquivo(s)** — deve corresponder a um `.docx`/`.doc` presente na pasta (o script lista os disponíveis)
5. **Formato de saída** — Moodle XML, GIFT, ou automático (GIFT sem imagens / XML com imagens)

Requisito de dependência: `python-docx`.
