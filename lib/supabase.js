import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s+/g, '');

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

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

    const { data, error } = await supabase
      .from('leads')
      .select('date_created, utm_source, utm_campaign')
      .gte('date_created', startOfTodayISO)
      .lte('date_created', endOfTodayISO)
      .range(from, to);

    if (error) {
      throw new Error(`Supabase query failed: ${error.message}`);
    }

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
  const meta = { count: 0, byCampaign: {} };
  const google = { count: 0, byCampaign: {} };
  const others = { count: 0, byCampaign: {} };

  for (const lead of leads) {
    // Determine platform from utm_source or utm_platform
    let platform = 'others';
    const source = (lead.utm_source || '').toLowerCase();
    
    if (source.includes('facebook') || source.includes('meta') || source.includes('ig') || source.includes('instagram')) {
      platform = 'meta';
    } else if (source.includes('google') || source.includes('adwords')) {
      platform = 'google';
    }

    const bucket = platform === 'google' ? google : platform === 'meta' ? meta : others;
    bucket.count++;

    const campaign = lead.utm_campaign || 'sem utm_campaign';
    bucket.byCampaign[campaign] = (bucket.byCampaign[campaign] || 0) + 1;
  }

  return { total, meta, google, others };
}
