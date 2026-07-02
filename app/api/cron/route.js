import { buildSlackBlocks } from '@/lib/formatter';
import { getTodayLeads, analyzeSupabaseLeads } from '@/lib/supabase';
import { postReport, postError } from '@/lib/slack-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const leads = await getTodayLeads();
    const leadsAnalysis = analyzeSupabaseLeads(leads);

    const timestamp = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const blocks = buildSlackBlocks(timestamp, leadsAnalysis);
    await postReport(blocks);

    return Response.json({
      ok: true,
      totalLeads: leadsAnalysis.total,
      metaLeads: leadsAnalysis.meta.count,
      googleLeads: leadsAnalysis.google.count,
      otherLeads: leadsAnalysis.others.count,
    });
  } catch (err) {
    console.error('[cron] erro:', err);
    await postError(err.message).catch(() => {});
    return Response.json({ error: err.message }, { status: 500 });
  }
}
