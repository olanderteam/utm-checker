const META_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${META_VERSION}`;
const MAX_PAGES = 10;

async function fetchAll(initialUrl) {
  const results = [];
  let url = initialUrl;
  let page = 0;

  while (url && page < MAX_PAGES) {
    const res = await fetch(url, { cache: 'no-store' });
    const data = await res.json();

    if (data.error) throw new Error(`Meta API: ${data.error.message}`);
    results.push(...(data.data || []));
    url = data.paging?.next || null;
    page++;
  }

  return results;
}

export async function getCampaignInsights(adAccountId, token) {
  const params = new URLSearchParams({
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,reach',
    date_preset: 'today',
    level: 'campaign',
    limit: '100',
    access_token: token,
  });

  return fetchAll(`${META_BASE}/act_${adAccountId}/insights?${params}`);
}

export async function getCampaignsWithUTMs(adAccountId, token) {
  const params = new URLSearchParams({
    fields: 'id,name,status,url_tags',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
    limit: '100',
    access_token: token,
  });

  return fetchAll(`${META_BASE}/act_${adAccountId}/campaigns?${params}`);
}

export async function getAdsetsWithUTMs(adAccountId, token) {
  const params = new URLSearchParams({
    fields: 'id,name,status,url_tags,campaign_id,campaign{name}',
    filtering: JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]),
    limit: '100',
    access_token: token,
  });

  return fetchAll(`${META_BASE}/act_${adAccountId}/adsets?${params}`);
}
