export default function Page() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem' }}>
      <h1>UTM Bot</h1>
      <p>Bot de monitoramento de UTMs e performance Meta Ads → Slack.</p>
      <ul>
        <li>Relatório automático a cada 2 horas via Vercel Cron</li>
        <li>Análise de UTMs por campanha e adset</li>
        <li>Performance do dia em formato de tabela</li>
        <li>Análise de IA com Groq (llama-3.3-70b)</li>
      </ul>
    </main>
  );
}
