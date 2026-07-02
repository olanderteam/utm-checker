import { supabase } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dateString = new Intl.DateTimeFormat('fr-CA', {
    timeZone: 'America/Sao_Paulo'
  }).format(new Date());
  const startOfTodayISO = new Date(`${dateString}T00:00:00.000-03:00`).toISOString();
  const endOfTodayISO = new Date(`${dateString}T23:59:59.999-03:00`).toISOString();

  const targets = ['chatgpt.com', 'www.google.com', 'direto', 'cardapioweb.com', 'wpp'];

  const { data, error } = await supabase
    .from('leads')
    .select('date_created, utm_source, utm_medium, utm_campaign, utm_content, utm_adset, utm_ad, utm_platform, onde_nos_conheceu')
    .gte('date_created', startOfTodayISO)
    .lte('date_created', endOfTodayISO)
    .in('utm_source', targets)
    .limit(30);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, total: data.length, leads: data });
}
