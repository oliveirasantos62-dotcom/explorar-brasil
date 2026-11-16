# Exploração de municípios — implementação

## O que foi acrescentado

- A partir do painel de um estado, o botão **Explorar municípios de [UF]** abre a camada municipal.
- Geometrias carregadas sob demanda para a UF selecionada, evitando baixar os 5.569 municípios quando o usuário só quer olhar o mapa nacional.
- Nomes e códigos oficiais obtidos pela API de Localidades do IBGE.
- API municipal independente para consultar os indicadores com `geographyLevel = "Municipio"`.
- Ranking, seleção no mapa, detalhe do município, série histórica, comparação de até três municípios, filtro de indicador/período e exportação CSV.
- Novo indicador importável: população estimada por município (IBGE/SIDRA 6579, variável 9324, N6), últimos dez períodos disponíveis.
- Códigos IBGE de sete dígitos mantidos em `Observation.geographyCode`, sem agregá-los indevidamente à UF.

## Atualização local

A estrutura atual do Prisma já possui `geographyCode` e `geographyLevel`, então não é necessário apagar o banco nem recriar tabelas.

```bash
npx prisma generate
npm run ingest:ibge
npm run dev
```

Abra `/explorar-brasil`, selecione uma UF e clique em **Explorar municípios**.

## Limites metodológicos

A PNAD Contínua (taxa de desocupação por UF) continua disponível apenas no nível estadual. Não se deve atribuir esse valor a cada município. Nesta entrega, a população estimada é a primeira série municipal efetivamente integrada; outros indicadores podem ser adicionados com a mesma arquitetura desde que a fonte publique observações no nível municipal.

As geometrias são obtidas sob demanda da API de Malhas do IBGE e a lista de municípios vem da API de Localidades. A população municipal vem do SIDRA, tabela 6579, variável 9324, nível N6.
