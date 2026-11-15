import { GLOBAL_COUNTRIES } from '../data/globalMarkets';
import {
  AgencyTier,
  CityMarket,
  CountryMarket,
  Prospect,
  StateOrProvinceMarket,
} from '../types/crm';

export type CompetitionLevel = CityMarket['competition'];
export type HeatmapMetricMode = 'opportunity' | 'density' | 'low-competition';

export interface HeatmapPoint {
  id: string;
  lat: number;
  lng: number;
  weight: number;
  label: string;
  countryId: string;
  countryName: string;
  competition: CompetitionLevel;
  prospectCount: number;
  isUntappedBenchmark: boolean;
}

export interface HeatmapRegionCluster {
  key: string;
  countryId: string;
  countryName: string;
  stateName: string;
  cityName: string;
  tier: AgencyTier;
  lat: number;
  lng: number;
  competition: CompetitionLevel;
  competitionEase: number; // 0-100 (100 = lowest agency competition)
  prospectCount: number;
  activeCount: number;
  hotCount: number;
  warmCount: number;
  totalPipelineUsd: number;
  avgTicketUsd: number;
  densityScore: number; // 0-100
  opportunityHeatScore: number; // 0-100 (high density + low competition)
  topNiche: string;
  winningOffer: string;
  medianIncomeUsd: number;
  prospects: Prospect[];
}

export interface HeatmapAnalyticsSummary {
  clusters: HeatmapRegionCluster[];
  mappedProspectCount: number;
  sweetSpotClusterCount: number;
  topOpportunityCluster: HeatmapRegionCluster | null;
  avgSweetSpotTicketUsd: number;
  countryProspectCounts: Record<string, number>;
  countryTopOpportunityScore: Record<string, number>;
}

export const COMPETITION_EASE_WEIGHT: Record<CompetitionLevel, number> = {
  Low: 1.0,
  'Low-Med': 0.85,
  Medium: 0.62,
  High: 0.36,
  'Very High': 0.16,
};

const COUNTRY_ALIAS_MAP: Record<string, string> = {
  usa: 'usa',
  us: 'usa',
  'united states': 'usa',
  'united states of america': 'usa',
  uk: 'uk',
  gb: 'uk',
  'united kingdom': 'uk',
  'great britain': 'uk',
  england: 'uk',
  uae: 'uae',
  ae: 'uae',
  'united arab emirates': 'uae',
  dubai: 'uae',
  ksa: 'ksa',
  sa: 'ksa',
  'saudi arabia': 'ksa',
  'saudi arabia (ksa)': 'ksa',
  pk: 'pakistan',
  pakistan: 'pakistan',
  de: 'germany',
  germany: 'germany',
  deutschland: 'germany',
  fr: 'france',
  france: 'france',
  nl: 'netherlands',
  netherlands: 'netherlands',
  holland: 'netherlands',
  ie: 'ireland',
  ireland: 'ireland',
  be: 'belgium',
  belgium: 'belgium',
  at: 'austria',
  austria: 'austria',
  lu: 'luxembourg',
  luxembourg: 'luxembourg',
  se: 'sweden',
  sweden: 'sweden',
  dk: 'denmark',
  denmark: 'denmark',
  fi: 'finland',
  finland: 'finland',
  es: 'spain',
  spain: 'spain',
  it: 'italy',
  italy: 'italy',
  pt: 'portugal',
  portugal: 'portugal',
  gr: 'greece',
  greece: 'greece',
  pl: 'poland',
  poland: 'poland',
  cz: 'czechia',
  czechia: 'czechia',
  'czech republic': 'czechia',
  hu: 'hungary',
  hungary: 'hungary',
  ro: 'romania',
  romania: 'romania',
  sk: 'slovakia',
  slovakia: 'slovakia',
  hr: 'croatia',
  croatia: 'croatia',
  si: 'slovenia',
  slovenia: 'slovenia',
  bg: 'bulgaria',
  bulgaria: 'bulgaria',
  lt: 'lithuania',
  lithuania: 'lithuania',
  lv: 'latvia',
  latvia: 'latvia',
  ee: 'estonia',
  estonia: 'estonia',
  cy: 'cyprus',
  cyprus: 'cyprus',
  mt: 'malta',
  malta: 'malta',
  al: 'albania',
  albania: 'albania',
  ba: 'bosnia',
  bosnia: 'bosnia',
  'bosnia and herzegovina': 'bosnia',
  ge: 'georgia',
  georgia: 'georgia',
  md: 'moldova',
  moldova: 'moldova',
  me: 'montenegro',
  montenegro: 'montenegro',
  mk: 'north-macedonia',
  'north macedonia': 'north-macedonia',
  rs: 'serbia',
  serbia: 'serbia',
  tr: 'turkey',
  turkey: 'turkey',
  turkiye: 'turkey',
  ua: 'ukraine',
  ukraine: 'ukraine',
};

