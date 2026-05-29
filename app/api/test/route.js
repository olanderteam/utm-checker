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

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '✅ *UTM Bot - Teste de Funcionamento*\n\n_Conectado com sucesso!_',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Status:*\nFuncionando`,
          },
          {
            type: 'mrkdwn',
            text: `*Hora:*\n${timestamp}`,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '_Este é um teste de conexão com o Slack_ 🚀',
        },
      },
    ];

    const result = await postReport(blocks);

    return Response.json({
      ok: true,
      message: 'Mensagem de teste enviada para o Slack',
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
