import { supabase } from '@/lib/supabase';
import { WebClient } from '@slack/web-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks = {};

  try {
    const { error } = await supabase.from('leads').select('lead_id').limit(1);
    checks.supabase = error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    checks.supabase = { ok: false, error: err.message };
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