function normText(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase();
}

function resolveCountry(countryInput: string): CountryMarket | null {
  const normalized = normText(countryInput);
  if (!normalized) return null;

  const aliasId = COUNTRY_ALIAS_MAP[normalized];
  if (aliasId) {
    const byAlias = GLOBAL_COUNTRIES.find((c) => c.id === aliasId);
    if (byAlias) return byAlias;
  }

  return (
    GLOBAL_COUNTRIES.find(
      (c) =>
        normText(c.id) === normalized ||
        normText(c.isoCode) === normalized ||
        normText(c.name) === normalized ||
        normText(c.name).includes(normalized) ||
        normalized.includes(normText(c.name))
    ) || null
  );
}

interface ResolvedGeo {
  country: CountryMarket;
  state: StateOrProvinceMarket | null;
  city: CityMarket | null;
  lat: number;
  lng: number;
  competition: CompetitionLevel;
  tier: AgencyTier;
  medianIncomeUsd: number;
  winningOffer: string;
}

function resolveProspectGeo(prospect: Prospect): ResolvedGeo | null {
  const cityQuery = normText(prospect.city);
  const stateQuery = normText(prospect.stateOrRegion);
  let country = resolveCountry(prospect.country);

  // Fallback: infer country from city if prospect.country didn't match directly
  if (!country && cityQuery) {
    country =
      GLOBAL_COUNTRIES.find((c) =>
        c.statesOrRegions.some((st) =>
          st.cities.some(
            (ct) =>
              normText(ct.name) === cityQuery ||
              normText(ct.name).includes(cityQuery) ||
              cityQuery.includes(normText(ct.name))
          )
        )
      ) || null;
  }

  if (!country) return null;

  let matchedState: StateOrProvinceMarket | null = null;
  let matchedCity: CityMarket | null = null;

  if (cityQuery) {
    for (const st of country.statesOrRegions) {
      const exact = st.cities.find((ct) => normText(ct.name) === cityQuery);
      if (exact) {
        matchedState = st;
        matchedCity = exact;
        break;
      }
    }
    if (!matchedCity) {
      for (const st of country.statesOrRegions) {
        const fuzzy = st.cities.find(
          (ct) =>
            normText(ct.name).includes(cityQuery) || cityQuery.includes(normText(ct.name))
        );
        if (fuzzy) {
          matchedState = st;
          matchedCity = fuzzy;
          break;
        }
      }
    }
  }

  if (!matchedState && stateQuery) {
    matchedState =
      country.statesOrRegions.find(
        (st) =>
          normText(st.name) === stateQuery ||
          normText(st.code) === stateQuery ||
          normText(st.name).includes(stateQuery) ||
          stateQuery.includes(normText(st.name))
      ) || null;
  }

  const fallbackCity = matchedCity || matchedState?.cities[0] || null;
  const lat = matchedCity?.lat ?? fallbackCity?.lat ?? country.lat;
  const lng = matchedCity?.lng ?? fallbackCity?.lng ?? country.lng;
  const competition =
    matchedCity?.competition ?? matchedState?.competition ?? country.competition;
  const tier = matchedCity?.tier ?? matchedState?.tier ?? country.tier;
  const medianIncomeUsd =
    matchedCity?.medianIncomeUsd ??
    matchedState?.medianIncomeUsd ??
    country.medianIncomeUsd;
  const winningOffer =
    matchedCity?.winningOffer ??
    matchedState?.bestOfferSummary ??
    country.businessPotentialSummary;

  return {
    country,
    state: matchedState,
    city: matchedCity,
    lat,
    lng,
    competition,
    tier,
    medianIncomeUsd,
    winningOffer,
  };
}

