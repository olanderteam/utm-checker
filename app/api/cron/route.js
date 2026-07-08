import { buildSlackBlocks } from '@/lib/formatter';
import { getTodayLeads, getYesterdayLeads, analyzeSheetLeads, detectAttentionPoints, getSaoPauloDateDDMMYYYY } from '@/lib/leadsSheet';
import { postReport, postError } from '@/lib/slack-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Primeiro disparo do dia (08h Brasília): reporta o fechamento do dia anterior,
// já que às 08h o dia corrente ainda não teve tempo de gerar leads relevantes.
const FIRST_RUN_HOUR = 8;

// Janela de observação de 5 dias após o bug do "0 SQLs" (aba da planilha renomeada).
// Enquanto ativa, o relatório é marcado como "Modo de Correção" para facilitar o
// acompanhamento de perto. Ver commit a8f70f7 para o detalhe da correção.
const CORRECTION_MODE_START = '2026-07-08';
const CORRECTION_MODE_DAYS = 5;

function isCorrectionModeActive() {
  const todayISO = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const start = new Date(`${CORRECTION_MODE_START}T00:00:00-03:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + CORRECTION_MODE_DAYS);
  const today = new Date(`${todayISO}T00:00:00-03:00`);
  return today >= start && today < end;
}

export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const forcedPeriod = url.searchParams.get('period'); // 'today' | 'yesterday', para testes manuais

    const currentHour = Number(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        hour12: false,
      }).format(new Date())
    );

    const isFirstRun = forcedPeriod ? forcedPeriod === 'yesterday' : currentHour === FIRST_RUN_HOUR;
    const leads = isFirstRun ? await getYesterdayLeads() : await getTodayLeads();
    const leadsAnalysis = analyzeSheetLeads(leads);
    const attentionPoints = detectAttentionPoints(leads);

    const timestamp = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

    const referenceDate = isFirstRun ? getSaoPauloDateDDMMYYYY(1) : getSaoPauloDateDDMMYYYY(0);

    const blocks = buildSlackBlocks(timestamp, leadsAnalysis, attentionPoints, {
      periodLabel: isFirstRun ? `ontem (${referenceDate})` : `hoje (${referenceDate})`,
      headerTitle: isFirstRun
        ? `🎯 Fechamento de Ontem (${referenceDate}) — [OKR][2025Q4]`
        : `🎯 SQLs do Dia (${referenceDate}) — [OKR][2025Q4]`,
      correctionMode: isCorrectionModeActive(),
    });
    await postReport(blocks);

    return Response.json({
      ok: true,
      period: isFirstRun ? 'yesterday' : 'today',
      referenceDate,
      totalLeads: leadsAnalysis.total,
      metaLeads: leadsAnalysis.meta.count,
      googleLeads: leadsAnalysis.google.count,
      otherLeads: leadsAnalysis.others.count,
      attentionPoints,
      correctionMode: isCorrectionModeActive(),
    });
  } catch (err) {
    console.error('[cron] erro:', err);
    await postError(err.message).catch(() => {});
    return Response.json({ error: err.message }, { status: 500 });
  }
}
