# Correção da integração IBGE — mapa interativo

Esta atualização corrige dois pontos da versão anterior:

1. A malha das Unidades da Federação agora é solicitada pelo endpoint de país com divisão interna por UF: `/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&intrarregiao=UF&qualidade=intermediaria`. O endpoint anterior `/malhas/estados` não identificava uma localidade e retornava HTTP 404.
2. A taxa de desocupação da tabela SIDRA 4099 usa a variável 4099. A variável 4103 é o coeficiente de variação. A leitura do período usa a dimensão de trimestre (`D3C`/`D3N`) e normaliza os códigos trimestrais para `AAAA-TN`.

## Aplicação

Substitua os arquivos da pasta do projeto pelos arquivos deste ZIP, preservando seu `.env`. Depois execute:

```bash
npx prisma generate
npm run ingest:ibge
npm run dev
```

Não é necessário apagar o banco. A ingestão utiliza upsert e pode ser repetida.
