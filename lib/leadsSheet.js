const SHEET_ID = '1Z3PHa2u_r5r6vKTbzRjrXX8N2XaBZpEiNDlc8WLwCHo';
// Usamos o gid (não o nome da aba) porque o gviz falha silenciosamente:
// se o nome não bater (ex: aba renomeada), ele cai de volta pra primeira
// aba da planilha em vez de dar erro — foi isso que causou o "0 SQLs".
// gid da aba "Leads n8n".
const SHEET_GID = '2058750780';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&gid=${SHEET_GID}`;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Parser de CSV simples que respeita campos entre aspas (com vírgulas/aspas escapadas dentro).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

async function fetchLeadsCsv() {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(CSV_URL);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ao buscar planilha de leads`);
      }
      const text = await res.text();
      const rows = parseCsv(text);
      const [header, ...dataRows] = rows;

      // O gviz cai silenciosamente na primeira aba da planilha se o gid/nome não bater.
      // Validar que veio o schema esperado evita reportar "0 SQLs" sem avisar ninguém.
      if (!header.includes('created_at') || !header.includes('utm_source')) {
        throw new Error(`Schema inesperado na planilha de leads (colunas: ${header.join(', ')}) — a aba pode ter sido renomeada ou o gid mudou.`);
      }

      return dataRows.map((cols) => {
        const lead = {};
        header.forEach((key, idx) => {
          lead[key] = cols[idx] ?? '';
        });
        return lead;
      });
    } catch (err) {
      lastError = err;
      console.warn(`[leadsSheet] Tentativa ${attempt}/${MAX_RETRIES} falhou: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw new Error(`Falha ao buscar planilha de leads após ${MAX_RETRIES} tentativas: ${lastError.message}`);
}

// Retorna a data (DD/MM/AAAA) no fuso de São Paulo, `daysAgo` dias atrás de hoje.
export function getSaoPauloDateDDMMYYYY(daysAgo = 0) {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() - daysAgo);
  const parts = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('day')}/${get('month')}/${get('year')}`;
}

function getLeadDateDDMMYYYY(lead) {
  // created_at está no formato "DD/MM/AAAA HH:MM[:SS]"
  const datePart = (lead.created_at || '').split(' ')[0];
  return datePart;
}

async function getLeadsForDDMMYYYY(dateString) {
  const allLeads = await fetchLeadsCsv();

  const leadsForDay = allLeads.filter((lead) => getLeadDateDDMMYYYY(lead) === dateString);

  // Conta só a primeira submissão de cada lead (duplicata=1), para não inflar
  // o total com reenvios da mesma pessoa no mesmo formulário.
  const uniqueLeads = leadsForDay.filter((lead) => (lead['duplicata?'] || '1').trim() === '1');

  console.log(`[leadsSheet] ${leadsForDay.length} linhas para ${dateString} (${uniqueLeads.length} únicas, ${leadsForDay.length - uniqueLeads.length} reenvios).`);

  return uniqueLeads;
}

export async function getTodayLeads() {
  return getLeadsForDDMMYYYY(getSaoPauloDateDDMMYYYY(0));
}

export async function getYesterdayLeads() {
  return getLeadsForDDMMYYYY(getSaoPauloDateDDMMYYYY(1));
}

// Classifica um utm_source de tráfego não pago em um rótulo legível de origem.
function classifyOrganicOrigin(source) {
  if (!source) return 'Direto / sem origem';
  if (source === 'direto') return 'Direto / sem origem';
  if (source.includes('google')) return 'Google (orgânico)';
  if (source.includes('bing')) return 'Bing (orgânico)';
  if (source.includes('yahoo')) return 'Yahoo (orgânico)';
  if (source.includes('chatgpt') || source.includes('openai')) return 'ChatGPT';
  if (source.includes('perplexity')) return 'Perplexity';
  if (source.includes('duckduckgo')) return 'DuckDuckGo (orgânico)';
  if (source.includes('cardapioweb.com')) return 'Navegação interna do site';
  if (source.includes('instagram') || source.includes('link_na_bio')) return 'Instagram (link na bio)';
  if (source.includes('wpp') || source.includes('whatsapp')) return 'WhatsApp';
  return source;
}

function classifyPlatform(lead) {
  const source = (lead.utm_source || '').trim().toLowerCase();
  if (source === 'meta' || source === 'facebook' || source === 'instagram') return 'meta';
  if (source === 'google' || source === 'adwords') return 'google';
  return 'others';
}

export function analyzeSheetLeads(leads) {
  const total = leads.length;
  const meta = { count: 0, byCampaign: {}, byPlacement: {} };
  const google = { count: 0, byCampaign: {} };
  const others = { count: 0, byOrigin: {} };

  let noUtmSourceCount = 0;

  for (const lead of leads) {
    const source = (lead.utm_source || '').trim().toLowerCase();
    if (!source) noUtmSourceCount++;

    const platform = classifyPlatform(lead);

    if (platform === 'others') {
      others.count++;
      const origin = classifyOrganicOrigin(source);
      others.byOrigin[origin] = (others.byOrigin[origin] || 0) + 1;
      continue;
    }

    const bucket = platform === 'google' ? google : meta;
    bucket.count++;

    const campaign = lead.utm_campaign || 'sem utm_campaign';
    bucket.byCampaign[campaign] = (bucket.byCampaign[campaign] || 0) + 1;

    if (platform === 'meta') {
      const placement = lead.utm_placement || 'sem placement';
      meta.byPlacement[placement] = (meta.byPlacement[placement] || 0) + 1;
    }
  }

  const noUtmRate = total > 0 ? noUtmSourceCount / total : 0;

  return { total, meta, google, others, noUtmSourceCount, noUtmRate };
}

// Parâmetros de UTM dinâmicos que o Google/Meta deveriam substituir pelo valor real
// (ex: {campaignid}, {{ad.name}}). Quando aparecem literais, a tag de rastreio está quebrada.
const DYNAMIC_TOKEN_REGEX = /\{\{?[a-z_.]+\}?\}/i;
const UTM_FIELDS_TO_CHECK = ['utm_campaign', 'utm_content', 'utm_term', 'utm_ad', 'utm_adset'];

const MIN_SAMPLE_SIZE = 5;
const PLACEMENT_FAILURE_THRESHOLD = 0.5;
const DYNAMIC_TOKEN_THRESHOLD = 0.1;
const DIRECT_ORIGIN_THRESHOLD = 0.1;

function findBrokenDynamicField(lead) {
  for (const field of UTM_FIELDS_TO_CHECK) {
    const value = lead[field];
    if (value && DYNAMIC_TOKEN_REGEX.test(value)) {
      return value;
    }
  }
  return null;
}

// Analisa os leads brutos e retorna só os pontos que merecem atenção humana,
// em vez do detalhamento completo por campanha/origem.
export function detectAttentionPoints(leads) {
  const total = leads.length;
  if (total === 0) return [];

  const points = [];

  const byPlatform = { meta: [], google: [] };
  for (const lead of leads) {
    const platform = classifyPlatform(lead);
    if (platform === 'meta' || platform === 'google') {
      byPlatform[platform].push(lead);
    }
  }

  // 1) Placement (fb/ig) falhando por campanha do Meta.
  const metaByCampaign = {};
  for (const lead of byPlatform.meta) {
    const campaign = lead.utm_campaign || 'sem utm_campaign';
    if (!metaByCampaign[campaign]) metaByCampaign[campaign] = { count: 0, missingPlacement: 0 };
    metaByCampaign[campaign].count++;
    if (!lead.utm_placement) metaByCampaign[campaign].missingPlacement++;
  }
  for (const [campaign, stats] of Object.entries(metaByCampaign)) {
    if (stats.count < MIN_SAMPLE_SIZE) continue;
    const rate = stats.missingPlacement / stats.count;
    if (rate > PLACEMENT_FAILURE_THRESHOLD) {
      points.push(
        `📱 Em Meta, a campanha *${campaign}* está com o *placement* falhando em *${Math.round(rate * 100)}%* dos leads (${stats.missingPlacement}/${stats.count}).`
      );
    }
  }

  // 2) UTM dinâmica não substituída (ex: {campaignname}), por plataforma.
  for (const platform of ['meta', 'google']) {
    const platformLeads = byPlatform[platform];
    if (platformLeads.length === 0) continue;

    let brokenCount = 0;
    let example = null;
    for (const lead of platformLeads) {
      const broken = findBrokenDynamicField(lead);
      if (broken) {
        brokenCount++;
        if (!example) example = broken;
      }
    }
    const rate = brokenCount / platformLeads.length;
    if (rate > DYNAMIC_TOKEN_THRESHOLD) {
      const label = platform === 'meta' ? 'Meta' : 'Google';
      points.push(
        `⚠️ ${label} tem *${Math.round(rate * 100)}%* dos leads com erro na substituição de UTM dinâmica (ex: \`${example}\`).`
      );
    }
  }

  // 3) Origem direta em volume relevante.
  const directCount = leads.filter((lead) => {
    const source = (lead.utm_source || '').trim().toLowerCase();
    return classifyPlatform(lead) === 'others' && (!source || source === 'direto');
  }).length;
  const directRate = directCount / total;
  if (directRate > DIRECT_ORIGIN_THRESHOLD) {
    points.push(
      `🌐 *${Math.round(directRate * 100)}%* dos leads chegam de origem direta (${directCount}/${total}) — vale identificar se dá pra rastrear melhor.`
    );
  }

  return points;
}
