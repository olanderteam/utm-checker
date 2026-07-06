import { WebClient } from '@slack/web-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SHEET_ID = '1Z3PHa2u_r5r6vKTbzRjrXX8N2XaBZpEiNDlc8WLwCHo';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=Leads`;

export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const checks = {};

  try {
    const res = await fetch(CSV_URL);
    checks.leadsSheet = res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
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
