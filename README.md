# Observatório de Dados Econômicos e Sociais — MVP com ingestão

Starter fullstack em Next.js + TypeScript, Prisma, MySQL e Recharts.

## Funcionalidades
- Dashboard e catálogo pesquisável.
- Página de detalhe com gráfico histórico, unidade, periodicidade, fonte, código externo e última consulta.
- API REST para indicadores, fontes, categorias, comparação e saúde do banco.
- Módulo **Explorar Brasil** com mapa interativo das 27 Unidades da Federação, ranking, comparação de até três estados, evolução histórica e exportação CSV/PNG.
- Ingestão estadual da taxa de desocupação via IBGE/SIDRA (tabela 4099, variável 4099), separada das séries nacionais.
- Ingestão real via adaptadores para Banco Central/SGS e IBGE/SIDRA.
- Adaptador IPEAData opcional, configurável por código de série.
- Upsert idempotente: reimportações atualizam valores revisados sem duplicar observações.
- Registro de sucesso, falha, quantidade importada e horário em `ImportLog`.
- Data da coleta (`fetchedAt`) separada do período da observação.

## Fontes e séries integradas

| Fonte | Indicador | Identificador | Cobertura |
|---|---|---|---|
| Banco Central — SGS | Selic anualizada | Série 432 | Série diária disponível no SGS |
| Banco Central — SGS | IPCA mensal (cópia no SGS) | Série 433 | Série mensal disponível no SGS |
| IBGE — SIDRA | IPCA mensal | Tabela 1737 / variável 63 (variação mensal) | Brasil, últimos 120 períodos retornados pelo SIDRA |
| IBGE — SIDRA | Taxa de desocupação por UF | Tabela 4099 / variável 4099 | Estados e DF, todo o histórico disponível no SIDRA |
| IPEAData | Série escolhida pelo operador | `IPEADATA_SERIES_CODE` | Conforme metadados da série |

