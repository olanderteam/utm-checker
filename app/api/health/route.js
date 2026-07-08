import { WebClient } from '@slack/web-api';
import { getTodayLeads } from '@/lib/leadsSheet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks = {};

  try {
    const leads = await getTodayLeads();
    checks.leadsSheet = { ok: true, leadsToday: leads.length };
  } catch (err) {
    checks.leadsSheet = { ok: false, error: err.message };
  }

  try {
    const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
    const result = await slack.auth.test();
    checks.slack = { ok: true, team: result.team, bot: result.user };
  } catch (err) {
    checks.slack = { ok: false, error: err.message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return Response.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
}
