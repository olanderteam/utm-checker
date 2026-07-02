import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s+/g, '');

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPageWithRetry(startOfTodayISO, endOfTodayISO, from, to) {
  let lastError;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const { data, error } = await supabase
      .from('leads')
      .select('date_created, utm_source, utm_campaign, utm_platform')
      .gte('date_created', startOfTodayISO)
      .lte('date_created', endOfTodayISO)
      .range(from, to);

    if (!error) {
      return data;
    }

    lastError = error;
    console.warn(`[supabase] Tentativa ${attempt}/${MAX_RETRIES} falhou: ${error.message}`);
    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  throw new Error(`Supabase query failed after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

export async function getTodayLeads() {
  // Obter a data atual no fuso de São Paulo no formato YYYY-MM-DD de forma robusta.
  // O formato 'fr-CA' (ou 'en-CA') retorna YYYY-MM-DD, ideal para criar strings de data ISO.
  const dateString = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Sao_Paulo'
  }).format(new Date());

  // Considerar o offset de São Paulo (geralmente UTC-3).
  // Isso cria o ISO exato do momento 00:00:00 no Brasil, convertido para UTC para a query no banco.
  // Como o Brasil não tem mais horário de verão, o offset é fixo em -03:00.
  const startOfTodayISO = new Date(`${dateString}T00:00:00.000-03:00`).toISOString();
  const endOfTodayISO = new Date(`${dateString}T23:59:59.999-03:00`).toISOString();

  const PAGE_SIZE = 1000;
  const MAX_PAGES = 20; // cinto de segurança: até 20k leads/dia antes de parar

  const leads = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const data = await fetchPageWithRetry(startOfTodayISO, endOfTodayISO, from, to);
    leads.push(...(data || []));

    if (!data || data.length < PAGE_SIZE) {
      break;
    }

    if (page === MAX_PAGES - 1) {
      console.warn(`[supabase] Atingido MAX_PAGES (${MAX_PAGES}) ao buscar leads do dia — dados podem estar incompletos.`);
    }
  }

  console.log(`[supabase] ${leads.length} leads encontrados para ${dateString}.`);

  return leads;
}

export function analyzeSupabaseLeads(leads) {
  const total = leads.length;
  const meta = { count: 0, byCampaign: {}, byPlacement: {} };
  const google = { count: 0, byCampaign: {} };
  const others = { count: 0, byCampaign: {} };

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

    const bucket = platform === 'google' ? google : platform === 'meta' ? meta : others;
    bucket.count++;

    const campaign = lead.utm_campaign || 'sem utm_campaign';
    bucket.byCampaign[campaign] = (bucket.byCampaign[campaign] || 0) + 1;

    if (platform === 'meta') {
      const placement = lead.utm_platform || 'sem placement';
      meta.byPlacement[placement] = (meta.byPlacement[placement] || 0) + 1;
    }
  }

  const noUtmRate = total > 0 ? noUtmSourceCount / total : 0;

  return { total, meta, google, others, noUtmSourceCount, noUtmRate };
}
