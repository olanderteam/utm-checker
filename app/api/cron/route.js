import { getCampaignInsights, getCampaignsWithUTMs, getAdsetsWithUTMs, getAdsForCampaigns, extractLeadsFromInsight } from '@/lib/meta';
import { analyzeUTMs, getSemTrackingCampaignIds } from '@/lib/utm-checker';
import { buildSlackBlocks } from '@/lib/formatter';
import { analyzePerformance } from '@/lib/groq-client';
import { postReport, postError } from '@/lib/slack-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  const token = process.env.META_ACCESS_TOKEN;

  try {
    const [insights, campaigns, adsets] = await Promise.all([
      getCampaignInsights(adAccountId, token),
      getCampaignsWithUTMs(adAccountId, token),
      getAdsetsWithUTMs(adAccountId, token),
    ]);

    // Pass 1: find campaigns with no url_tags at any level → fetch their ads
    const semTrackingIds = getSemTrackingCampaignIds(campaigns, adsets);
    const ads = await getAdsForCampaigns(adAccountId, token, semTrackingIds);

    const insightsWithLeads = insights.map(r => ({
      ...r,
      leads: extractLeadsFromInsight(r),
    }));

    const totalLeads = insightsWithLeads.reduce((s, r) => s + r.leads, 0);
    const leadsData = { totalLeads };

    // Pass 2: full analysis with creative UTM validation
    const utmAnalysis = analyzeUTMs(campaigns, adsets, ads);
    const aiAnalysis = await analyzePerformance(insightsWithLeads, utmAnalysis, leadsData);

    const timestamp = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const blocks = buildSlackBlocks(insightsWithLeads, utmAnalysis, aiAnalysis, timestamp, leadsData);
    await postReport(blocks);

    return Response.json({
      ok: true,
      campaigns: insightsWithLeads.length,
      totalLeads,
      utmBroken: utmAnalysis.broken.length,
      utmOk: utmAnalysis.ok.length,
      utmOkCreative: utmAnalysis.okCreative.length,
      semTracking: utmAnalysis.semTracking,
    });
  } catch (err) {
    console.error('[utm-bot] cron error:', err);
    await postError(err.message).catch(() => {});
    return Response.json({ error: err.message }, { status: 500 });
  }
}
