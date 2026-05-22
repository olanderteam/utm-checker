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
  const COL = { name: 22, spend: 8, leads: 6, imp: 7, clicks: 7, ctr: 7, cpc: 8 };
  const sep = '─'.repeat(Object.values(COL).reduce((a, b) => a + b, 0) + Object.keys(COL).length - 1);

  const header = [
    pad('Campanha', COL.name),
    pad('Gasto', COL.spend),
    pad('Leads', COL.leads),
    pad('Impr', COL.imp),
    pad('Clicks', COL.clicks),
    pad('CTR', COL.ctr),
    pad('CPC', COL.cpc),
  ].join(' ');

  let totalSpend = 0, totalImpr = 0, totalClicks = 0, totalLeads = 0;

  const lines = rows.map(r => {
    const spend = parseFloat(r.spend) || 0;
    const impr = parseInt(r.impressions) || 0;
    const clicks = parseInt(r.clicks) || 0;
    const leads = r.leads ?? 0;
    totalSpend += spend;
    totalImpr += impr;
    totalClicks += clicks;
    totalLeads += leads;
    return [
      pad(r.campaign_name, COL.name),
      pad(fmtMoney(spend), COL.spend),
      pad(String(leads), COL.leads),
      pad(fmtNum(impr), COL.imp),
      pad(fmtNum(clicks), COL.clicks),
      pad(`${parseFloat(r.ctr || 0).toFixed(2)}%`, COL.ctr),
      pad(fmtMoney(r.cpc), COL.cpc),
    ].join(' ');
  });

  for (const r of insights.slice(MAX_TABLE_ROWS)) {
    totalSpend += parseFloat(r.spend) || 0;
    totalImpr += parseInt(r.impressions) || 0;
    totalClicks += parseInt(r.clicks) || 0;
    totalLeads += r.leads ?? 0;
  }

  const totalCtr = totalImpr > 0 ? ((totalClicks / totalImpr) * 100).toFixed(2) : '0.00';
  const totalCpc = totalClicks > 0 ? (totalSpend / totalClicks).toFixed(2) : '0.00';

  const totalLine = [
    pad('TOTAL', COL.name),
    pad(fmtMoney(totalSpend), COL.spend),
    pad(String(totalLeads), COL.leads),
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

export function buildUTMStatus({ broken, ok, okCreative = [], semTracking }) {
  const lines = [];

  if (broken.length === 0 && ok.length === 0 && okCreative.length === 0 && semTracking === 0) {
    return '_Nenhuma campanha ativa encontrada._';
  }

  // Split broken: ACTIVE = precisa de ação agora, PAUSED = não urgente
  const brokenActive = broken.filter(r => r.status === 'ACTIVE');
  const brokenPaused = broken.filter(r => r.status !== 'ACTIVE');

  for (const r of brokenActive) {
    const label = r.type === 'adset' ? `${r.campaignName} › ${r.name}` : r.name;
    lines.push(`❌ *${label}* — ${r.reason}`);
  }

  if (brokenPaused.length > 0) {
    lines.push(`⚠️ *${brokenPaused.length} campanha(s) pausada(s)* sem UTMs — não urgente (configurar antes de reativar)`);
  }

  for (const r of ok) {
    const icon = r.dynamic ? '🔶' : '✅';
    const label = r.type === 'adset' ? `${r.campaignName} › ${r.name}` : r.name;
    lines.push(`${icon} *${label}* — ${r.reason}`);
  }

  if (okCreative.length > 0) {
    lines.push(`\n✅ *${okCreative.length} campanha(s) com UTMs confirmados nos criativos* (sem url_tags, mas rastreamento OK)`);
  }

  if (semTracking > 0) {
    lines.push(`\n_ℹ️ ${semTracking} campanha(s): status de UTM pendente de verificação_`);
  }

  const text = lines.join('\n');
  if (text.length <= MAX_BLOCK_TEXT) return text;

  const truncated = text.slice(0, MAX_BLOCK_TEXT - 100);
  const lastNewline = truncated.lastIndexOf('\n');
  return truncated.slice(0, lastNewline) + '\n_... (lista truncada — muitos itens)_';
}

export function buildLeadsAlert(totalLeads) {
  const leadsLine = totalLeads > 0
    ? `🎯 *${totalLeads} lead(s)* gerado(s) hoje via Meta Ads`
    : `🎯 *0 leads* registrados no Meta Ads hoje — verifique pixel e eventos de conversão`;

  return `${leadsLine}

⚠️ *Atenção — divergência entre plataformas:* O número de leads do Meta Ads pode ser diferente do registrado no *RD Station* e *MeeTIME* devido a janelas de atribuição, deduplicação e atrasos de sincronização. Sempre cruze as três fontes antes de reportar resultados.`;
}

export function buildSlackBlocks(insights, utmAnalysis, aiAnalysis, timestamp, leadsData = {}) {
  const { broken, ok, okCreative = [], semTracking } = utmAnalysis;
  const { totalLeads = 0 } = leadsData;
  const totalUTMChecked = broken.length + ok.length + okCreative.length;
  const brokenActive = broken.filter(r => r.status === 'ACTIVE');
  const alertBanner = brokenActive.length > 0
    ? `\n:rotating_light: *${brokenActive.length} campanha(s) ATIVA(S) com problema de UTM!*`
    : '';

  const cpl = totalLeads > 0
    ? ` | CPL R$${(insights.reduce((s, r) => s + (parseFloat(r.spend) || 0), 0) / totalLeads).toFixed(2)}`
    : '';

  const tableText = buildInsightsTable(insights);
  const utmText = buildUTMStatus(utmAnalysis);
  const leadsAlertText = buildLeadsAlert(totalLeads);
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
        text: `*📊 Visão Geral (Hoje)* — ${insights.length} campanhas | *${totalLeads} leads*${cpl}${alertBanner}`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: tableText },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: leadsAlertText },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔗 Status das UTMs* — ${ok.length} url_tags OK, ${okCreative.length} UTMs nos criativos, ${brokenActive.length} ativas c/ problema${broken.length - brokenActive.length > 0 ? `, ${broken.length - brokenActive.length} pausadas` : ''}${semTracking > 0 ? `, ${semTracking} pendente` : ''}`,
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
        { type: 'mrkdwn', text: `Atualização a cada 2h | Meta Ads API + Groq llama-3.3-70b | Leads: Meta Ads (confira tb RD Station e MeeTIME)` },
      ],
    },
  ];

  for (let i = 1; i < aiChunks.length; i++) {
    blocks.splice(-1, 0, {
      type: 'section',
      text: { type: 'mrkdwn', text: aiChunks[i] },
    });
  }

  return blocks;
}
