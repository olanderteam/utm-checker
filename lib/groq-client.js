import Groq from 'groq-sdk';

export async function analyzePerformance(insights, utmAnalysis) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

  const { broken = [], ok = [], semTracking = 0 } = utmAnalysis;
  const totalSpend = insights.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0);
  const totalClicks = insights.reduce((s, r) => s + (parseInt(r.clicks) || 0), 0);
  const totalImpr = insights.reduce((s, r) => s + (parseInt(r.impressions) || 0), 0);
  const avgCtr = totalImpr > 0 ? ((totalClicks / totalImpr) * 100).toFixed(2) : '0.00';

  const campaignsSummary = insights
    .slice(0, 8)
    .map(c => `- ${c.campaign_name}: R$${parseFloat(c.spend || 0).toFixed(2)}, CTR ${parseFloat(c.ctr || 0).toFixed(2)}%, CPC R$${parseFloat(c.cpc || 0).toFixed(2)}`)
    .join('\n');

  const brokenSummary = broken.length
    ? broken.slice(0, 5).map(r => `- ${r.name}: ${r.reason}`).join('\n')
    : 'Nenhuma';

  const utmContexto = broken.length > 0
    ? `${broken.length} campanha(s) com url_tags incompletas (parâmetros faltando). Isso compromete a atribuição.`
    : `Todas as campanhas com url_tags estão corretas. As demais (${semTracking}) usam UTMs direto nos criativos — isso é válido e não é um problema.`;

  const prompt = `Você é um especialista em mídia paga. Analise os dados abaixo e escreva 3-4 bullets concisos em português sobre a performance do dia.

MÉTRICAS DO DIA:
- Campanhas ativas: ${insights.length}
- Gasto total: R$${totalSpend.toFixed(2)}
- Impressões: ${totalImpr.toLocaleString('pt-BR')}
- Clicks: ${totalClicks.toLocaleString('pt-BR')}
- CTR médio: ${avgCtr}%

CAMPANHAS (top 8):
${campaignsSummary || 'Sem dados ainda.'}

RASTREAMENTO UTM:
${utmContexto}
${broken.length > 0 ? `Campanhas com problema:\n${brokenSummary}` : ''}

Instruções:
- Foque em performance: o que está bem, o que está fraco, o que merece atenção.
- Só mencione UTMs se houver problema real (url_tags incompletas).
- Não cite "sem url_tags" como problema — campanhas com UTMs nos criativos estão rastreadas normalmente.
- Use bullets com emoji. Máximo 4 bullets. Seja direto e acionável.`;

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 450,
    temperature: 0.35,
  });

  return completion.choices[0].message.content.trim();
}
