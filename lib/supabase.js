import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.");
}

export const supabase = createClient(supabaseUrl || '', supabaseKey || '');

export async function getTodayLeads() {
  const today = new Date().toLocaleDateString('sv', { timeZone: 'America/Sao_Paulo' });
  // The 'sv' locale gives YYYY-MM-DD format.
  // We need to query leads where date_created >= start of today and < start of tomorrow
  // Assuming date_created is a timestamp with time zone in UTC or local, we can use the date part.
  const startOfToday = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  startOfToday.setHours(0,0,0,0);
  
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .gte('date_created', startOfToday.toISOString())
    .lt('date_created', endOfToday.toISOString());

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