export function buildHeatmapAnalytics(prospects: Prospect[]): HeatmapAnalyticsSummary {
  const clusterMap: Record<string, HeatmapRegionCluster> = {};
  const countryProspectCounts: Record<string, number> = {};
  const countryTopOpportunityScore: Record<string, number> = {};
  let mappedProspectCount = 0;

  prospects.forEach((prospect) => {
    if (prospect.status === 'Archived') return;
    const geo = resolveProspectGeo(prospect);
    if (!geo) return;

    mappedProspectCount += 1;
    countryProspectCounts[geo.country.id] =
      (countryProspectCounts[geo.country.id] || 0) + 1;

    const cityLabel =
      geo.city?.name ||
      (prospect.city || '').trim() ||
      geo.state?.name ||
      geo.country.name;
    const stateLabel = geo.state?.name || (prospect.stateOrRegion || '').trim() || geo.country.macroRegion;
    const key = `${geo.country.id}::${cityLabel.toLowerCase()}`;

    if (!clusterMap[key]) {
      clusterMap[key] = {
        key,
        countryId: geo.country.id,
        countryName: geo.country.name,
        stateName: stateLabel,
        cityName: cityLabel,
        tier: geo.tier,
        lat: geo.lat,
        lng: geo.lng,
        competition: geo.competition,
        competitionEase: Math.round(COMPETITION_EASE_WEIGHT[geo.competition] * 100),
        prospectCount: 0,
        activeCount: 0,
        hotCount: 0,
        warmCount: 0,
        totalPipelineUsd: 0,
        avgTicketUsd: 0,
        densityScore: 0,
        opportunityHeatScore: 0,
        topNiche: prospect.categoryNiche || geo.city?.topNiches[0] || geo.country.topOperatingNiches[0] || 'Local Services',
        winningOffer: geo.winningOffer,
        medianIncomeUsd: geo.medianIncomeUsd,
        prospects: [],
      };
    }

    const cluster = clusterMap[key];
    cluster.prospects.push(prospect);
    cluster.prospectCount += 1;
    if (prospect.status === 'Active') cluster.activeCount += 1;
    if (prospect.leadQuality === 'Hot') cluster.hotCount += 1;
    if (prospect.leadQuality === 'Warm') cluster.warmCount += 1;
    cluster.totalPipelineUsd += Number(prospect.ticketUsd) || 0;
  });

  const clusters = Object.values(clusterMap);
  const maxRawSignal = Math.max(
    2.0,
    ...clusters.map(
      (c) =>
        c.prospectCount +
        c.hotCount * 0.45 +
        c.warmCount * 0.2 +
        Math.min(0.6, c.totalPipelineUsd / 12000)
    )
  );

  clusters.forEach((cluster) => {
    cluster.avgTicketUsd =
      cluster.prospectCount > 0
        ? Math.round(cluster.totalPipelineUsd / cluster.prospectCount)
        : 0;

    // Pick most common niche in the cluster
    const nicheCounts: Record<string, number> = {};
    cluster.prospects.forEach((p) => {
      const niche = p.categoryNiche || 'Local Services';
      nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
    });
    const topNicheEntry = Object.entries(nicheCounts).sort((a, b) => b[1] - a[1])[0];
    if (topNicheEntry) {
      cluster.topNiche = topNicheEntry[0];
    }

    const rawSignal =
      cluster.prospectCount +
      cluster.hotCount * 0.45 +
      cluster.warmCount * 0.2 +
      Math.min(0.6, cluster.totalPipelineUsd / 12000);
    const densityNorm = Math.min(1, rawSignal / maxRawSignal);
    const easeNorm = COMPETITION_EASE_WEIGHT[cluster.competition];

    cluster.densityScore = Math.round(densityNorm * 100);
    // Reward regions with BOTH strong CRM density AND lower agency competition
    cluster.opportunityHeatScore = Math.round(
      Math.min(
        100,
        100 * (densityNorm * 0.54 + easeNorm * 0.46) * (0.42 + 0.58 * easeNorm)
      )
    );

    const prevTop = countryTopOpportunityScore[cluster.countryId] || 0;
    if (cluster.opportunityHeatScore > prevTop) {
      countryTopOpportunityScore[cluster.countryId] = cluster.opportunityHeatScore;
    }
  });

  clusters.sort(
    (a, b) =>
      b.opportunityHeatScore - a.opportunityHeatScore ||
      b.prospectCount - a.prospectCount ||
      b.totalPipelineUsd - a.totalPipelineUsd
  );

  const sweetSpots = clusters.filter(
    (c) => c.competition === 'Low' || c.competition === 'Low-Med'
  );
  const avgSweetSpotTicketUsd =
    sweetSpots.length > 0
      ? Math.round(
          sweetSpots.reduce((acc, c) => acc + c.avgTicketUsd, 0) / sweetSpots.length
        )
      : 0;

  return {
    clusters,
    mappedProspectCount,
    sweetSpotClusterCount: sweetSpots.length,
    topOpportunityCluster: clusters[0] || null,
    avgSweetSpotTicketUsd,
    countryProspectCounts,
    countryTopOpportunityScore,
  };
}

