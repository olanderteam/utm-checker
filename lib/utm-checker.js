const META_DYNAMIC_RE = /\{\{[^}]+\}\}/;
const REQUIRED_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign'];
const INACTIVE = new Set(['DELETED', 'ARCHIVED']);

export function extractUTMs(urlTags) {
  if (!urlTags) return null;
  try {
    const params = new URLSearchParams(urlTags);
    const utms = {};
    for (const [key, value] of params.entries()) {
      if (key.startsWith('utm_')) utms[key] = value;
    }
    return Object.keys(utms).length ? utms : null;
  } catch {
    return null;
  }
}

export function validateUTMs(utms) {
  if (!utms) return null;

  const missing = REQUIRED_PARAMS.filter(p => !utms[p]);
  if (missing.length) {
    return { valid: false, reason: `Parâmetros ausentes: ${missing.join(', ')}` };
  }

  const hasDynamic = Object.values(utms).some(v => META_DYNAMIC_RE.test(v));
  return {
    valid: true,
    dynamic: hasDynamic,
    reason: hasDynamic ? 'UTMs OK (valores dinâmicos Meta)' : 'UTMs OK',
  };
}

function extractURLsFromCreative(creative) {
  if (!creative) return [];
  const urls = [];
  const spec = creative.object_story_spec;
  if (spec?.link_data?.link) urls.push(spec.link_data.link);
  if (spec?.link_data?.call_to_action?.value?.link) urls.push(spec.link_data.call_to_action.value.link);
  if (spec?.video_data?.call_to_action?.value?.link) urls.push(spec.video_data.call_to_action.value.link);
  const feedUrls = creative.asset_feed_spec?.link_urls;
  if (Array.isArray(feedUrls)) {
    for (const u of feedUrls) {
      if (u.website_url) urls.push(u.website_url);
    }
  }
  return urls;
}

function adHasUTMs(ad) {
  // 1. Check creative url_tags
  const urlTags = ad.creative?.url_tags;
  if (urlTags) {
    const utms = extractUTMs(urlTags);
    const validation = validateUTMs(utms);
    if (validation?.valid) return true;
  }
  // 2. Check UTMs embedded directly in destination URLs
  const urls = extractURLsFromCreative(ad.creative);
  for (const url of urls) {
    if (url.includes('utm_source=') && url.includes('utm_medium=') && url.includes('utm_campaign=')) {
      return true;
    }
  }
  return false;
}

export function analyzeUTMs(campaigns, adsets, ads = []) {
  const broken = [];
  const ok = [];
  const okCreative = [];  // UTMs confirmados nos criativos (não em url_tags)
  let semTracking = 0;    // sem UTMs em absolutamente nenhum lugar

  const adsetsByCampaign = {};
  for (const adset of adsets) {
    if (INACTIVE.has(adset.status)) continue;
    if (!adsetsByCampaign[adset.campaign_id]) adsetsByCampaign[adset.campaign_id] = [];
    adsetsByCampaign[adset.campaign_id].push(adset);
  }

  const adsByCampaign = {};
  for (const ad of ads) {
    if (INACTIVE.has(ad.status)) continue;
    if (!adsByCampaign[ad.campaign_id]) adsByCampaign[ad.campaign_id] = [];
    adsByCampaign[ad.campaign_id].push(ad);
  }

  for (const campaign of campaigns) {
    if (INACTIVE.has(campaign.status)) continue;

    const campaignUTMs = extractUTMs(campaign.url_tags);
    const campaignValidation = validateUTMs(campaignUTMs);

    if (campaignValidation !== null) {
      const entry = { type: 'campaign', id: campaign.id, name: campaign.name, status: campaign.status, utms: campaignUTMs, ...campaignValidation };
      campaignValidation.valid ? ok.push(entry) : broken.push(entry);
      continue;
    }

    const relatedAdsets = adsetsByCampaign[campaign.id] || [];
    let adsetWithUTM = null;
    let adsetBroken = null;

    for (const adset of relatedAdsets) {
      const adsetUTMs = extractUTMs(adset.url_tags);
      const adsetValidation = validateUTMs(adsetUTMs);
      if (adsetValidation === null) continue;

      if (adsetValidation.valid) {
        adsetWithUTM = { type: 'adset', id: adset.id, name: adset.name, campaignName: campaign.name, status: adset.status, utms: adsetUTMs, ...adsetValidation };
      } else {
        adsetBroken = { type: 'adset', id: adset.id, name: adset.name, campaignName: campaign.name, status: adset.status, utms: adsetUTMs, ...adsetValidation };
      }
    }

    if (adsetBroken) { broken.push(adsetBroken); continue; }
    if (adsetWithUTM) { ok.push(adsetWithUTM); continue; }

    // Sem url_tags em nenhum nível — verificar criativos
    const campaignAds = adsByCampaign[campaign.id] || [];
    if (campaignAds.length > 0) {
      if (campaignAds.some(adHasUTMs)) {
        okCreative.push({ type: 'campaign', id: campaign.id, name: campaign.name, status: campaign.status });
      } else {
        // Anúncios existem mas sem UTMs em nenhum lugar — problema real
        broken.push({
          type: 'campaign', id: campaign.id, name: campaign.name, status: campaign.status,
          valid: false, reason: 'Sem UTMs: nem url_tags, nem nos criativos',
        });
      }
    } else {
      // Ads não foram buscados para essa campanha (não estava em semTracking pass)
      semTracking++;
    }
  }

  return { broken, ok, okCreative, semTracking };
}

// Returns campaign IDs that have no url_tags at campaign or adset level.
// Used to know which campaigns need their ads fetched for creative UTM check.
export function getSemTrackingCampaignIds(campaigns, adsets) {
  const adsetsByCampaign = {};
  for (const adset of adsets) {
    if (INACTIVE.has(adset.status)) continue;
    if (!adsetsByCampaign[adset.campaign_id]) adsetsByCampaign[adset.campaign_id] = [];
    adsetsByCampaign[adset.campaign_id].push(adset);
  }

  const ids = [];
  for (const campaign of campaigns) {
    if (INACTIVE.has(campaign.status)) continue;
    if (extractUTMs(campaign.url_tags)) continue;

    const relatedAdsets = adsetsByCampaign[campaign.id] || [];
    const adsetHasUTM = relatedAdsets.some(a => extractUTMs(a.url_tags));
    if (!adsetHasUTM) ids.push(campaign.id);
  }
  return ids;
}
