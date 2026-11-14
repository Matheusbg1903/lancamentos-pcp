# Lançamentos de Produção (PCP)

App para registrar os lançamentos de produção pelo celular, direto no chão de fábrica. Funciona offline e exporta os lançamentos em .xlsx no formato da planilha do PCP. Em uso em uma indústria de plásticos.

> Projeto desenvolvido com auxílio integral de IA generativa. Minha participação: identificar o problema, definir os requisitos e validar o funcionamento.

## Problema

Os lançamentos eram anotados em papel, depois digitados em uma planilha e, em seguida, transferidos para outra planilha. Cada passagem custava tempo e abria espaço para erro.

## Solução

O lançamento passou a ser feito pelo celular, no setor, e o app gera a planilha pronta para o PCP, sem redigitação.

## Funcionalidades

- Lançamento guiado em três passos: setor, produto e turno
- Conferência da sequência das etiquetas numeradas de cada turno
- Aviso de lançamentos duplicados e de produtos fora da lista do setor
- Tela de revisão por dia, com edição e exclusão
- Exportação em .xlsx com as colunas Data, Mês, Setor, Produto, Turno e Quantidade
- Funciona sem internet: os dados ficam no aparelho (IndexedDB, com cópia em localStorage)
- Limpeza automática dos lançamentos já exportados com mais de 2 meses
- Instalável na tela inicial do celular (PWA)

## Tecnologias

HTML · CSS · JavaScript · PWA (service worker e manifest) · IndexedDB · SheetJS (exportação .xlsx)

## Resultados observados

Sem medição formal:

- menos tempo para registrar os lançamentos;
- menos erros;
- menos retrabalho;
- operação mais prática.
