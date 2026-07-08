import { postReport } from '@/lib/slack-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🔧 UTM Bot — Resumo da Correção' },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*O que aconteceu:*\nO relatório de ontem (07/07) saiu com "0 SQLs", número claramente errado.\n\n' +
          '*Causa raiz:*\nA aba da planilha usada pelo bot foi renomeada de "Leads" para "Leads n8n". O Google Sheets, quando o nome da aba não bate, não dá erro — ele silenciosamente volta pra primeira aba da planilha (o resumo de OKR, que não tem dados de lead). Por isso o bot rodou sem nenhum erro visível, só que contando zero.\n\n' +
          '*O que foi corrigido:*\n• Trocamos para usar o identificador fixo da aba (gid), que não muda mesmo se ela for renomeada de novo.\n• Adicionamos uma validação: se as colunas esperadas não vierem no CSV, o bot agora avisa no Slack com um erro claro, em vez de reportar silenciosamente zero.\n• `/api/health` passou a validar a leitura real dos dados, não só se a URL responde.\n• Reenviamos o relatório de ontem (07/07) com o número correto: *443 SQLs* (183 Meta, 154 Google, 106 Outros).\n\n' +
          '*Próximos passos:*\nO bot vai rodar em *Modo de Correção* pelos próximos 5 dias (até 12/07) — os relatórios virão com essa marcação para facilitar o acompanhamento de perto até confirmarmos estabilidade total.',
      },
    },
  ];

  try {
    await postReport(blocks);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
