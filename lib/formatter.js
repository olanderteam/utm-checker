const MAX_TABLE_ROWS = 20;
const MAX_BLOCK_TEXT = 2900; // Slack limit is 3000

function pad(str, len) {
  const s = String(str ?? '');
  return s.length >= len ? s.slice(0, len - 1) + '…' : s.padEnd(len);
}

function fmtNum(n) {
  const v = parseFloat(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(Math.round(v));
}

function fmtMoney(n) {
  return (parseFloat(n) || 0).toFixed(2);
}

// Split text into chunks that fit within Slack's 3000 char block limit
function chunkText(text, maxLen = MAX_BLOCK_TEXT) {
  if (text.length <= maxLen) return [text];
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    let cut = remaining.lastIndexOf('\n', maxLen);
    if (cut <= 0) cut = maxLen;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut + 1);
  }
  return chunks;
}

export function buildInsightsTable(insights) {
  if (!insights.length) return '```\nSem dados de performance hoje ainda.\n```';

  const rows = insights.slice(0, MAX_TABLE_ROWS);
  const COL = { name: 24, spend: 9, imp: 8, clicks: 7, ctr: 7, cpc: 8 };
  const sep = '─'.repeat(Object.values(COL).reduce((a, b) => a + b, 0) + Object.keys(COL).length - 1);

  const header = [
    pad('Campanha', COL.name),
    pad('Gasto', COL.spend),
    pad('Impr', COL.imp),
    pad('Clicks', COL.clicks),
    pad('CTR', COL.ctr),
    pad('CPC', COL.cpc),
  ].join(' ');

  let totalSpend = 0, totalImpr = 0, totalClicks = 0;

  const lines = rows.map(r => {
    const spend = parseFloat(r.spend) || 0;
    const impr = parseInt(r.impressions) || 0;
    const clicks = parseInt(r.clicks) || 0;
    totalSpend += spend;
    totalImpr += impr;
    totalClicks += clicks;
    return [
      pad(r.campaign_name, COL.name),
      pad(fmtMoney(spend), COL.spend),
      pad(fmtNum(impr), COL.imp),
      pad(fmtNum(clicks), COL.clicks),
      pad(`${parseFloat(r.ctr || 0).toFixed(2)}%`, COL.ctr),
      pad(fmtMoney(r.cpc), COL.cpc),
    ].join(' ');
  });

  // Sum all rows for totals (even those not shown in table)
  for (const r of insights.slice(MAX_TABLE_ROWS)) {
    totalSpend += parseFloat(r.spend) || 0;
    totalImpr += parseInt(r.impressions) || 0;
    totalClicks += parseInt(r.clicks) || 0;
  }

  const totalCtr = totalImpr > 0 ? ((totalClicks / totalImpr) * 100).toFixed(2) : '0.00';
  const totalCpc = totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : '0.00';

  const totalLine = [
    pad('TOTAL', COL.name),
    pad(fmtMoney(totalSpend), COL.spend),
    pad(fmtNum(totalImpr), COL.imp),
    pad(fmtNum(totalClicks), COL.clicks),
    pad(`${totalCtr}%`, COL.ctr),
    pad(totalCpc, COL.cpc),
  ].join(' ');

  const suffix = insights.length > MAX_TABLE_ROWS
    ? `\n(+ ${insights.length - MAX_TABLE_ROWS} campanhas omitidas — total inclui todas)`
    : '';

  return ['```', header, sep, ...lines, sep, totalLine, '```' + suffix].join('\n');
}

export function buildUTMStatus({ broken, ok, semTracking }) {
  const lines = [];

  if (broken.length === 0 && ok.length === 0 && semTracking === 0) {
    return '_Nenhuma campanha ativa encontrada._';
  }

  for (const r of broken) {
    const label = r.type === 'adset' ? `${r.campaignName} › ${r.name}` : r.name;
    lines.push(`❌ *${label}* — ${r.reason}`);
  }

  for (const r of ok) {
    const icon = r.dynamic ? '🔶' : '✅';
    const label = r.type === 'adset' ? `${r.campaignName} › ${r.name}` : r.name;
    lines.push(`${icon} *${label}* — ${r.reason}`);
  }

  if (semTracking > 0) {
    lines.push(`\n_ℹ️ ${semTracking} campanha(s) sem url_tags — UTMs provavelmente nos criativos_`);
  }

  const text = lines.join('\n');
  if (text.length <= MAX_BLOCK_TEXT) return text;

  // Truncate and add note
  const truncated = text.slice(0, MAX_BLOCK_TEXT - 100);
  const lastNewline = truncated.lastIndexOf('\n');
  return truncated.slice(0, lastNewline) + '\n_... (lista truncada — muitos itens)_';
}

export function buildSlackBlocks(insights, utmAnalysis, aiAnalysis, timestamp) {
  const { broken, ok, semTracking } = utmAnalysis;
  const totalUTMChecked = broken.length + ok.length;
  const alertBanner = broken.length > 0
    ? `\n:rotating_light: *${broken.length} UTM(s) com problema!*`
    : '';

  const tableText = buildInsightsTable(insights);
  const utmText = buildUTMStatus(utmAnalysis);

  // Split ai analysis if too long
  const aiChunks = chunkText(aiAnalysis);

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `UTM Bot Report — ${timestamp}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📊 Visão Geral de Campanhas (Hoje)* — ${insights.length} campanhas${alertBanner}`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: tableText },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔗 Status das UTMs* — ${totalUTMChecked} com tracking, ${broken.length} com problema, ${semTracking} sem url_tags`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: utmText },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: aiChunks[0] },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `Atualização a cada 2h | Meta Ads API + Groq llama-3.3-70b` },
      ],
    },
  ];

  // Add extra chunks if Groq response was very long
  for (let i = 1; i < aiChunks.length; i++) {
    blocks.splice(-1, 0, {
      type: 'section',
      text: { type: 'mrkdwn', text: aiChunks[i] },
    });
  }

  return blocks;
}
