const MAX_BLOCK_TEXT = 2900;

function buildSummaryLine({ total, meta, google, others }, periodLabel) {
  if (total === 0) {
    return `*0 SQLs* gerados ${periodLabel}.`;
  }
  return `*${total} SQL${total !== 1 ? 's' : ''} ${periodLabel}* — 📱 Meta: *${meta.count}* | 🔍 Google: *${google.count}* | 🌐 Outros: *${others.count}*`;
}

function buildAttentionSection(attentionPoints) {
  if (!attentionPoints || attentionPoints.length === 0) {
    return '✅ Nenhum ponto de atenção identificado nas UTMs de hoje.';
  }
  const lines = ['*Pontos de atenção:*'];
  for (const point of attentionPoints) {
    lines.push(`• ${point}`);
  }
  return lines.join('\n');
}

export function buildLeadsStatus(leadsAnalysis, periodLabel = 'hoje', attentionPoints = []) {
  const lines = [buildSummaryLine(leadsAnalysis, periodLabel)];

  if (leadsAnalysis.total > 0) {
    lines.push('');
    lines.push(buildAttentionSection(attentionPoints));
  }

  const text = lines.join('\n');
  return text.length <= MAX_BLOCK_TEXT ? text : text.slice(0, MAX_BLOCK_TEXT - 40) + '\n_..._';
}

export function buildSlackBlocks(timestamp, leadsAnalysis, attentionPoints = [], options = {}) {
  const { periodLabel = 'hoje', headerTitle = '🎯 SQLs do Dia — [OKR][2025Q4]' } = options;

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📡 UTM Bot — ${timestamp}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${headerTitle}*` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: buildLeadsStatus(leadsAnalysis, periodLabel, attentionPoints) },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Disparo às 08h, 12h, 15h e 18h (Brasília) | Dados via Google Sheets` }],
    }
  ];

  return blocks;
}