A malha GeoJSON das UFs é obtida pelo endpoint `/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=intermediaria`. Documentação: [IBGE Agregados/SIDRA](https://servicodados.ibge.gov.br/api/docs/agregados?versao=3), [SIDRA — taxa de desocupação por UF](https://apisidra.ibge.gov.br/values/t/4099/n3/all/v/4099/p/all), [PNAD Contínua — IBGE](https://www.ibge.gov.br/estatisticas/sociais/trabalho/9173-pnadcontinua.html), [malhas territoriais do IBGE](https://servicodados.ibge.gov.br/api/docs/malhas?versao=3), [BCB SGS](https://api.bcb.gov.br/), [IPEAData OData](https://ipeadata.gov.br/api/).

**Nota:** na tabela SIDRA 4099, a variável 4099 é a taxa de desocupação; a variável 4103 é o coeficiente de variação e não deve ser usada como valor principal do indicador. A série estadual é trimestral. O código de série e a unidade devem sempre ser conferidos nos metadados oficiais antes de uso editorial. As consultas SGS usam um intervalo explícito de até 10 anos para respeitar o limite aplicado pelo Banco Central às séries diárias. A série 433 do BCB é a variação mensal do IPCA; no SIDRA, a variável 63 da tabela 1737 é a variação mensal (a variável 2266 é o número-índice). A integração foi configurada para a variável 63.

## Requisitos
- Node.js 20.9+
- MySQL 8.0+

## Instalação local
1. Extraia o ZIP e abra a pasta no terminal.
2. Instale: `npm install`.
3. Crie o banco MySQL `observatorio` (por exemplo: `CREATE DATABASE observatorio CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`).
4. Copie `.env.example` para `.env` e ajuste `DATABASE_URL` no formato `mysql://usuario:senha@localhost:3306/observatorio`. Se a senha tiver caracteres especiais (`@`, `#`, `/` etc.), codifique-os para URL.
5. Defina `INGESTION_API_KEY` com uma chave longa e aleatória.
6. Gere o Prisma Client e atualize o banco:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
7. Prepare o catálogo sem criar dados fictícios:
   ```bash
   npm run db:seed
   ```
8. Importe os dados oficiais:
   ```bash
   npm run ingest
   ```
   Para atualizar somente as séries do IBGE (incluindo a taxa estadual usada no mapa): `npm run ingest:ibge`.
9. Inicie a aplicação: `npm run dev`. Acesse `http://localhost:3000`.

## Executar por fonte
```bash
npm run ingest:bcb
npm run ingest:ibge
npm run ingest:ipea
```

O IPEAData é opcional porque cada série exige código, unidade, periodicidade e cobertura específicos. Configure no `.env`:
```env
IPEADATA_SERIES_CODE="CODIGO_DA_SERIE"
IPEADATA_INDICATOR_SLUG="slug-da-serie"
IPEADATA_INDICATOR_NAME="Nome conforme metadados"
IPEADATA_INDICATOR_UNIT="Unidade conforme metadados"
IPEADATA_INDICATOR_PERIODICITY="Mensal"
```
Consulte e valide o `SERCODIGO` e os metadados em [IPEAData API](https://ipeadata.gov.br/api/). O adaptador considera séries numéricas com observações nacionais e descarta registros explicitamente identificados como território diferente de Brasil. Não use uma série regional como se fosse Brasil.

## Disparar ingestão por HTTP
`POST /api/admin/ingest` exige `Authorization: Bearer <INGESTION_API_KEY>`.

Importar todas as fontes configuradas:
```bash
curl -X POST http://localhost:3000/api/admin/ingest \
  -H "Authorization: Bearer SUA_CHAVE" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Filtrar por provedor (ex.: `banco central`, `ibge` ou `ipea`):
```json
{ "provider": "ibge" }
```

Histórico das últimas 50 execuções: `GET /api/imports`.

## Endpoints públicos
| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/indicators` | Lista; aceita `q`, `category`, `region`, `from`, `to` |
| GET | `/api/indicators/:slug` | Detalhe + observações |
| GET | `/api/categories` | Categorias |
| GET | `/api/sources` | Fontes |
| GET | `/api/compare?indicator=ipca&regionA=Brasil&regionB=Fortaleza` | Compara regiões com dados disponíveis |
| GET | `/api/imports` | Histórico de importações |
| GET | `/api/health` | Saúde da conexão com banco |
| GET | `/api/map` | Indicadores e observações territoriais disponíveis por UF |
| GET | `/api/geography/states` | Malha GeoJSON das UFs, servida a partir da API oficial do IBGE |
| POST | `/api/admin/ingest` | Executa ingestão; exige chave |

## Modelo de dados
- `Source`: instituição, URL e última consulta.
- `Category`: tema.
- `Indicator`: descrição, unidade, periodicidade, metodologia e código externo.
- `Observation`: região, código territorial IBGE quando disponível, nível geográfico, período, valor e instante de coleta.
- `ImportLog`: fonte, status, mensagem, quantidade e duração.

## Divisão sugerida para duas pessoas
- Dev A: adaptadores de fontes, validação, Prisma, idempotência, logs e endpoints.
- Dev B: dashboard, catálogo, gráficos, filtros, responsividade e testes E2E.
- Revisão cruzada: cada pessoa testa uma integração e uma funcionalidade vertical da outra.

## Limitações conhecidas / próximos passos
- O mapa estadual é alimentado pela série específica da PNAD Contínua por UF. As séries nacionais de IPCA e Selic não são replicadas artificialmente para estados.
- O adaptador IPEAData exige seleção explícita de uma série numérica.
- O mapa usa os códigos IBGE de UF (dois dígitos) e a malha territorial oficial. A estrutura `geographyCode`/`geographyLevel` aceita códigos de UF (2 dígitos) e de municípios (7 dígitos). Ao selecionar uma UF, o botão **Explorar municípios** abre a malha municipal correspondente, com ranking, comparação, histórico, filtros de indicador/período e exportação CSV.
- Para produção: adicionar paginação, cache, rate limiting, fila de tarefas, retentativas com backoff, monitoramento, testes automatizados e agendamento periódico.
- O endpoint HTTP pode atingir o limite de duração do host em importações longas; em produção, prefira executar `npm run ingest` como job agendado/worker.


### Exploração municipal

- Geometrias: API de Malhas do IBGE por UF, com `intrarregiao=municipios`; nomes obtidos pela API de Localidades.
- Dados municipais incluídos: população estimada (SIDRA tabela 6579, variável 9324, nível territorial N6), com os dez períodos mais recentes disponíveis.
- Execute `npm run ingest:ibge` para importar/atualizar a população municipal e a série estadual de desocupação.
- A taxa de desocupação da PNAD Contínua permanece somente no nível UF; ela não é replicada para municípios. Indicadores municipais adicionais podem ser cadastrados como novos `ImportTarget` com `geographyLevel: "Municipio"`.
- Os mapas usam a malha oficial do IBGE. Áreas sem observação permanecem sem valor; não há rateio nem estimativa de valores municipais a partir dos estados.

## Índices compostos e análise multidimensional

A página **Explorar Brasil** inclui o construtor de índices compostos. É possível selecionar até oito indicadores estaduais, definir o peso de cada um, escolher se valores maiores ou menores representam melhor desempenho, aplicar modelos de referência, salvar combinações no navegador e exportar o ranking em CSV.

### Como o índice é calculado

- Cada indicador é normalizado para uma escala de 0 a 100 pelo método min–max, considerando as UFs com observação no ano selecionado.
- Indicadores em que valores menores são desejáveis têm a escala invertida.
- A pontuação final é a média ponderada das pontuações normalizadas.
- O cálculo é estrito: uma UF sem dado para qualquer indicador selecionado fica sem pontuação. Não há preenchimento por média, zero ou estimativa.
- Para conciliar séries anuais e trimestrais, o seletor usa o ano de referência e escolhe a observação mais recente disponível dentro daquele ano para cada indicador.
- A pontuação é relativa à distribuição das UFs naquele recorte; não é um índice oficial e não deve ser comparada automaticamente entre anos.

### Indicadores estaduais disponíveis na ingestão IBGE

- Taxa de desocupação por UF — SIDRA 4099, variável 4099 (trimestral).
- População estimada por UF — SIDRA 6579, variável 9324 (anual).
- PIB per capita por UF — SIDRA 5964, variável 38 (anual).

A ingestão municipal de população estimada (SIDRA 6579, variável 9324, nível N6) permanece separada da exploração estadual. Indicadores de saúde, educação, saneamento e segurança não são apresentados como disponíveis até que suas séries e coberturas territoriais sejam integradas e validadas.

### Atualizar o catálogo e os dados

Com `DATABASE_URL` apontando para o banco de dados que será utilizado pela aplicação:

```bash
npx prisma generate
npx prisma db push
npm run ingest:ibge
```

A API `GET /api/map/multi?indicators=slug-1,slug-2` entrega o catálogo estadual e as observações dos indicadores selecionados para o construtor. As combinações salvas são armazenadas no `localStorage` do navegador; não são compartilhadas entre dispositivos ou usuários.