export function buildHeatmapPoints(
  analytics: HeatmapAnalyticsSummary,
  mode: HeatmapMetricMode
): HeatmapPoint[] {
  const points: HeatmapPoint[] = [];
  const coveredCityKeys: Record<string, boolean> = {};

  analytics.clusters.forEach((cluster) => {
    coveredCityKeys[cluster.key] = true;

    // Emit one point per prospect with tiny deterministic radial micro-offset
    // so multi-prospect clusters form smooth natural KDE density clouds
    cluster.prospects.forEach((p, idx) => {
      const angle = (idx * 2.399963) % (Math.PI * 2);
      const radiusDeg = idx === 0 ? 0 : 0.009 * Math.sqrt(idx);
      const lat = cluster.lat + Math.sin(angle) * radiusDeg;
      const lng = cluster.lng + Math.cos(angle) * radiusDeg;

      const qualityBoost = p.leadQuality === 'Hot' ? 1.35 : p.leadQuality === 'Warm' ? 1.1 : 0.85;
      const ease = COMPETITION_EASE_WEIGHT[cluster.competition];

      let weight = 1;
      if (mode === 'opportunity') {
        weight = Math.max(0.25, ease * 3.8 * qualityBoost);
      } else if (mode === 'density') {
        weight = Math.max(0.4, 2.5 * qualityBoost);
      } else {
        // low-competition mode gives CRM-validated low-competition cities top glow
        weight = Math.max(0.3, ease * 4.2);
      }

      points.push({
        id: `crm-${p.id}`,
        lat,
        lng,
        weight,
        label: `${cluster.cityName}, ${cluster.countryName}`,
        countryId: cluster.countryId,
        countryName: cluster.countryName,
        competition: cluster.competition,
        prospectCount: cluster.prospectCount,
        isUntappedBenchmark: false,
      });
    });
  });

  // In 'low-competition' mode, also illuminate untapped low-competition markets
  // across the 41-country matrix so agencies spot expansion pockets alongside CRM density
  if (mode === 'low-competition') {
    GLOBAL_COUNTRIES.forEach((country) => {
      country.statesOrRegions.forEach((state) => {
        state.cities.forEach((city) => {
          const cityKey = `${country.id}::${city.name.toLowerCase()}`;
          if (coveredCityKeys[cityKey]) return;
          if (city.competition !== 'Low' && city.competition !== 'Low-Med') return;

          const ease = COMPETITION_EASE_WEIGHT[city.competition];
          points.push({
            id: `bench-${country.id}-${state.code}-${city.name}`,
            lat: city.lat,
            lng: city.lng,
            weight: ease * 1.4,
            label: `${city.name}, ${country.name} (Untapped ${city.competition})`,
            countryId: country.id,
            countryName: country.name,
            competition: city.competition,
            prospectCount: 0,
            isUntappedBenchmark: true,
          });
        });
      });
    });
  }

  return points;
}

export function isLowCompetitionTier(competition: CompetitionLevel): boolean {
  return competition === 'Low' || competition === 'Low-Med';
}
