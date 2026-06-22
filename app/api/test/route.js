import { postReport, postError } from '@/lib/slack-client';

export const runtime = 'nodejs';

export async function GET(request) {
  const auth = request.headers.get('Authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const timestamp = new Date().toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });

    // Mensagem de Manutenção
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '🔧 *UTM Bot - Aviso de Manutenção* 🔧\n\nO bot entrará em modo de manutenção para correções e melhorias. Os relatórios automáticos serão pausados temporariamente.',
        },
      },
    ];

    const result = await postReport(blocks);
    return Response.json({
      ok: true,
      message: 'Mensagem de manutenção enviada para o Slack.',
      slack_response: result,
      timestamp,
    });
  } catch (error) {
    console.error('[utm-bot] test error:', error);
    return Response.json({
      ok: false,
      error: error.message,
    }, { status: 500 });
  }
}
