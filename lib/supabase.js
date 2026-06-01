import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/\s+/g, '');

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

export async function getTodayLeads() {
  // Obter a data atual no fuso de São Paulo
  const nowInSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  
  // Criar a string de data no formato YYYY-MM-DD
  const year = nowInSP.getFullYear();
  const month = String(nowInSP.getMonth() + 1).padStart(2, '0');
  const day = String(nowInSP.getDate()).padStart(2, '0');
  const dateString = `${year}-${month}-${day}`;

  // Considerar o offset de São Paulo (geralmente UTC-3). 
  // Isso cria o ISO exato do momento 00:00:00 no Brasil, convertido para UTC para a query no banco.
  // Como o Brasil não tem mais horário de verão, o offset é fixo em -03:00.
  const startOfTodayISO = new Date(`${dateString}T00:00:00.000-03:00`).toISOString();
  const endOfTodayISO = new Date(`${dateString}T23:59:59.999-03:00`).toISOString();

  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .gte('date_created', startOfTodayISO)
    .lte('date_created', endOfTodayISO);

  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }

  return leads || [];
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
