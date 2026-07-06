const SHEET_ID = '1Z3PHa2u_r5r6vKTbzRjrXX8N2XaBZpEiNDlc8WLwCHo';
const SHEET_NAME = 'Leads';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`;

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

export function analyzeSheetLeads(leads) {
  const total = leads.length;
  const meta = { count: 0, byCampaign: {}, byPlacement: {} };
  const google = { count: 0, byCampaign: {} };
  const others = { count: 0, byOrigin: {} };

  let noUtmSourceCount = 0;

  for (const lead of leads) {
    // Match exato: os anúncios são configurados com utm_source=meta / utm_source=google.
    const source = (lead.utm_source || '').trim().toLowerCase();
    if (!source) noUtmSourceCount++;

    let platform = 'others';
    if (source === 'meta' || source === 'facebook' || source === 'instagram') {
      platform = 'meta';
    } else if (source === 'google' || source === 'adwords') {
      platform = 'google';
    }

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
