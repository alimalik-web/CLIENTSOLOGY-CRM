import { GLOBAL_COUNTRIES } from '../data/globalMarkets';
import { OPERATING_NICHES } from '../data/operatingNiches';
import { addDaysUtc, ensureHttpUrl, getLocalIsoDate } from './appUtils';
import { CountryMarket, LeadQuality, OperatingNiche, Prospect } from '../types/crm';

export interface ParsedLinkedInSearchUrl {
  isValidLinkedInUrl: boolean;
  isSearchUrl: boolean;
  searchType: 'people' | 'companies' | 'all';
  keywords: string;
  titleFilter: string;
  companyFilter: string;
  geoUrns: string[];
  resolvedLocation: string;
  networkDepth: string;
  normalizedUrl: string;
  warning?: string;
}

export interface ScrapedLinkedInProfile {
  profileId: string;
  fullName: string;
  roleTitle: string;
  companyName: string;
  location: string;
  city: string;
  stateOrRegion: string;
  country: string;
  niche: string;
  linkedinUrl: string;
  website: string;
  headline: string;
  summary: string;
  opportunitySignal: string;
  leadQuality: LeadQuality;
}

export interface LinkedInSearchPreset {
  id: string;
  label: string;
  niche: string;
  location: string;
  url: string;
}

export const LINKEDIN_GEO_URN_MAP: Record<string, string> = {
  '103644278': 'United States',
  '101165590': 'United Kingdom',
  '104305776': 'United Arab Emirates',
  '101282230': 'Germany',
  '101022442': 'Pakistan',
  '100459316': 'Saudi Arabia (KSA)',
  '105015875': 'France',
  '102890719': 'Netherlands',
  '104738515': 'Ireland',
  '100565514': 'Belgium',
  '103883259': 'Austria',
  '105117694': 'Sweden',
  '104514075': 'Denmark',
  '100456013': 'Finland',
  '105646813': 'Spain',
  '103350119': 'Italy',
  '100364837': 'Portugal',
  '105072130': 'Poland',
  '104677530': 'Greece',
  '102105699': 'Turkey',
  // Major Cities
  '102571732': 'New York, United States',
  '102448103': 'Los Angeles, United States',
  '103112676': 'Chicago, United States',
  '102394087': 'Miami, United States',
  '103759029': 'Houston, United States',
  '104472865': 'Austin, United States',
  '102277331': 'San Francisco, United States',
  '90000084': 'San Francisco Bay Area, United States',
  '104116203': 'Dallas, United States',
  '106224388': 'Charlotte, United States',
  '104979702': 'Scottsdale / Phoenix, United States',
  '90009496': 'London, United Kingdom',
  '102257491': 'London, United Kingdom',
  '101318387': 'Manchester, United Kingdom',
  '100488509': 'Dubai, United Arab Emirates',
  '105117309': 'Riyadh, Saudi Arabia (KSA)',
  '103978481': 'Lahore, Pakistan',
  '105485641': 'Karachi, Pakistan',
  '100994331': 'Berlin, Germany',
  '100477049': 'Munich, Germany',
  '104804982': 'Stuttgart, Germany',
  '102011674': 'Amsterdam, Netherlands',
};

