const MAX_BLOCK_TEXT = 2900;
const NO_UTM_ALERT_THRESHOLD = 0.2; // alerta se >20% dos leads do dia não tiverem utm_source

function buildPlatformBlock(label, { count, byCampaign, byPlacement }) {
  if (count === 0) return null;
  const lines = [`*${label} — ${count} SQL${count !== 1 ? 's' : ''}*`];

  if (byPlacement && Object.keys(byPlacement).length > 1) {
    const placements = Object.entries(byPlacement).sort((a, b) => b[1] - a[1]);
    const placementText = placements.map(([name, n]) => `${name}: *${n}*`).join(' | ');
    lines.push(`  ${placementText}`);
  }

  const top = Object.entries(byCampaign).sort((a, b) => b[1] - a[1]).slice(0, 10);
  for (const [campaign, n] of top) {
    lines.push(`  • *${n}* — ${campaign}`);
  }
  return lines.join('\n');
}

export function buildLeadsStatus({ total, meta, google, others, noUtmSourceCount, noUtmRate }) {
  if (total === 0) {
    return '*0 SQLs* gerados hoje.';
  }

  const lines = [`*${total} SQL${total !== 1 ? 's' : ''} hoje*`];

  if (noUtmRate >= NO_UTM_ALERT_THRESHOLD) {
    lines.push(`:warning: *${noUtmSourceCount}* leads (${Math.round(noUtmRate * 100)}%) sem \`utm_source\` — verificar se alguma tag de campanha está quebrada.`);
  }

  const metaBlock   = buildPlatformBlock('📱 Meta Ads', meta);
  const googleBlock = buildPlatformBlock('🔍 Google Ads', google);
  const othersBlock = buildPlatformBlock('🌐 Outros / Orgânico', others);

  if (metaBlock)   { lines.push(''); lines.push(metaBlock); }
  if (googleBlock) { lines.push(''); lines.push(googleBlock); }
  if (othersBlock) { lines.push(''); lines.push(othersBlock); }

  const text = lines.join('\n');
  return text.length <= MAX_BLOCK_TEXT ? text : text.slice(0, MAX_BLOCK_TEXT - 40) + '\n_..._';
}

export function buildSlackBlocks(timestamp, leadsAnalysis) {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📡 UTM Bot — ${timestamp}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: '*🎯 SQLs do Dia — [OKR][2025Q4]*' },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: buildLeadsStatus(leadsAnalysis) },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Disparo às 08h, 12h, 15h e 18h (Brasília) | Dados via Supabase` }],
    }
  ];

  return blocks;
}
