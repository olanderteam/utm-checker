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
  if (!utms) return null; // null = sem UTMs (pode ser normal no nível de campanha)

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

export function analyzeUTMs(campaigns, adsets) {
  const broken = [];     // tem url_tags mas faltam parâmetros
  const ok = [];         // url_tags completas
  let semTracking = 0;   // sem url_tags em nenhum nível (verifique criativos)

  const adsetsByCampaign = {};
  for (const adset of adsets) {
    if (INACTIVE.has(adset.status)) continue;
    if (!adsetsByCampaign[adset.campaign_id]) adsetsByCampaign[adset.campaign_id] = [];
    adsetsByCampaign[adset.campaign_id].push(adset);
  }

  for (const campaign of campaigns) {
    if (INACTIVE.has(campaign.status)) continue;

    const campaignUTMs = extractUTMs(campaign.url_tags);
    const campaignValidation = validateUTMs(campaignUTMs);

    // Campanha tem url_tags → valida direto
    if (campaignValidation !== null) {
      const entry = { type: 'campaign', id: campaign.id, name: campaign.name, status: campaign.status, utms: campaignUTMs, ...campaignValidation };
      campaignValidation.valid ? ok.push(entry) : broken.push(entry);
      continue;
    }

    // Sem url_tags na campanha → verifica adsets
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

    if (adsetBroken) {
      broken.push(adsetBroken);
    } else if (adsetWithUTM) {
      ok.push(adsetWithUTM);
    } else {
      // Nenhum nível tem url_tags → UTMs devem estar nos criativos
      semTracking++;
    }
  }

  return { broken, ok, semTracking };
}
