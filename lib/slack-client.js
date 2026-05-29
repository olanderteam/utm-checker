import { WebClient } from '@slack/web-api';

function getClient() {
  return new WebClient(process.env.SLACK_BOT_TOKEN);
}

export async function postReport(blocks) {
  const slack = getClient();
  return slack.chat.postMessage({
    channel: process.env.SLACK_CHANNEL_ID,
    blocks,
    // Fallback text para notificações push
    text: '📡 UTM Bot Report — Meta Ads',
    unfurl_links: false,
    unfurl_media: false,
  });
}

export async function postApproval(text) {
  const slack = getClient();
  // Uses SLACK_APPROVAL_CHANNEL_ID if set, otherwise same channel as report
  const channel = process.env.SLACK_APPROVAL_CHANNEL_ID || process.env.SLACK_CHANNEL_ID;
  return slack.chat.postMessage({
    channel,
    text,
    unfurl_links: false,
  });
}

export async function postError(message) {
  const slack = getClient();
  return slack.chat.postMessage({
    channel: process.env.SLACK_CHANNEL_ID,
    text: `❌ *UTM Bot erro:* ${message}`,
  });
}