export const LINKEDIN_SEARCH_PRESETS: LinkedInSearchPreset[] = [
  {
    id: 'li-hvac-charlotte',
    label: 'HVAC Owners · Charlotte, USA',
    niche: 'HVAC & Plumbing Contractors',
    location: 'Charlotte, North Carolina, United States',
    url: 'https://www.linkedin.com/search/results/people/?keywords=HVAC%20Owner%20Charlotte&geoUrn=%5B%22106224388%22%5D&origin=GLOBAL_SEARCH_HEADER',
  },
  {
    id: 'li-dentist-uk',
    label: 'Cosmetic Dentists · London, UK',
    niche: 'Cosmetic & Implant Dentistry',
    location: 'London, United Kingdom',
    url: 'https://www.linkedin.com/search/results/people/?keywords=Cosmetic%20Dentist%20Principal%20London&geoUrn=%5B%22102257491%22%5D&origin=GLOBAL_SEARCH_HEADER',
  },
  {
    id: 'li-medspa-dubai',
    label: 'Med-Spa Directors · Dubai, UAE',
    niche: 'Med-Spas & Aesthetic Clinics',
    location: 'Dubai, United Arab Emirates',
    url: 'https://www.linkedin.com/search/results/people/?keywords=Medical%20Spa%20Aesthetic%20Clinic%20Founder%20Dubai&geoUrn=%5B%22100488509%22%5D&origin=GLOBAL_SEARCH_HEADER',
  },
  {
    id: 'li-law-austin',
    label: 'Law Firm Partners · Austin, TX',
    niche: 'Law Firms & Personal Injury',
    location: 'Austin, Texas, United States',
    url: 'https://www.linkedin.com/search/results/people/?keywords=Managing%20Partner%20Law%20Firm%20Austin&geoUrn=%5B%22104472865%22%5D&origin=GLOBAL_SEARCH_HEADER',
  },
  {
    id: 'li-mfg-stuttgart',
    label: 'B2B Manufacturing · Stuttgart, DE',
    niche: 'B2B Manufacturing, Logistics & Industrial',
    location: 'Stuttgart, Germany',
    url: 'https://www.linkedin.com/search/results/companies/?keywords=CNC%20Manufacturing%20Stuttgart&geoUrn=%5B%22104804982%22%5D&origin=GLOBAL_SEARCH_HEADER',
  },
];

function parseJsonOrBracketArray(raw: string | null): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v).replace(/[^a-zA-Z0-9_-]/g, '')).filter(Boolean);
    }
  } catch {
    // Fallback regex extraction for partial URNs
  }
  const matches = trimmed.match(/\d{5,12}/g);
  return matches ? Array.from(new Set(matches)) : [];
}

