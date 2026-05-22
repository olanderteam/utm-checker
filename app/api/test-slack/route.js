import { getCampaignInsights, getCampaignsWithUTMs, getAdsetsWithUTMs, extractLeadsFromInsight } from '@/lib/meta';
import { analyzeUTMs } from '@/lib/utm-checker';
import { postReport, postError } from '@/lib/slack-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const token = process.env.META_ACCESS_TOKEN;

  try {
    const [insights, campaigns, adsets] = await Promise.all([
      getCampaignInsights(adAccountId, token),
      getCampaignsWithUTMs(adAccountId, token),
      getAdsetsWithUTMs(adAccountId, token),
    ]);

    const insightsWithLeads = insights.map(r => ({
      ...r,
      leads: extractLeadsFromInsight(r),
    }));

    const utmAnalysis = analyzeUTMs(campaigns, adsets);
    const totalLeads = insightsWithLeads.reduce((s, r) => s + r.leads, 0);
    const totalSpend = insightsWithLeads.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
    const totalClicks = insightsWithLeads.reduce((s, r) => s + (parseInt(r.clicks) || 0), 0);
    const cpl = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : null;

    const timestamp = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const blocks = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🤖 UTM Bot — Apresentação e Teste de Configuração' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Olá! Sou o *UTM Bot*, um agente de monitoramento de campanhas com foco em *geração de leads*. Este é um teste confirmando que estou configurado e funcionando. Dados puxados em *${timestamp}*.`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📡 O que faço:*
• Monitoro campanhas do *Meta Ads* a cada 2 horas (cron automático)
• Valido se as *UTMs* das campanhas estão completas e corretas
• Calculo métricas de *geração de leads* (volume, CPL, CTR → Lead)
• Analiso a performance com *IA especializada em Growth Marketing* (Groq llama-3.3-70b)
• Envio este relatório diretamente neste canal do Slack`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*⚙️ Configuração atual:*
• *Fonte de dados:* Meta Ads Graph API v21.0
• *IA:* Groq — modelo \`llama-3.3-70b-versatile\` (especialista em Growth Marketing)
• *Schedule:* a cada 2 horas via Vercel Cron
• *Canal Slack:* este canal ✅
• *Conta Meta:* \`act_${adAccountId || 'configurada'}\``,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📊 Snapshot atual (hoje):*
• Campanhas ativas com dados: *${insightsWithLeads.length}*
• Gasto total hoje: *R$${totalSpend.toFixed(2)}*
• Clicks hoje: *${totalClicks.toLocaleString('pt-BR')}*
• Leads gerados (Meta Ads): *${totalLeads}*${cpl ? `\n• CPL médio hoje: *R$${cpl}*` : ''}
• UTMs com problema: *${utmAnalysis.broken.length}*
• UTMs corretas: *${utmAnalysis.ok.length}*
• Campanhas sem url_tags: *${utmAnalysis.semTracking}*`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*⚠️ Sobre divergência de leads entre plataformas:*
Os leads reportados aqui vêm do *Meta Ads* (pixel + formulários). O número pode divergir do *RD Station* e *MeeTIME* por diferenças em:
• Janelas de atribuição (Meta usa 7d clique / 1d visualização por padrão)
• Deduplicação de contatos
• Atrasos de sincronização entre plataformas
Sempre cruze as três fontes antes de reportar resultados para stakeholders.`,
        },
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `UTM Bot v1 | Meta Ads + Groq AI | Cron: \`0 */2 * * *\` | Dúvidas? Verifique as env vars no Vercel.`,
          },
        ],
      },
    ];

    await postReport(blocks);

    return Response.json({
      ok: true,
      message: 'Mensagem de apresentação enviada ao Slack com sucesso.',
      snapshot: {
        campaigns: insightsWithLeads.length,
        totalSpend: totalSpend.toFixed(2),
        totalLeads,
        cpl,
        utmBroken: utmAnalysis.broken.length,
        utmOk: utmAnalysis.ok.length,
        semTracking: utmAnalysis.semTracking,
      },
    });
  } catch (err) {
    console.error('[utm-bot] test-slack error:', err);
    await postError(`[TEST] ${err.message}`).catch(() => {});
    return Response.json({ error: err.message }, { status: 500 });
  }
}
