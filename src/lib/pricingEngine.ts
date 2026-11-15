import {
  AgencyTier,
  CityMarket,
  CountryMarket,
  OperatingNiche,
  StateOrProvinceMarket,
} from '../types/crm';

export interface PricingTierPackage {
  tierId: 'foundation' | 'growth' | 'scale';
  name: string;
  tagline: string;
  setupUsd: number;
  monthlyRetainerUsd: number;
  recommendedBestValue?: boolean;
  deliverables: {
    seo: string[];
    webDev: string[];
    automation: string[];
  };
  roiPitch: string;
}

export interface GeneratedOfferPlan {
  geoLabel: string;
  effectiveTier: AgencyTier;
  competitionLevel: string;
  multiplier: number;
  packages: PricingTierPackage[];
  positioningAngle: string;
  upsellPath: string;
}

const TIER_MULTIPLIERS: Record<AgencyTier, number> = {
  'Tier 1': 1.15,
  'Tier 2A': 1.0,
  'Tier 2B': 0.85,
  'Tier 3': 0.45,
  'Tier 4': 0.18,
};

function roundPrice(val: number): number {
  if (val < 300) return Math.max(120, Math.round(val / 25) * 25);
  if (val < 1200) return Math.round(val / 50) * 50;
  return Math.round(val / 100) * 100;
}