function extractSalesNavParam(rawQueryParam: string | null, fieldName: string): string {
  if (!rawQueryParam) return '';
  const regex = new RegExp(`${fieldName}\\s*:\\s*([^,)]+)`, 'i');
  const m = rawQueryParam.match(regex);
  if (!m) return '';
  return decodeURIComponent(m[1]).replace(/['"]/g, '').trim();
}

export function parseLinkedInSearchUrl(rawUrl: string): ParsedLinkedInSearchUrl {
  const cleaned = rawUrl.trim();
  if (!cleaned) {
    return {
      isValidLinkedInUrl: false,
      isSearchUrl: false,
      searchType: 'people',
      keywords: '',
      titleFilter: '',
      companyFilter: '',
      geoUrns: [],
      resolvedLocation: '',
      networkDepth: '',
      normalizedUrl: '',
    };
  }

  const normalizedUrl = ensureHttpUrl(cleaned);
  if (!normalizedUrl) {
    return {
      isValidLinkedInUrl: false,
      isSearchUrl: false,
      searchType: 'people',
      keywords: '',
      titleFilter: '',
      companyFilter: '',
      geoUrns: [],
      resolvedLocation: '',
      networkDepth: '',
      normalizedUrl: '',
      warning: 'Enter a valid https://www.linkedin.com/search/... URL.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return {
      isValidLinkedInUrl: false,
      isSearchUrl: false,
      searchType: 'people',
      keywords: '',
      titleFilter: '',
      companyFilter: '',
      geoUrns: [],
      resolvedLocation: '',
      networkDepth: '',
      normalizedUrl: '',
      warning: 'Unable to parse URL structure.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  const isLinkedInHost = host === 'linkedin.com' || host.endsWith('.linkedin.com');
  if (!isLinkedInHost) {
    return {
      isValidLinkedInUrl: false,
      isSearchUrl: false,
      searchType: 'people',
      keywords: '',
      titleFilter: '',
      companyFilter: '',
      geoUrns: [],
      resolvedLocation: '',
      networkDepth: '',
      normalizedUrl,
      warning: 'URL must be on linkedin.com (e.g. https://www.linkedin.com/search/results/people/...).',
    };
  }

  const pathLower = parsed.pathname.toLowerCase();
  const searchType: 'people' | 'companies' | 'all' = pathLower.includes('compan')
    ? 'companies'
    : pathLower.includes('/people')
      ? 'people'
      : 'all';

  const isSearchUrl =
    pathLower.includes('/search/') ||
    pathLower.includes('/sales/search') ||
    parsed.searchParams.has('keywords');

  const salesQuery = parsed.searchParams.get('query');
  const keywords =
    parsed.searchParams.get('keywords')?.trim() ||
    extractSalesNavParam(salesQuery, 'keywords') ||
    '';
  const titleFilter =
    parsed.searchParams.get('titleFreeText')?.trim() ||
    extractSalesNavParam(salesQuery, 'title') ||
    '';
  const companyFilter = parsed.searchParams.get('company')?.trim() || '';

  const geoUrns = [
    ...parseJsonOrBracketArray(parsed.searchParams.get('geoUrn')),
    ...parseJsonOrBracketArray(parsed.searchParams.get('facetGeoRegion')),
  ];
  const uniqueGeoUrns = Array.from(new Set(geoUrns));
  const resolvedLocations = uniqueGeoUrns
    .map((urn) => LINKEDIN_GEO_URN_MAP[urn])
    .filter(Boolean);

  const networkList = parseJsonOrBracketArray(parsed.searchParams.get('network'));

  return {
    isValidLinkedInUrl: true,
    isSearchUrl,
    searchType,
    keywords,
    titleFilter,
    companyFilter,
    geoUrns: uniqueGeoUrns,
    resolvedLocation: resolvedLocations.join('; '),
    networkDepth: networkList.join(', '),
    normalizedUrl,
    warning: !isSearchUrl
      ? 'This looks like a LinkedIn profile/page URL rather than a search URL; you can still refine niche & location below.'
      : undefined,
  };
}

export function buildLinkedInSearchUrl(keywords: string, searchType: 'people' | 'companies' = 'people'): string {
  const path = searchType === 'companies' ? 'companies' : 'people';
  const q = encodeURIComponent(keywords.trim());
  return `https://www.linkedin.com/search/results/${path}/?keywords=${q}&origin=GLOBAL_SEARCH_HEADER`;
}

export function normalizeLinkedInUrlKey(url: string): string {
  const safe = ensureHttpUrl(url);
  if (!safe) return '';
  try {
    const parsed = new URL(safe);
    const cleanPath = parsed.pathname.replace(/\/+$/, '').toLowerCase();
    return `${parsed.hostname.replace(/^www\./, '').toLowerCase()}${cleanPath}`;
  } catch {
    return safe.toLowerCase();
  }
}

function matchCountry(countryInput: string, locationInput: string): CountryMarket {
  const combined = `${countryInput} ${locationInput}`.toLowerCase();
  const direct = GLOBAL_COUNTRIES.find(
    (c) =>
      combined.includes(c.name.toLowerCase()) ||
      (c.id === 'usa' && (/\busa\b|\bu\.s\.|\bunited states\b/.test(combined) || /,\s*[a-z]{2}\b/i.test(locationInput))) ||
      (c.id === 'uk' && /\buk\b|\bunited kingdom\b|\bengland\b|\blondon\b|\bmanchester\b/.test(combined)) ||
      (c.id === 'uae' && /\buae\b|\bdubai\b|\babu dhabi\b/.test(combined)) ||
      (c.id === 'ksa' && /\bksa\b|\bsaudi\b|\briyadh\b|\bjeddah\b/.test(combined))
  );
  if (direct) return direct;

  // Try matching any mapped city across all countries
  for (const country of GLOBAL_COUNTRIES) {
    for (const st of country.statesOrRegions) {
      if (st.cities.some((ct) => combined.includes(ct.name.toLowerCase()))) {
        return country;
      }
    }
  }
  return GLOBAL_COUNTRIES[0];
}

function matchOperatingNiche(nicheInput: string): OperatingNiche | undefined {
  const q = nicheInput.trim().toLowerCase();
  if (!q) return undefined;
  return OPERATING_NICHES.find((n) => {
    const nameLower = n.name.toLowerCase();
    return (
      nameLower.includes(q) ||
      q.includes(nameLower) ||
      (q.includes('hvac') && n.id === 'hvac-plumbing') ||
      (q.includes('plumb') && n.id === 'hvac-plumbing') ||
      (q.includes('dent') && n.id === 'cosmetic-dentistry') ||
      ((q.includes('med spa') || q.includes('med-spa') || q.includes('aestheti')) && n.id === 'med-spas') ||
      ((q.includes('law') || q.includes('attorney') || q.includes('legal')) && n.id === 'law-firms') ||
      (q.includes('roof') && n.id === 'roofing-restoration') ||
      ((q.includes('build') || q.includes('remodel')) && n.id === 'custom-builders') ||
      ((q.includes('cpa') || q.includes('wealth') || q.includes('account')) && n.id === 'wealth-cpas') ||
      ((q.includes('manufact') || q.includes('cnc') || q.includes('b2b')) && n.id === 'b2b-industrial')
    );
  });
}

export function buildProspectIdFromLinkedIn(profile: ScrapedLinkedInProfile): string {
  const urlKey = normalizeLinkedInUrlKey(profile.linkedinUrl);
  const slug = (urlKey.split('/').pop() || profile.profileId || `${profile.fullName}-${profile.companyName}`)
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 22);
  return `p-li-${slug || Date.now().toString()}`;
}

export function mapLinkedInProfileToProspect(
  profile: ScrapedLinkedInProfile,
  fallbackNiche: string,
  fallbackLocation: string
): Prospect {
  const today = getLocalIsoDate();
  const nextFollowUp = addDaysUtc(today, 2);
  const matchedCountry = matchCountry(profile.country, `${profile.location} ${fallbackLocation}`);
  const effectiveNicheLabel = profile.niche || fallbackNiche || 'B2B Local Business';
  const matchedNiche = matchOperatingNiche(effectiveNicheLabel);

  const countryMid = (matchedCountry.retainerRangeUsd[0] + matchedCountry.retainerRangeUsd[1]) / 2;
  const nicheMid = matchedNiche
    ? (matchedNiche.baseRetainerUsd[0] + matchedNiche.baseRetainerUsd[1]) / 2
    : countryMid;
  const ticketUsd = Math.max(250, Math.round(((countryMid + nicheMid) / 2) / 50) * 50);

  const city =
    profile.city ||
    profile.location.split(',')[0]?.trim() ||
    matchedCountry.statesOrRegions[0]?.cities[0]?.name ||
    matchedCountry.name;

  const serviceInterest = matchedNiche
    ? `${matchedNiche.offerStack.seo.split('+')[0].trim()} + ${matchedNiche.offerStack.automation.split('+')[0].trim()}`
    : !profile.website
      ? `Authority Website + Local SEO (${effectiveNicheLabel})`
      : 'Conversion Web + Local SEO & AI Lead Setter';

  return {
    id: buildProspectIdFromLinkedIn(profile),
    businessName: profile.companyName || `${profile.fullName} Advisory`,
    contactPerson: profile.fullName || 'Decision Maker',
    roleTitle: profile.roleTitle || 'Owner / Executive',
    email: '',
    phone: '',
    website: ensureHttpUrl(profile.website),
    linkedinUrl: ensureHttpUrl(profile.linkedinUrl),
    country: profile.country || matchedCountry.name,
    stateOrRegion: profile.stateOrRegion || matchedCountry.statesOrRegions[0]?.name || '',
    city,
    categoryNiche: matchedNiche?.name || effectiveNicheLabel,
    leadQuality: profile.leadQuality || 'Warm',
    stage: 'New Lead',
    serviceInterest,
    ticketUsd,
    dateAdded: today,
    nextFollowUp,
    lastContacted: '',
    lastMessageSent: '',
    replyNotes: [
      `Imported from LinkedIn: ${profile.linkedinUrl}`,
      profile.headline ? `Headline: ${profile.headline}` : '',
      profile.opportunitySignal ? `Signal: ${profile.opportunitySignal}` : '',
      profile.summary ? `Bio: ${profile.summary}` : '',
    ]
      .filter(Boolean)
      .join(' | '),
    competitorAdvantage:
      profile.opportunitySignal || 'LinkedIn decision-maker direct outreach + Funnel Strategy audit',
    status: 'Active',
  };
}
