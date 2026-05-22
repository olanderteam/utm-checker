import Groq from 'groq-sdk';

export async function analyzePerformance(insights, utmAnalysis, leadsData = {}) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const { broken = [], ok = [], semTracking = 0 } = utmAnalysis;
  const { totalLeads = 0 } = leadsData;

  const totalSpend = insights.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
  const totalClicks = insights.reduce((s, r) => s + (parseInt(r.clicks) || 0), 0);
  const totalImpr = insights.reduce((s, r) => s + (parseInt(r.impressions) || 0), 0);
  const avgCtr = totalImpr > 0 ? ((totalClicks / totalImpr) * 100).toFixed(2) : '0.00';
  const cpl = totalLeads > 0 ? (totalSpend / totalLeads).toFixed(2) : null;

  const campaignsSummary = insights
    .slice(0, 8)
    .map(c => {
      const leads = c.leads ?? 0;
      const spend = parseFloat(c.spend || 0);
      const cplCamp = leads > 0 ? `CPL R$${(spend / leads).toFixed(2)}` : 'sem leads registrados';
      return `- ${c.campaign_name}: R$${spend.toFixed(2)}, ${leads} leads, CTR ${parseFloat(c.ctr || 0).toFixed(2)}%, CPC R$${parseFloat(c.cpc || 0).toFixed(2)}, ${cplCamp}`;
    })
    .join('\n');

  const brokenSummary = broken.length
    ? broken.slice(0, 5).map(r => `- ${r.name}: ${r.reason}`).join('\n')
    : 'Nenhuma';

  const utmContexto = broken.length > 0
    ? `${broken.length} campanha(s) com url_tags incompletas. Isso compromete a atribuição de leads.`
    : `Todas as campanhas com url_tags corretas. As demais (${semTracking}) usam UTMs nos criativos — válido.`;

  const leadsContexto = totalLeads > 0
    ? `Total de leads gerados hoje (Meta Ads): ${totalLeads}\nCPL médio: R$${cpl}\n⚠️ Atenção: este número pode divergir do RD Station e MeeTIME por diferenças de atribuição e janelas de conversão.`
    : `Nenhum lead registrado no Meta Ads hoje ainda. Verifique se o pixel e os eventos de conversão estão configurados.`;

  const prompt = `Você é um especialista em Growth Marketing com foco em geração de leads via mídia paga. Analise os dados abaixo e escreva 3-4 bullets diretos em português sobre a performance do dia.

MÉTRICAS DO DIA:
- Campanhas ativas: ${insights.length}
- Gasto total: R$${totalSpend.toFixed(2)}
- Impressões: ${totalImpr.toLocaleString('pt-BR')}
- Clicks: ${totalClicks.toLocaleString('pt-BR')}
- CTR médio: ${avgCtr}%
- Leads gerados (Meta): ${totalLeads}${cpl ? `\n- CPL médio: R$${cpl}` : ''}

CAMPANHAS — TOP 8 (por gasto):
${campaignsSummary || 'Sem dados ainda.'}

GERAÇÃO DE LEADS:
${leadsContexto}

RASTREAMENTO UTM:
${utmContexto}
${broken.length > 0 ? `Campanhas com problema:\n${brokenSummary}` : ''}

Instruções:
- Foque em: volume de leads, CPL, quais campanhas estão gerando mais leads, eficiência de conversão (CTR → Lead).
- Sinalize se CPL está alto, baixo ou dentro do esperado para campanhas de geração de leads.
- Só mencione UTMs se houver problema real com url_tags incompletas.
- Não cite "sem url_tags" como problema — campanhas com UTMs nos criativos estão rastreadas normalmente.
- Use bullets com emoji. Máximo 4 bullets. Seja direto e acionável.`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content: 'Você é um especialista em Growth Marketing com profundo conhecimento em geração de leads, otimização de campanhas de mídia paga, CPL, funil de conversão e atribuição multi-touch. Seu objetivo é identificar oportunidades de melhoria e alertar sobre anomalias que impactam a geração de leads.',
      },
      { role: 'user', content: prompt },
    ],
    max_tokens: 600,
    temperature: 0.35,
  });

  return completion.choices[0].message.content.trim();
}
