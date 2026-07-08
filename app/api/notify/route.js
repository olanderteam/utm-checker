import { postError } from '@/lib/slack-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const message = '🔧 *UTM Bot em Modo de Correção* 🔧\n\nDetectamos um relatório com "0 SQLs" que parece incorreto. Estamos investigando e corrigindo agora — mensagens neste período podem conter erros. Avisamos assim que o problema for resolvido.';

  try {
    await postError(message);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
