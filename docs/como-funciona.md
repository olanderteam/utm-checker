# UTM Bot — Como Funciona

## Visão Geral

Bot que monitora UTMs das campanhas Meta Ads e conta SQLs do dia via RD Station, postando relatório no Slack automaticamente.

---

## Fluxo de Dados

### Horários de Disparo

| Horário | O que acontece |
|---------|---------------|
| **3h** | RD Station processa leads em batch (processo interno deles — sem acesso externo) |
| **8h** | Cron dispara: backfill pega o batch das 3h + webhook pega leads novos desde meia-noite → posta no Slack |
| **Durante o dia** | Webhook captura cada lead novo em tempo real conforme entra no RD Station |
| **18h** | Cron dispara: backfill + todos os leads acumulados pelo webhook → posta número completo no Slack |

### Fontes de Dados

```
Meta Ads API
  └─ Insights de campanhas (spend, CTR, CPC)
  └─ Status de UTMs (url_tags + creative{url_tags})

RD Station (2 fontes combinadas)
  ├─ Webhook (tempo real) → leads chegam conforme convertem
  └─ Backfill (batch)     → leads processados às 3h pelo RD

Vercel Blob
  └─ Armazena leads do dia (um arquivo por lead)
  └─ Chave: leads/YYYY-MM-DD/{uuid}.json
  └─ Reseta automaticamente a cada novo dia
Supabase (PostgreSQL)
  └─ Armazena leads do dia em uma tabela (`leads`)
  └─ Chave primária: `id` do lead ou `uuid`
  └─ Consultas são filtradas por dia (fuso de São Paulo)
```

---

## Arquitetura dos Endpoints

| Endpoint | Método | Função |
|----------|--------|--------|
| `/api/cron` | GET | Disparo principal (8h e 18h) — roda backfill + lê blob + posta Slack |
| `/api/webhooks/rd` | POST | Recebe leads em tempo real do RD Station |
| `/api/admin/backfill` | GET | Backfill manual (autenticado com CRON_SECRET) |
| `/api/auth/rd/callback` | GET | OAuth callback para autorizar o app do RD |

---

## Segmentações do RD Station Utilizadas

| Segmentação | ID | Plataforma |
|-------------|-----|------------|
| `[SQL][META] Leads de site do Meta Ads` | `14558480` | Meta Ads |
| `[SQL] Leads que vieram do Google Ads` | `11151932` | Google Ads |

---

## Limitações da API do RD Station

### Endpoint de Segmentações (`/platform/segmentations/{id}/contacts`)

- **Retorna apenas leads processados pelo batch das 3h** — leads que convertem durante o dia (10h, 14h, 17h etc.) só aparecem na API no dia seguinte às 3h
- **Sem filtro por data real** — a API ordena por `last_conversion_date` que só atualiza no batch noturno
- **Sem data de entrada na segmentação** — o RD Station UI mostra "leads de hoje" usando um campo interno não exposto pela API pública
- **Endpoint `/platform/contacts`** — retorna HTTP 500 (não funcional para listagem geral na conta)
- **Formato de UTMs** — armazenadas como campos customizados `cf_utm_source`, `cf_utm_medium`, `cf_utm_campaign` (não campos padrão)

### Impacto prático

- Cron das **8h**: número ~parcial (só o batch das 3h + webhook overnight)
- Cron das **18h**: número mais completo (batch + todo o webhook do dia)
- O painel do RD pode mostrar um número maior que o bot durante o dia — isso é esperado

---

## Limitações do Webhook do RD Station

### Formato do Payload

O RD Station envia um formato específico — diferente do padrão REST comum:

```json
{
  "leads": [
    {
      "id": "123456",
      "name": "Nome do Lead",
      "email": "email@exemplo.com",
      "public_url": "http://app.rdstation.com.br/leads/public/{uuid}",
      "last_conversion": {
        "content": {
          "[TRACK] utm_source": "facebook",
          "[TRACK] utm_medium": "paid",
          "[TRACK] utm_campaign": "[CW][MAI26][LEADS][LP]"
        }
      }
    }
  ]
}
```

**Atenção:** UTMs ficam dentro de `last_conversion.content` com prefixo `[TRACK]`, não no nível raiz do lead.

### Classificação de Plataforma (no webhook)

| Plataforma | Critério |
|------------|---------|
| **Google** | `utm_source` contém "google" OU `utm_medium` = cpc/ppc/paidsearch |
| **Meta** | `utm_source` contém "facebook"/"instagram"/"meta" OU `utm_medium` contém "paid" |
| **Ignorado** | Qualquer outro — não salvo no blob |

### Deduplicação

- Cada lead é salvo como um arquivo separado: `leads/YYYY-MM-DD/{uuid}.json`
- Se o mesmo lead dispara o webhook duas vezes no mesmo dia, o segundo sobrescreve o primeiro (sem duplicata)
- Leads presentes em BOTH Meta e Google segmentações são contados uma vez (última plataforma a salvar vence)

---

## Variáveis de Ambiente Necessárias

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SLACK_BOT_TOKEN` | ✅ | Token do bot Slack |
| `SLACK_CHANNEL_ID` | ✅ | Canal onde o relatório é postado |
| `META_ACCESS_TOKEN` | ✅ | Token de acesso Meta Ads API |
| `META_AD_ACCOUNT_ID` | ✅ | ID da conta de anúncios (sem "act_") |
| `CRON_SECRET` | ✅ | Segredo para autenticar o endpoint cron |
| `BLOB_READ_WRITE_TOKEN` | ✅ | Token do Vercel Blob (gerado automaticamente) |
| `RD_CLIENT_ID` | ✅ | Client ID do app RD Station |
| `RD_CLIENT_SECRET` | ✅ | Client Secret do app RD Station |
| `RD_REFRESH_TOKEN` | ✅ | Refresh token OAuth do RD Station |
| `RD_REDIRECT_URI` | ✅ | URL de callback OAuth |
| `RD_SEG_META` | ⚙️ | ID da segmentação Meta (padrão: 14558480) |
| `RD_SEG_GOOGLE` | ⚙️ | ID da segmentação Google (padrão: 11151932) |

---

## Configuração do Webhook no RD Station

1. Acesse **Marketing → Integrações → Webhooks**
2. Clique em **"+ Novo Webhook"**
3. Configure:
   - **URL**: `https://utm-checker-tawny.vercel.app/api/webhooks/rd`
   - **Evento**: Conversão / Estágio do funil alterado para SQL
4. Salvar

---

## Glossário

| Termo | Significado |
|-------|-------------|
| **Batch** | Processamento em lote que o RD Station faz às 3h para atualizar segmentações |
| **Webhook** | Notificação em tempo real que o RD envia para nossa URL quando um lead converte |
| **Backfill** | Processo de buscar leads via API de segmentações para complementar o webhook |
| **SQL** | Sales Qualified Lead — lead qualificado pelo time de vendas |
| **Blob** | Armazenamento de arquivos no Vercel usado para persistir leads do dia |
| **last_conversion_date** | Data da última conversão do lead — só atualiza no batch das 3h |