export function generatePricingEnginePlan(params: {
  country: CountryMarket;
  stateOrRegion?: StateOrProvinceMarket;
  city?: CityMarket;
  niche: OperatingNiche;
  serviceFocus: 'Full Stack (SEO + Web + AI)' | 'Local SEO + Maps' | 'Web Dev + CRO' | 'AI & Lead Automation';
}): GeneratedOfferPlan {
  const effectiveTier = params.city?.tier || params.stateOrRegion?.tier || params.country.tier;
  const competitionLevel =
    params.city?.competition || params.stateOrRegion?.competition || params.country.competition;
  const geoLabel = [params.city?.name, params.stateOrRegion?.name, params.country.name]
    .filter(Boolean)
    .join(', ');

  // Blend country retainer floor/ceiling with niche baseline
  const tierMult = TIER_MULTIPLIERS[effectiveTier] ?? 0.85;
  const [countryMin, countryMax] = params.country.retainerRangeUsd;
  const [nicheMin, nicheMax] = params.niche.baseRetainerUsd;

  const blendedMin =
    effectiveTier === 'Tier 4' || effectiveTier === 'Tier 3'
      ? Math.max(countryMin, Math.min(nicheMin * tierMult, countryMax * 0.85))
      : Math.max(countryMin * 0.85, nicheMin * tierMult);

  const blendedMax =
    effectiveTier === 'Tier 4' || effectiveTier === 'Tier 3'
      ? Math.max(countryMax, nicheMax * tierMult * 1.1)
      : Math.min(countryMax * 1.15, nicheMax * tierMult * 1.1);

  const compDiscountOrPremium =
    competitionLevel === 'Very High' ? 1.1 : competitionLevel === 'Low' ? 0.95 : 1.0;

  const foundationMonthly = roundPrice(blendedMin * compDiscountOrPremium);
  const growthMonthly = roundPrice(((blendedMin + blendedMax) / 2) * compDiscountOrPremium);
  const scaleMonthly = roundPrice(blendedMax * compDiscountOrPremium);

  const baseSetup = params.niche.baseSetupUsd * tierMult;
  const foundationSetup = roundPrice(baseSetup * 0.7);
  const growthSetup = roundPrice(baseSetup);
  const scaleSetup = roundPrice(baseSetup * 1.45);

  const includeWeb =
    params.serviceFocus === 'Full Stack (SEO + Web + AI)' || params.serviceFocus === 'Web Dev + CRO';
  const includeSeo =
    params.serviceFocus === 'Full Stack (SEO + Web + AI)' || params.serviceFocus === 'Local SEO + Maps';
  const includeAuto =
    params.serviceFocus === 'Full Stack (SEO + Web + AI)' ||
    params.serviceFocus === 'AI & Lead Automation';

  const packages: PricingTierPackage[] = [
    {
      tierId: 'foundation',
      name: 'Foundation Trojan Horse',
      tagline: `Low-friction entry wedge for ${params.niche.name} in ${params.city?.name || params.country.name}`,
      setupUsd: foundationSetup,
      monthlyRetainerUsd: foundationMonthly,
      deliverables: {
        seo: includeSeo
          ? ['Google Business Profile full audit & category optimization', 'Top 10 local citations + NAP cleanup', 'Core city landing page SEO']
          : ['Basic technical indexing & schema check'],
        webDev: includeWeb
          ? ['High-speed mobile conversion landing page', 'Click-to-call & instant WhatsApp/Form CTA']
          : ['Speed & above-the-fold CTA patch on existing site'],
        automation: includeAuto
          ? ['Missed-call / web-form instant SMS or WhatsApp auto-reply', 'Automated Google review link trigger']
          : ['Basic form-to-email/CRM notification'],
      },
      roiPitch: `Covers investment with just 1–2 recovered ${params.niche.name.toLowerCase()} jobs (${params.niche.clientJobValue}).`,
    },
    {
      tierId: 'growth',
      name: 'Growth Dominance System',
      tagline: 'Core agency retainer balancing Map Pack authority, conversion web UX & AI follow-up',
      setupUsd: growthSetup,
      monthlyRetainerUsd: growthMonthly,
      recommendedBestValue: true,
      deliverables: {
        seo: [
          params.niche.offerStack.seo,
          `Monthly localized content clusters targeting ${params.city?.name || params.country.name} high-intent queries`,
          'Competitor Map Pack gap tracking & review velocity engine',
        ],
        webDev: [
          params.niche.offerStack.webDev,
          'Sub-1.5s Core Web Vitals optimization + mobile-first conversion funnel',
          'Dedicated service & neighborhood landing pages',
        ],
        automation: [
          params.niche.offerStack.automation,
          'Google Calendar discovery/appointment sync + 48h & 5-day follow-up drips',
        ],
      },
      roiPitch: `Built for ${effectiveTier} purchasing power (${competitionLevel} competition) — engineered to capture top-3 Map Pack share and cut lead leakage.`,
    },
    {
      tierId: 'scale',
      name: 'Scale AI Revenue Engine',
      tagline: 'Full multi-location SEO, custom calculators/portals & 24/7 AI voice/WhatsApp closing',
      setupUsd: scaleSetup,
      monthlyRetainerUsd: scaleMonthly,
      deliverables: {
        seo: [
          'Multi-city / multi-service programmatic SEO expansion',
          'High-authority digital PR & regional backlink acquisition',
          'Live attribution dashboard synced to closed revenue',
        ],
        webDev: [
          'Custom interactive quote/ROI calculator or multi-language RTL/EU portal',
          'Continuous monthly A/B CRO testing on top traffic pages',
        ],
        automation: [
          '24/7 AI Voice & WhatsApp/IG DM appointment setter with deposit or qualification triage',
          'Full CRM two-way sync + automated reactivation of dead pipeline leads',
        ],
      },
      roiPitch: `Replaces 1–2 full-time front-desk staff while compounding owned organic demand across ${params.stateOrRegion?.name || params.country.name}.`,
    },
  ];

  const positioningAngle =
    competitionLevel === 'Very High' || competitionLevel === 'High'
      ? `Avoid pitching generic "SEO & websites". Lead with ${params.niche.trojanHorseHook} and bundle AI Speed-to-Lead so they see immediate revenue recovery.`
      : `Local digital competition in ${params.city?.name || params.country.name} is ${competitionLevel}. Win fast by demonstrating how quickly they can own #1 on Google Maps and capture mobile traffic.`;

  const upsellPath =
    effectiveTier === 'Tier 4' || effectiveTier === 'Tier 3'
      ? 'Close Foundation in 7–14 days for immediate cashflow + portfolio proof, then upsell Growth SEO + WhatsApp AI at Day 30.'
      : 'Anchor with Scale AI Engine on the discovery call, then offer Growth Dominance as the effortless start tier.';

  return {
    geoLabel,
    effectiveTier,
    competitionLevel,
    multiplier: tierMult,
    packages,
    positioningAngle,
    upsellPath,
  };
}
