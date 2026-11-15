import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Compass,
  Copy,
  Crosshair,
  ExternalLink,
  Flame,
  Globe,
  Layers,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Send,
  Sparkles,
  Star,
  Store,
  Target,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { GLOBAL_COUNTRIES } from '../data/globalMarkets';
import { formatMoney, formatMoneyRange } from '../data/currency';
import { OPERATING_NICHES } from '../data/operatingNiches';
import {
  addDaysUtc,
  ensureHttpUrl,
  getLocalIsoDate,
  safeCopyText,
  safeReadJsonResponse,
} from '../lib/appUtils';
import { EmailRecipientContext } from '../lib/emailTemplates';
import {
  buildHeatmapAnalytics,
  buildHeatmapPoints,
  CompetitionLevel,
  HeatmapMetricMode,
  HeatmapRegionCluster,
  isLowCompetitionTier,
} from '../lib/marketHeatmap';
import { AutomatedNicheProspector, ScrapedLead } from './AutomatedNicheProspector';
import { ProspectHeatmapOverlay } from './ProspectHeatmapOverlay';
import {
  AgencyTier,
  CountryMarket,
  CurrencyCode,
  MacroRegion,
  Prospect,
} from '../types/crm';

interface SearchResearchResult {
  markdown: string;
  sources: { uri: string; title: string }[];
  geoLabel: string;
  notice?: string;
}

interface OutreachPrefill {
  businessName?: string;
  contactName?: string;
  serviceSummary?: string;
}

interface Props {
  currency: CurrencyCode;
  initialCountryId?: string;
  existingProspects: Prospect[];
  customMarketNotes: Record<string, string>;
  onSaveMarketNote: (countryId: string, note: string) => void;
  onImportScrapedProspect: (prospect: Prospect) => void;
  onBatchImportProspects: (prospects: Prospect[]) => void;
  onOpenPricingEngine: (countryId: string, nicheId?: string) => void;
  onOpenOutreachGenerator: (
    countryId: string,
    nicheId?: string,
    prefill?: OutreachPrefill
  ) => void;
  onOpenGmailForLead: (ctx: EmailRecipientContext) => void;
}

function zoomToRadiusMeters(zoom: number): number {
  if (zoom >= 15) return 3500;
  if (zoom >= 13) return 8000;
  if (zoom >= 11) return 20000;
  if (zoom >= 9) return 38000;
  return 50000;
}

function buildProspectIdFromPlaceId(placeId: string): string {
  const sanitized = placeId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-16);
  return `p-gmp-${sanitized || Date.now().toString()}`;
}

function normalizeMatchKey(value: string): string {
  const trimmed = (value || '').trim().toLowerCase();
  const ascii = trimmed.replace(/[^a-z0-9]/g, '');
  return ascii || encodeURIComponent(trimmed);
}

interface HeatmapFitRequest {
  scope: 'world' | 'country' | 'cluster';
  cluster?: HeatmapRegionCluster;
  seq: number;
}

const HEATMAP_SPREAD_CONFIG: Record<
  'compact' | 'balanced' | 'macro',
  { label: string; radiusPixels: number; intensity: number }
> = {
  compact: { label: 'Tight', radiusPixels: 38, intensity: 1.15 },
  balanced: { label: 'Balanced', radiusPixels: 58, intensity: 1.4 },
  macro: { label: 'Macro', radiusPixels: 86, intensity: 1.7 },
};

function competitionBadgeClasses(competition: CompetitionLevel): string {
  switch (competition) {
    case 'Low':
      return 'bg-[#6AE4C0]/25 text-[#0E5A47] dark:bg-[#6AE4C0]/20 dark:text-[#6AE4C0] border-[#6AE4C0]/50';
    case 'Low-Med':
      return 'bg-[#D9F154]/35 text-[#2E3A00] dark:bg-[#D9F154]/20 dark:text-[#D9F154] border-[#D9F154]/60';
    case 'Medium':
      return 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300/60 dark:border-amber-700/50';
    case 'High':
      return 'bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-300 border-orange-300/60 dark:border-orange-700/50';
    case 'Very High':
    default:
      return 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300/60 dark:border-rose-700/50';
  }
}

interface MapViewportControllerProps {
  leads: ScrapedLead[];
  leadsVersion: number;
  focusedLead: ScrapedLead | null;
  countryCenter: { lat: number; lng: number };
  selectedCountryId: string;
  heatmapClusters: HeatmapRegionCluster[];
  heatmapFitRequest: HeatmapFitRequest | null;
  onViewportMoved: (center: { lat: number; lng: number; zoom: number }) => void;
}

const MapViewportController: React.FC<MapViewportControllerProps> = ({
  leads,
  leadsVersion,
  focusedLead,
  countryCenter,
  selectedCountryId,
  heatmapClusters,
  heatmapFitRequest,
  onViewportMoved,
}) => {
  const map = useMap();
  const coreLib = useMapsLibrary('core');
  const lastFittedVersionRef = useRef<number>(0);
  const lastHeatFitSeqRef = useRef<number>(0);

  // Fit bounds whenever a fresh scrape completes
  useEffect(() => {
    if (!map || !coreLib || leadsVersion === 0) return;
    if (lastFittedVersionRef.current === leadsVersion) return;
    lastFittedVersionRef.current = leadsVersion;

    const coords = leads.filter((l) => l.lat !== null && l.lng !== null);
    if (coords.length === 0) return;

    if (coords.length === 1 && coords[0].lat !== null && coords[0].lng !== null) {
      map.panTo({ lat: coords[0].lat, lng: coords[0].lng });
      map.setZoom(14);
      return;
    }

    const bounds = new coreLib.LatLngBounds();
    coords.forEach((l) => {
      if (l.lat !== null && l.lng !== null) {
        bounds.extend({ lat: l.lat, lng: l.lng });
      }
    });
    map.fitBounds(bounds, { top: 68, right: 48, bottom: 48, left: 48 });
  }, [map, coreLib, leads, leadsVersion]);

  // Fit bounds for explicit CRM heatmap scope changes (world / country / cluster)
  useEffect(() => {
    if (!map || !coreLib || !heatmapFitRequest) return;
    if (lastHeatFitSeqRef.current === heatmapFitRequest.seq) return;
    lastHeatFitSeqRef.current = heatmapFitRequest.seq;

    if (heatmapFitRequest.scope === 'cluster' && heatmapFitRequest.cluster) {
      map.panTo({
        lat: heatmapFitRequest.cluster.lat,
        lng: heatmapFitRequest.cluster.lng,
      });
      map.setZoom(10);
      return;
    }

    const targetClusters =
      heatmapFitRequest.scope === 'country'
        ? heatmapClusters.filter((c) => c.countryId === selectedCountryId)
        : heatmapClusters;

    if (targetClusters.length === 0) {
      map.panTo(countryCenter);
      map.setZoom(heatmapFitRequest.scope === 'world' ? 3 : 5);
      return;
    }

    if (targetClusters.length === 1) {
      map.panTo({ lat: targetClusters[0].lat, lng: targetClusters[0].lng });
      map.setZoom(heatmapFitRequest.scope === 'world' ? 4 : 8);
      return;
    }

    const bounds = new coreLib.LatLngBounds();
    targetClusters.forEach((c) => {
      bounds.extend({ lat: c.lat, lng: c.lng });
    });
    map.fitBounds(bounds, { top: 72, right: 56, bottom: 56, left: 56 });
  }, [map, coreLib, heatmapFitRequest, heatmapClusters, selectedCountryId, countryCenter]);

  // Smoothly pan to focused/clicked pin
  useEffect(() => {
    if (!map || !focusedLead || focusedLead.lat === null || focusedLead.lng === null) return;
    map.panTo({ lat: focusedLead.lat, lng: focusedLead.lng });
    const currentZoom = map.getZoom();
    if (typeof currentZoom === 'number' && currentZoom < 13) {
      map.setZoom(13);
    }
  }, [map, focusedLead]);

  // Center on country/city change before any leads are scraped (when no active heatmap world fit)
  useEffect(() => {
    if (!map || leads.length > 0 || heatmapFitRequest?.scope === 'world') return;
    map.panTo(countryCenter);
  }, [map, countryCenter, leads.length, heatmapFitRequest?.scope]);

  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('idle', () => {
      const c = map.getCenter();
      const z = map.getZoom();
      if (c) {
        onViewportMoved({
          lat: c.lat(),
          lng: c.lng(),
          zoom: typeof z === 'number' ? z : 11,
        });
      }
    });
    return () => {
      listener.remove();
    };
  }, [map, onViewportMoved]);

  return null;
};

export const GlobalMarketsView: React.FC<Props> = ({
  currency,
  initialCountryId,
  existingProspects,
  customMarketNotes,
  onSaveMarketNote,
  onImportScrapedProspect,
  onBatchImportProspects,
  onOpenPricingEngine,
  onOpenOutreachGenerator,
  onOpenGmailForLead,
}) => {
  const [regionFilter, setRegionFilter] = useState<'All' | MacroRegion>('All');
  const [tierFilter, setTierFilter] = useState<'All' | AgencyTier>('All');
  const [searchText, setSearchText] = useState('');
  const [selectedCountryId, setSelectedCountryId] = useState<string>(
    initialCountryId || 'usa'
  );
  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});
  const [activeSubTab, setActiveSubTab] = useState<
    'matrix' | 'auto-prospector' | 'maps-scraper' | 'search-intel'
  >('matrix');

  // Google Maps Key resolution (supports Vite build-time env OR Express /api/maps/config)
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) || ''
  );

  useEffect(() => {
    if (mapsApiKey) return;
    fetch('/api/maps/config')
      .then((r) => safeReadJsonResponse<{ apiKey?: string }>(r))
      .then((d) => {
        if (d.apiKey) setMapsApiKey(d.apiKey);
      })
      .catch(() => {});
  }, [mapsApiKey]);

  useEffect(() => {
    if (initialCountryId) setSelectedCountryId(initialCountryId);
  }, [initialCountryId]);

  const filteredCountries = useMemo(() => {
    return GLOBAL_COUNTRIES.filter((c) => {
      if (regionFilter !== 'All' && c.macroRegion !== regionFilter) return false;
      if (tierFilter !== 'All' && c.tier !== tierFilter) return false;
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        const matchCountry = c.name.toLowerCase().includes(q);
        const matchNiche = c.topOperatingNiches.some((n) => n.toLowerCase().includes(q));
        const matchStateOrCity = c.statesOrRegions.some(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.cities.some((ct) => ct.name.toLowerCase().includes(q))
        );
        return matchCountry || matchNiche || matchStateOrCity;
      }
      return true;
    });
  }, [regionFilter, tierFilter, searchText]);

  const selectedCountry: CountryMarket = useMemo(
    () =>
      GLOBAL_COUNTRIES.find((c) => c.id === selectedCountryId) ||
      filteredCountries[0] ||
      GLOBAL_COUNTRIES[0],
    [selectedCountryId, filteredCountries]
  );

  const defaultCity = selectedCountry.statesOrRegions[0]?.cities[0];

  // Google Maps Scraper & Marker Overlay State
  const [scrapeCity, setScrapeCity] = useState(defaultCity?.name || '');
  const [scrapeNiche, setScrapeNiche] = useState(
    selectedCountry.topOperatingNiches[0] || OPERATING_NICHES[0].name
  );
  const [scrapeRadiusMeters, setScrapeRadiusMeters] = useState<number>(20000);
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapedLeads, setScrapedLeads] = useState<ScrapedLead[]>([]);
  const [leadsVersion, setLeadsVersion] = useState(0);
  const [selectedLeadPin, setSelectedLeadPin] = useState<ScrapedLead | null>(null);
  const [pinFilter, setPinFilter] = useState<'All' | 'Hot' | 'Warm' | 'Imported'>('All');
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Record<string, boolean>>({});
  const [viewportCenter, setViewportCenter] = useState<{
    lat: number;
    lng: number;
    zoom: number;
  } | null>(null);
  const [mapMovedSinceSearch, setMapMovedSinceSearch] = useState(false);
  const lastSearchCenterRef = useRef<{ lat: number; lng: number } | null>(null);

  // CRM Opportunity Heatmap State
  const [heatmapEnabled, setHeatmapEnabled] = useState<boolean>(true);
  const [heatmapMode, setHeatmapMode] = useState<HeatmapMetricMode>('opportunity');
  const [heatmapSpread, setHeatmapSpread] = useState<'compact' | 'balanced' | 'macro'>(
    'balanced'
  );
  const [showClusterBadges, setShowClusterBadges] = useState<boolean>(true);
  const [selectedHeatCluster, setSelectedHeatCluster] =
    useState<HeatmapRegionCluster | null>(null);
  const [heatmapFitRequest, setHeatmapFitRequest] = useState<HeatmapFitRequest | null>(
    null
  );
  const heatFitSeqRef = useRef<number>(1);

  const heatmapAnalytics = useMemo(
    () => buildHeatmapAnalytics(existingProspects),
    [existingProspects]
  );

  const heatmapPoints = useMemo(
    () => buildHeatmapPoints(heatmapAnalytics, heatmapMode),
    [heatmapAnalytics, heatmapMode]
  );

  const triggerHeatmapFit = useCallback(
    (scope: 'world' | 'country' | 'cluster', cluster?: HeatmapRegionCluster) => {
      heatFitSeqRef.current += 1;
      setHeatmapFitRequest({ scope, cluster, seq: heatFitSeqRef.current });
    },
    []
  );

  const openClusterOnMapHeatmap = useCallback(
    (cluster: HeatmapRegionCluster) => {
      setSelectedCountryId(cluster.countryId);
      setScrapeCity(cluster.cityName);
      setHeatmapEnabled(true);
      setSelectedLeadPin(null);
      setSelectedHeatCluster(cluster);
      setActiveSubTab('maps-scraper');
      triggerHeatmapFit('cluster', cluster);
    },
    [triggerHeatmapFit]
  );

  const openGlobalHeatmapView = useCallback(() => {
    setHeatmapEnabled(true);
    setSelectedLeadPin(null);
    setActiveSubTab('maps-scraper');
    triggerHeatmapFit('world');
  }, [triggerHeatmapFit]);

  // Google Search Grounding Niche Research State
  const [researchNiche, setResearchNiche] = useState(
    selectedCountry.topOperatingNiches[0] || OPERATING_NICHES[0].name
  );
  const [researchCity, setResearchCity] = useState(defaultCity?.name || '');
  const [researchService, setResearchService] = useState('Web Dev, Local SEO & AI Automation');
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchResult, setResearchResult] = useState<SearchResearchResult | null>(null);

  useEffect(() => {
    const firstCity = selectedCountry.statesOrRegions[0]?.cities[0]?.name || '';
    const firstNiche = selectedCountry.topOperatingNiches[0] || OPERATING_NICHES[0].name;
    setScrapeCity(firstCity);
    setScrapeNiche(firstNiche);
    setResearchCity(firstCity);
    setResearchNiche(firstNiche);
  }, [selectedCountry]);

  const executeMapsScrape = useCallback(
    async (opts?: {
      cityOverride?: string;
      nicheOverride?: string;
      centerOverride?: { lat: number; lng: number; radiusMeters: number };
    }) => {
      const targetCityName = (opts?.cityOverride ?? scrapeCity).trim();
      const targetNicheName = (opts?.nicheOverride ?? scrapeNiche).trim();

      setScraping(true);
      setScrapeError(null);
      setSelectedLeadPin(null);

      const targetCityObj = selectedCountry.statesOrRegions
        .flatMap((s) => s.cities)
        .find((ct) => ct.name.toLowerCase() === targetCityName.toLowerCase());

      const bias = opts?.centerOverride
        ? opts.centerOverride
        : targetCityObj
          ? { lat: targetCityObj.lat, lng: targetCityObj.lng, radiusMeters: scrapeRadiusMeters }
          : { lat: selectedCountry.lat, lng: selectedCountry.lng, radiusMeters: scrapeRadiusMeters };

      const textQuery = opts?.centerOverride
        ? `${targetNicheName || 'Local Business'} near ${targetCityName || selectedCountry.name}`
        : `${targetNicheName || 'Local Business'} in ${targetCityName || selectedCountry.name}, ${selectedCountry.name}`;

      try {
        const res = await fetch('/api/maps/prospect-scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: textQuery,
            regionCode: selectedCountry.isoCode,
            locationBias: bias,
            pageSize: 18,
          }),
        });

        const data = await safeReadJsonResponse<{
          leads?: ScrapedLead[];
          error?: string;
          message?: string;
        }>(res);

        if (res.status === 429 || data.error === 'RESOURCE_EXHAUSTED') {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          setScrapeError('Google Maps Platform quota reached.');
          return;
        }

        if (!res.ok) {
          setScrapeError(data.message || 'Failed to retrieve places from Google Maps.');
          return;
        }

        const nextLeads = data.leads || [];
        setScrapedLeads(nextLeads);
        setLeadsVersion((v) => v + 1);
        lastSearchCenterRef.current = { lat: bias.lat, lng: bias.lng };
        setMapMovedSinceSearch(false);
        const firstPin = nextLeads.find((l) => l.lat !== null && l.lng !== null) || null;
        if (firstPin) {
          setSelectedLeadPin(firstPin);
        }
      } catch (err) {
        setScrapeError(err instanceof Error ? err.message : 'Network error running scraper.');
      } finally {
        setScraping(false);
      }
    },
    [scrapeCity, scrapeNiche, scrapeRadiusMeters, selectedCountry]
  );

  const handleRunMapsScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeMapsScrape();
  };

  const handleViewportMoved = useCallback(
    (center: { lat: number; lng: number; zoom: number }) => {
      setViewportCenter(center);
      if (lastSearchCenterRef.current) {
        const dLat = Math.abs(center.lat - lastSearchCenterRef.current.lat);
        const dLng = Math.abs(center.lng - lastSearchCenterRef.current.lng);
        if (dLat > 0.015 || dLng > 0.015) {
          setMapMovedSinceSearch(true);
        }
      }
    },
    []
  );

  const existingProspectLookup = useMemo(() => {
    const idSet = new Set<string>();
    const nameCitySet = new Set<string>();
    existingProspects.forEach((p) => {
      idSet.add(p.id);
      nameCitySet.add(`${normalizeMatchKey(p.businessName)}::${normalizeMatchKey(p.city)}`);
    });
    return { idSet, nameCitySet };
  }, [existingProspects]);

  const isLeadInCrm = useCallback(
    (lead: ScrapedLead) => {
      if (importedIds[lead.placeId]) return true;
      if (existingProspectLookup.idSet.has(buildProspectIdFromPlaceId(lead.placeId))) {
        return true;
      }
      const targetCity = scrapeCity || defaultCity?.name || selectedCountry.name;
      return existingProspectLookup.nameCitySet.has(
        `${normalizeMatchKey(lead.businessName)}::${normalizeMatchKey(targetCity)}`
      );
    },
    [importedIds, existingProspectLookup, scrapeCity, defaultCity?.name, selectedCountry.name]
  );

  const handleImportLead = (lead: ScrapedLead) => {
    if (isLeadInCrm(lead)) return;
    const today = getLocalIsoDate();
    const twoDays = addDaysUtc(today, 2);
    const baseTicket = Math.round(
      (selectedCountry.retainerRangeUsd[0] + selectedCountry.retainerRangeUsd[1]) / 2
    );

    onImportScrapedProspect({
      id: buildProspectIdFromPlaceId(lead.placeId),
      businessName: lead.businessName,
      contactPerson: 'Owner / Manager',
      roleTitle: 'Decision Maker',
      email: '',
      phone: lead.phone,
      website: lead.website,
      country: selectedCountry.name,
      stateOrRegion: selectedCountry.statesOrRegions[0]?.name || '',
      city: scrapeCity || defaultCity?.name || selectedCountry.name,
      categoryNiche: scrapeNiche,
      leadQuality: lead.leadPriority,
      stage: 'New Lead',
      serviceInterest: !lead.website
        ? 'High-Converting Website + Google Map Pack SEO'
        : 'Local SEO + AI Speed-to-Lead Automation',
      ticketUsd: baseTicket,
      dateAdded: today,
      nextFollowUp: twoDays,
      lastContacted: '',
      lastMessageSent: '',
      replyNotes: `Scraped via Google Maps (${lead.rating ?? 'N/A'}★, ${lead.reviewCount} reviews). Signals: ${lead.opportunitySignals.join('; ')}`,
      competitorAdvantage: lead.opportunitySignals[0] || 'Map Pack & AI conversion gap',
      status: 'Active',
    });

    setImportedIds((prev) => ({ ...prev, [lead.placeId]: true }));
  };

  const handleRunSearchResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setResearchLoading(true);
    setResearchError(null);
    try {
      const res = await fetch('/api/research/niche-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          country: selectedCountry.name,
          stateOrRegion: selectedCountry.statesOrRegions[0]?.name,
          city: researchCity,
          niche: researchNiche,
          serviceFocus: researchService,
        }),
      });
      const data = await safeReadJsonResponse<
        SearchResearchResult & {
          error?: string;
          message?: string;
        }
      >(res);
      if (!res.ok) {
        if (res.status === 429 || data.error === 'QUOTA_EXCEEDED') {
          const cityLabel = researchCity || defaultCity?.name || selectedCountry.name;
          const matchedNiche = OPERATING_NICHES.find(
            (n) =>
              n.name.toLowerCase().includes(researchNiche.toLowerCase()) ||
              researchNiche.toLowerCase().includes(n.name.toLowerCase())
          );
          setResearchError(
            data.message ||
              'Gemini API rate/quota limit reached. Showing instant local Market Matrix Intelligence below while your quota resets.'
          );
          setResearchResult({
            geoLabel: `${cityLabel}, ${selectedCountry.name}`,
            sources: [],
            notice: 'Offline Market Matrix Brief (Gemini API quota temporarily reached)',
            markdown: [
              `### Local Market Intelligence Brief: ${researchNiche} in ${cityLabel}, ${selectedCountry.name}`,
              ``,
              `1. **Market Tier & Competition**: ${selectedCountry.tierLabel} · Competition: **${selectedCountry.competition}** · Benchmark Retainer: **$${selectedCountry.retainerRangeUsd[0]}–$${selectedCountry.retainerRangeUsd[1]}/mo**.`,
              `2. **Service Fit Scores**: Local SEO (${selectedCountry.serviceSuitability.seo.score}/100) · Web Dev (${selectedCountry.serviceSuitability.webDev.score}/100) · AI Automation (${selectedCountry.serviceSuitability.automation.score}/100).`,
              `3. **Recommended Trojan Horse Entry Offer**: ${matchedNiche?.trojanHorseHook || `90-second Google Business Profile & missed-call audit pitching ${researchService}`}.`,
              `4. **Top Prospector Search Queries (Use in Map & GMB Pins tab)**:`,
              `   - "${researchNiche} in ${cityLabel}"`,
              `   - "Best ${researchNiche} near ${cityLabel}"`,
              `   - "${researchNiche} emergency service ${cityLabel}"`,
            ].join('\n'),
          });
          return;
        }
        setResearchError(data.message || 'Search grounding request failed.');
        return;
      }
      setResearchResult(data);
    } catch (err) {
      setResearchError(err instanceof Error ? err.message : 'Network error during research.');
    } finally {
      setResearchLoading(false);
    }
  };

  const handleLaunchOutreachForLead = (lead: ScrapedLead) => {
    const matchedNiche = OPERATING_NICHES.find(
      (n) =>
        n.name.toLowerCase().includes(scrapeNiche.toLowerCase()) ||
        scrapeNiche.toLowerCase().includes(n.name.toLowerCase())
    );
    const serviceSummary = !lead.website
      ? `Website Build + Google Business Profile Map Pack (${lead.opportunitySignals[0] || 'No website listed'})`
      : `Local SEO + AI Speed-to-Lead (${lead.opportunitySignals[0] || 'Review & conversion gap'})`;
    onOpenOutreachGenerator(selectedCountry.id, matchedNiche?.id, {
      businessName: lead.businessName,
      contactName: 'Owner',
      serviceSummary,
    });
  };

  const handleCopyPhone = async (lead: ScrapedLead) => {
    if (!lead.phone) return;
    const copied = await safeCopyText(lead.phone);
    if (copied) {
      setCopiedPhoneId(lead.placeId);
      setTimeout(() => setCopiedPhoneId(null), 1500);
    }
  };

  const handleEmailScrapedLead = (lead: ScrapedLead) => {
    onOpenGmailForLead({
      placeId: lead.placeId,
      contactName: 'Owner',
      businessName: lead.businessName,
      email: '',
      phone: lead.phone,
      website: lead.website,
      address: lead.formattedAddress,
      city: scrapeCity || defaultCity?.name || selectedCountry.name,
      stateOrRegion: selectedCountry.statesOrRegions[0]?.name || '',
      country: selectedCountry.name,
      niche: lead.primaryType || scrapeNiche,
      rating: lead.rating,
      reviewCount: lead.reviewCount,
      opportunitySignals: lead.opportunitySignals,
      serviceInterest: !lead.website
        ? 'High-Converting Website + Google Map Pack SEO'
        : 'Local SEO + AI Speed-to-Lead Automation',
      competitorAdvantage: lead.opportunitySignals[0],
      googleMapsUri: lead.googleMapsUri,
      leadPriority: lead.leadPriority,
    });
  };

  const filteredScrapedLeads = useMemo(() => {
    return scrapedLeads.filter((lead) => {
      if (pinFilter === 'Hot') return lead.leadPriority === 'Hot';
      if (pinFilter === 'Warm') return lead.leadPriority === 'Warm';
      if (pinFilter === 'Imported') return isLeadInCrm(lead);
      return true;
    });
  }, [scrapedLeads, pinFilter, isLeadInCrm]);

  const initialMapCenter = useMemo(() => {
    if (defaultCity) return { lat: defaultCity.lat, lng: defaultCity.lng };
    return { lat: selectedCountry.lat, lng: selectedCountry.lng };
  }, [defaultCity, selectedCountry]);

  return (
    <div className="h-full overflow-y-auto bg-[#F3F4F1] dark:bg-[#0D0E12] text-[#111214] dark:text-[#F4F5F7] p-5 lg:p-6 space-y-5 transition-colors">
      {/* HEADER + MODE TABS */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">
            Global Market Matrix & Live Lead Intelligence
          </h1>
          <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
            41 countries (USA 50 states, UK, all 27 EU nations, Balkans, UAE, KSA & Pakistan) + Live Google Maps Lead Scraper & Search Demand Research.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 bg-white dark:bg-[#16181E] p-1.5 rounded-2xl border border-[#E2E4DF] dark:border-[#282B35]">
          <button
            type="button"
            onClick={() => setActiveSubTab('matrix')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeSubTab === 'matrix'
                ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                : 'text-[#555963] dark:text-[#A1A6B3] hover:text-[#111214] dark:hover:text-[#F4F5F7]'
            }`}
          >
            41-Country Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('auto-prospector')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeSubTab === 'auto-prospector'
                ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                : 'text-[#555963] dark:text-[#A1A6B3] hover:text-[#111214] dark:hover:text-[#F4F5F7]'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Auto-Prospector → CRM</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('maps-scraper')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeSubTab === 'maps-scraper'
                ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                : 'text-[#555963] dark:text-[#A1A6B3] hover:text-[#111214] dark:hover:text-[#F4F5F7]'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Map &amp; GMB Pins</span>
            {scrapedLeads.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono-tabular bg-[#D9F154] text-[#111214]">
                {scrapedLeads.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('search-intel')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              activeSubTab === 'search-intel'
                ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                : 'text-[#555963] dark:text-[#A1A6B3] hover:text-[#111214] dark:hover:text-[#F4F5F7]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Search Volume &amp; Competition
          </button>
        </div>
      </div>

      {/* COUNTRY SELECTOR SIDEBAR + MAIN DETAIL SPLIT */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* LEFT COUNTRY DIRECTORY (4 cols) */}
        <div className="xl:col-span-4 bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-4 space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-[#7A7E87] dark:text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Filter country, state, city, niche..."
              className="w-full bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#323643] rounded-xl pl-8 pr-3 py-2 text-xs text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as 'All' | MacroRegion)}
              className="bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#323643] text-[#111214] dark:text-[#F4F5F7] rounded-xl px-2.5 py-1.5 text-[11px] font-medium"
            >
              <option value="All">All Regions (41)</option>
              <option value="North America">North America</option>
              <option value="UK & Western Europe">UK & Western EU</option>
              <option value="Nordics & Baltics">Nordics & Baltics</option>
              <option value="Southern & Central Europe">Southern & Central EU</option>
              <option value="Balkans & Eastern Europe">Balkans, TR, GE, UA</option>
              <option value="Middle East & South Asia">UAE, KSA, Pakistan</option>
            </select>

            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as 'All' | AgencyTier)}
              className="bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#323643] text-[#111214] dark:text-[#F4F5F7] rounded-xl px-2.5 py-1.5 text-[11px] font-medium"
            >
              <option value="All">All Income Tiers</option>
              <option value="Tier 1">Tier 1 Core</option>
              <option value="Tier 2A">Tier 2A High-Growth</option>
              <option value="Tier 2B">Tier 2B</option>
              <option value="Tier 3">Tier 3 Emerging</option>
              <option value="Tier 4">Tier 4 Rapid-Close</option>
            </select>
          </div>

          <div className="max-h-[600px] overflow-y-auto space-y-1.5 pr-1">
            {filteredCountries.map((c) => {
              const active = c.id === selectedCountry.id;
              const crmCount = heatmapAnalytics.countryProspectCounts[c.id] || 0;
              const topScore = heatmapAnalytics.countryTopOpportunityScore[c.id] || 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCountryId(c.id)}
                  className={`w-full text-left rounded-2xl p-3 border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#111214] dark:bg-[#23262F] text-white border-[#111214] dark:border-[#D9F154]'
                      : 'bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] border-[#ECEEE8] dark:border-[#282B35] hover:border-[#C4C7CE] dark:hover:border-[#3E4352]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold truncate">{c.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {crmCount > 0 && (
                        <span
                          title={`CRM Heat Score ${topScore}/100`}
                          className={`text-[10px] font-mono-tabular font-semibold px-1.5 py-0.5 rounded-full ${
                            active
                              ? 'bg-[#6AE4C0] text-[#111214]'
                              : 'bg-[#6AE4C0]/25 text-[#0E5A47] dark:bg-[#6AE4C0]/20 dark:text-[#6AE4C0]'
                          }`}
                        >
                          {crmCount} CRM
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-mono-tabular font-semibold px-2 py-0.5 rounded-full ${
                          active
                            ? 'bg-[#D9F154] text-[#111214]'
                            : 'bg-[#E5E7E2] dark:bg-[#2A2D38] text-[#111214] dark:text-[#E5E7E2]'
                        }`}
                      >
                        {c.tier}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`mt-1 text-[11px] flex items-center justify-between gap-2 ${
                      active ? 'text-[#C9CDD4]' : 'text-[#666A73] dark:text-[#9CA3AF]'
                    }`}
                  >
                    <span className="truncate">
                      {c.macroRegion} · Comp: {c.competition}
                    </span>
                    <span className="font-mono-tabular shrink-0">
                      {formatMoneyRange(c.retainerRangeUsd[0], c.retainerRangeUsd[1], currency)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANEL (8 cols) */}
        <div className="xl:col-span-8 space-y-5">
          {/* SUB-TAB A: COUNTRY INTELLIGENCE MATRIX */}
          {activeSubTab === 'matrix' && (
            <>
              {/* CRM OPPORTUNITY HEATMAP & LOW-COMPETITION RADAR */}
              <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Flame className="w-4 h-4 text-[#FF5E5B]" />
                      <h2 className="text-base font-display font-bold">
                        CRM Prospect Density &amp; Low-Competition Opportunity Heatmap
                      </h2>
                    </div>
                    <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
                      Ranks live CRM prospect clusters by pipeline density weighted against local agency competition so you double down on high-traction, lower-saturation territories.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openGlobalHeatmapView}
                    className="px-3.5 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Open Live Map Heatmap
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35]">
                    <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                      Mapped CRM Prospects
                    </div>
                    <div className="text-base font-bold font-mono-tabular mt-0.5">
                      {heatmapAnalytics.mappedProspectCount}{' '}
                      <span className="text-[11px] font-normal text-[#666A73] dark:text-[#9CA3AF]">
                        across {heatmapAnalytics.clusters.length} cities
                      </span>
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35]">
                    <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                      Low-Comp Sweet Spots
                    </div>
                    <div className="text-base font-bold font-mono-tabular mt-0.5 text-[#0E5A47] dark:text-[#6AE4C0]">
                      {heatmapAnalytics.sweetSpotClusterCount}{' '}
                      <span className="text-[11px] font-normal text-[#666A73] dark:text-[#9CA3AF]">
                        Low / Low-Med
                      </span>
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35]">
                    <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                      Top Opportunity Zone
                    </div>
                    <div className="text-sm font-bold truncate mt-0.5">
                      {heatmapAnalytics.topOpportunityCluster
                        ? `${heatmapAnalytics.topOpportunityCluster.cityName} (${heatmapAnalytics.topOpportunityCluster.opportunityHeatScore}/100)`
                        : 'Add CRM Leads'}
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35]">
                    <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                      Avg Sweet-Spot Ticket
                    </div>
                    <div className="text-base font-bold font-mono-tabular mt-0.5">
                      {heatmapAnalytics.avgSweetSpotTicketUsd > 0
                        ? formatMoney(heatmapAnalytics.avgSweetSpotTicketUsd, currency)
                        : '—'}
                    </div>
                  </div>
                </div>

                {heatmapAnalytics.clusters.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {heatmapAnalytics.clusters.slice(0, 6).map((cluster) => {
                      const sweetSpot = isLowCompetitionTier(cluster.competition);
                      return (
                        <div
                          key={cluster.key}
                          className={`rounded-2xl p-3.5 border space-y-2.5 transition-colors ${
                            sweetSpot
                              ? 'bg-[#F8FBF4] dark:bg-[#1A201E] border-[#CBE5A0] dark:border-[#D9F154]/40'
                              : 'bg-[#FAFAF8] dark:bg-[#1C1F26] border-[#ECEEE8] dark:border-[#282B35]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">
                                {cluster.cityName}, {cluster.countryName}
                              </div>
                              <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF] truncate">
                                {cluster.topNiche}
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${competitionBadgeClasses(
                                cluster.competition
                              )}`}
                            >
                              {cluster.competition} Comp
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-[#555963] dark:text-[#A1A6B3]">
                                Opportunity Heat
                              </span>
                              <span className="font-mono-tabular font-bold">
                                {cluster.opportunityHeatScore}/100
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-[#E5E7E2] dark:bg-[#2A2D38] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-[#6AE4C0] via-[#D9F154] to-[#FF5E5B]"
                                style={{ width: `${cluster.opportunityHeatScore}%` }}
                              />
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-[#3D404A] dark:text-[#C9CDD4] font-mono-tabular">
                            <span>
                              {cluster.prospectCount} CRM ({cluster.hotCount} Hot)
                            </span>
                            <span>{formatMoney(cluster.totalPipelineUsd, currency)}</span>
                          </div>

                          <button
                            type="button"
                            onClick={() => openClusterOnMapHeatmap(cluster)}
                            className="w-full py-1.5 px-2.5 rounded-xl bg-[#111214] dark:bg-[#252833] hover:bg-[#23262F] dark:hover:bg-[#323643] text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Target className="w-3 h-3 text-[#D9F154]" />
                            Inspect on Heatmap
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35] p-4 text-xs text-[#666A73] dark:text-[#9CA3AF]">
                    Add or import prospects in your CRM to plot regional density and low-competition opportunity hotspots automatically.
                  </div>
                )}
              </div>
              <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold text-[#666A73] dark:text-[#9CA3AF]">
                      {selectedCountry.macroRegion} · {selectedCountry.tierLabel}
                    </div>
                    <h2 className="text-2xl font-display font-bold mt-0.5">
                      {selectedCountry.name}
                    </h2>
                    <p className="text-xs text-[#3D404A] dark:text-[#C9CDD4] mt-1.5 max-w-2xl leading-relaxed">
                      {selectedCountry.purchasingPowerNote}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveSubTab('auto-prospector')}
                      className="px-3.5 py-2 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Auto-Prospect Niches
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSubTab('maps-scraper');
                        executeMapsScrape({
                          cityOverride: defaultCity?.name || selectedCountry.name,
                          nicheOverride: selectedCountry.topOperatingNiches[0] || scrapeNiche,
                        });
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#F3F4F1] dark:bg-[#23262F] border border-[#D9DBD5] dark:border-[#323643] text-[#111214] dark:text-[#F4F5F7] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      Scan Map &amp; GMB Pins
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenPricingEngine(selectedCountry.id)}
                      className="px-3.5 py-2 rounded-xl bg-[#C8B6FF] text-[#111214] text-xs font-semibold cursor-pointer"
                    >
                      Pricing Engine
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenOutreachGenerator(selectedCountry.id)}
                      className="px-3.5 py-2 rounded-xl bg-[#111214] dark:bg-[#252833] text-white dark:border dark:border-[#323643] text-xs font-semibold cursor-pointer"
                    >
                      Outreach Scripts
                    </button>
                  </div>
                </div>

                {/* Suitability & Metrics Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div className="p-3.5 rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35]">
                    <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Median Income</div>
                    <div className="text-base font-bold font-mono-tabular mt-0.5">
                      {formatMoney(selectedCountry.medianIncomeUsd, currency)}
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35]">
                    <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">SEO Suitability</div>
                    <div className="text-base font-bold font-mono-tabular mt-0.5">
                      {selectedCountry.serviceSuitability.seo.score}/100
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35]">
                    <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Web Dev Fit</div>
                    <div className="text-base font-bold font-mono-tabular mt-0.5">
                      {selectedCountry.serviceSuitability.webDev.score}/100
                    </div>
                  </div>
                  <div className="p-3.5 rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35]">
                    <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">AI Automation Fit</div>
                    <div className="text-base font-bold font-mono-tabular mt-0.5">
                      {selectedCountry.serviceSuitability.automation.score}/100
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-4 rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35]">
                    <div className="font-bold mb-1.5">Top Operating Niches</div>
                    <ul className="space-y-1 text-[#3D404A] dark:text-[#C9CDD4]">
                      {selectedCountry.topOperatingNiches.map((n) => (
                        <li key={n}>· {n}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#EDE7FF]/55 dark:bg-[#C8B6FF]/15 border border-[#DDD4FA] dark:border-[#C8B6FF]/35">
                    <div className="font-bold mb-1.5">Future Niche Opportunities</div>
                    <ul className="space-y-1 text-[#3D404A] dark:text-[#E5DEFF]">
                      {selectedCountry.futureNicheOpportunities.map((n) => (
                        <li key={n}>· {n}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35]">
                    <div className="font-bold mb-1.5">Required Skills & Stack</div>
                    <ul className="space-y-1 text-[#3D404A] dark:text-[#C9CDD4]">
                      {selectedCountry.requiredSkills.map((n) => (
                        <li key={n}>· {n}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Editable User Market Notes */}
                <div>
                  <label className="text-[11px] font-semibold uppercase text-[#666A73] dark:text-[#9CA3AF]">
                    Your Custom Prospecting Notes for {selectedCountry.name}
                  </label>
                  <input
                    value={customMarketNotes[selectedCountry.id] || ''}
                    onChange={(e) => onSaveMarketNote(selectedCountry.id, e.target.value)}
                    placeholder="Log local partners, language tips, or outreach wins..."
                    className="mt-1 w-full rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] px-3 py-2 text-xs text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280]"
                  />
                </div>
              </div>

              {/* STATES / PROVINCES & NESTED CITIES */}
              <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-display font-bold">
                    States / Provinces & Major Cities ({selectedCountry.statesOrRegions.length})
                  </h3>
                  <span className="text-xs text-[#666A73] dark:text-[#9CA3AF]">
                    Click a state/province to inspect city tiers & winning offers
                  </span>
                </div>

                <div className="space-y-2">
                  {selectedCountry.statesOrRegions.map((st) => {
                    const key = `${selectedCountry.id}-${st.code}`;
                    const open = expandedStates[key] ?? selectedCountry.statesOrRegions.length <= 4;
                    return (
                      <div key={key} className="rounded-2xl border border-[#E5E7E2] dark:border-[#282B35] overflow-hidden">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedStates((prev) => ({ ...prev, [key]: !open }))
                          }
                          className="w-full px-4 py-3 bg-[#FAFAF8] dark:bg-[#1C1F26] hover:bg-[#F3F4F1] dark:hover:bg-[#23262F] flex flex-wrap items-center justify-between gap-2 text-left cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            {open ? (
                              <ChevronDown className="w-4 h-4 text-[#555963] dark:text-[#A1A6B3]" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-[#555963] dark:text-[#A1A6B3]" />
                            )}
                            <span className="text-xs font-bold">{st.name}</span>
                            <span className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                              · {st.tier} · Comp: {st.competition}
                            </span>
                          </div>
                          <div className="text-xs font-mono-tabular font-semibold">
                            {formatMoney(st.medianIncomeUsd, currency)} · {st.retainerRangeUsd}
                          </div>
                        </button>

                        {open && (
                          <div className="p-3.5 bg-white dark:bg-[#16181E] border-t border-[#EFEFEF] dark:border-[#242731] grid grid-cols-1 md:grid-cols-2 gap-3">
                            {st.cities.map((city, idx) => (
                              <div
                                key={`${key}-${city.name}-${idx}`}
                                className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#ECEEE8] dark:border-[#282B35] p-3.5 space-y-1.5"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold">{city.name}</span>
                                  <span className="text-[11px] font-mono-tabular font-semibold px-2 py-0.5 rounded-full bg-[#D9F154] text-[#111214]">
                                    {city.tier}
                                  </span>
                                </div>
                                <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                                  Income: {formatMoney(city.medianIncomeUsd, currency)} · Comp:{' '}
                                  {city.competition}
                                </div>
                                <div className="text-[11px] text-[#3D404A] dark:text-[#C9CDD4]">
                                  Niches: {city.topNiches.join(' · ')}
                                </div>
                                <div className="text-[11px] font-medium text-[#111214] dark:text-[#F4F5F7]">
                                  Offer: {city.winningOffer}
                                </div>
                                <div className="pt-1 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextNiche = city.topNiches[0] || scrapeNiche;
                                      setScrapeCity(city.name);
                                      setScrapeNiche(nextNiche);
                                      setActiveSubTab('maps-scraper');
                                      executeMapsScrape({
                                        cityOverride: city.name,
                                        nicheOverride: nextNiche,
                                        centerOverride: {
                                          lat: city.lat,
                                          lng: city.lng,
                                          radiusMeters: scrapeRadiusMeters,
                                        },
                                      });
                                    }}
                                    className="text-[11px] font-semibold underline cursor-pointer text-[#111214] dark:text-[#D9F154]"
                                  >
                                    Scrape Map & GMB Pins
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setResearchCity(city.name);
                                      setResearchNiche(city.topNiches[0] || researchNiche);
                                      setActiveSubTab('search-intel');
                                    }}
                                    className="text-[11px] font-semibold underline cursor-pointer text-[#111214] dark:text-[#C8B6FF]"
                                  >
                                    Analyze Search Volume
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* SUB-TAB B: AUTOMATED HIGH-TICKET NICHE PROSPECTOR -> CRM */}
          {activeSubTab === 'auto-prospector' && (
            <AutomatedNicheProspector
              selectedCountry={selectedCountry}
              currency={currency}
              existingProspects={existingProspects}
              onBatchImportProspects={onBatchImportProspects}
              onPlotBatchOnMap={(batchLeads, city, niche) => {
                setScrapedLeads(batchLeads);
                setLeadsVersion((v) => v + 1);
                setScrapeCity(city);
                setScrapeNiche(niche);
                const firstPin =
                  batchLeads.find((l) => l.lat !== null && l.lng !== null) || null;
                setSelectedLeadPin(firstPin);
                setActiveSubTab('maps-scraper');
              }}
              onOpenGmailForLead={onOpenGmailForLead}
            />
          )}

          {/* SUB-TAB C: GOOGLE MAPS MARKER OVERLAY & GMB PROFILE INSPECTOR */}
          {activeSubTab === 'maps-scraper' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-display font-bold">
                      Google Maps Marker Overlay & Business Profile Inspector
                    </h2>
                    <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
                      Search any keyword & area in {selectedCountry.name}. Click any map pin to inspect the business&apos;s Google Business Profile, missing-website gaps, and run quick actions.
                    </p>
                  </div>
                  {scrapedLeads.length > 0 && (
                    <div className="text-[11px] font-mono-tabular bg-[#F3F4F1] dark:bg-[#23262F] border border-[#E2E4DF] dark:border-[#323643] px-3 py-1.5 rounded-xl">
                      {scrapedLeads.filter((l) => l.leadPriority === 'Hot').length} Hot ·{' '}
                      {scrapedLeads.filter((l) => !l.website).length} No Website
                    </div>
                  )}
                </div>

                <form
                  onSubmit={handleRunMapsScrape}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2.5"
                >
                  <input
                    value={scrapeNiche}
                    onChange={(e) => setScrapeNiche(e.target.value)}
                    placeholder="Search keyword / niche (e.g. HVAC, Dental Clinic, Roofing)"
                    className="md:col-span-5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280]"
                  />
                  <input
                    value={scrapeCity}
                    onChange={(e) => setScrapeCity(e.target.value)}
                    placeholder={`City or area (e.g. ${defaultCity?.name || selectedCountry.name})`}
                    className="md:col-span-3 rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280]"
                  />
                  <select
                    value={scrapeRadiusMeters}
                    onChange={(e) => setScrapeRadiusMeters(Number(e.target.value))}
                    className="md:col-span-2 rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-2.5 py-2 text-xs bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7]"
                  >
                    <option value={5000}>5 km radius</option>
                    <option value={15000}>15 km radius</option>
                    <option value={20000}>20 km radius</option>
                    <option value={45000}>45 km radius</option>
                  </select>
                  <button
                    type="submit"
                    disabled={scraping}
                    className="md:col-span-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] px-3.5 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                  >
                    {scraping ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    {scraping ? 'Scanning...' : 'Find Pins'}
                  </button>
                </form>

                {scrapeError && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700/60 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                    {scrapeError}
                  </div>
                )}

                {/* CRM Opportunity Heatmap Control Bar */}
                <div className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35] p-3 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setHeatmapEnabled((v) => !v)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors ${
                          heatmapEnabled
                            ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                            : 'bg-white dark:bg-[#23262F] text-[#555963] dark:text-[#A1A6B3] border border-[#D9DBD5] dark:border-[#323643]'
                        }`}
                      >
                        <Flame className="w-3.5 h-3.5" />
                        CRM Heatmap: {heatmapEnabled ? 'ON' : 'OFF'}
                      </button>

                      <div className="flex flex-wrap items-center gap-1 bg-white dark:bg-[#16181E] p-1 rounded-xl border border-[#E2E4DF] dark:border-[#282B35]">
                        {(
                          [
                            { id: 'opportunity', label: 'Opportunity (Density × Low Comp)' },
                            { id: 'density', label: 'CRM Density' },
                            { id: 'low-competition', label: 'Low Comp Markets' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setHeatmapMode(opt.id);
                              setHeatmapEnabled(true);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer transition-colors ${
                              heatmapMode === opt.id
                                ? 'bg-[#D9F154] text-[#111214]'
                                : 'text-[#555963] dark:text-[#A1A6B3] hover:text-[#111214] dark:hover:text-[#F4F5F7]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setShowClusterBadges((v) => !v)}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border cursor-pointer ${
                          showClusterBadges
                            ? 'bg-[#6AE4C0]/20 border-[#6AE4C0]/60 text-[#0E5A47] dark:text-[#6AE4C0]'
                            : 'bg-white dark:bg-[#23262F] border-[#E2E4DF] dark:border-[#323643] text-[#555963] dark:text-[#A1A6B3]'
                        }`}
                      >
                        Region Pins: {showClusterBadges ? 'ON' : 'OFF'}
                      </button>

                      <div className="flex items-center gap-1 bg-white dark:bg-[#16181E] p-1 rounded-xl border border-[#E2E4DF] dark:border-[#282B35]">
                        {(['compact', 'balanced', 'macro'] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setHeatmapSpread(sz)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold cursor-pointer ${
                              heatmapSpread === sz
                                ? 'bg-[#111214] dark:bg-[#C8B6FF] text-white dark:text-[#111214]'
                                : 'text-[#666A73] dark:text-[#9CA3AF]'
                            }`}
                          >
                            {HEATMAP_SPREAD_CONFIG[sz].label}
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => triggerHeatmapFit('world')}
                        className="px-2.5 py-1 rounded-xl bg-white dark:bg-[#23262F] border border-[#D9DBD5] dark:border-[#323643] text-[11px] font-semibold flex items-center gap-1 cursor-pointer hover:border-[#111214] dark:hover:border-[#D9F154]"
                      >
                        <Compass className="w-3 h-3" />
                        Global CRM View
                      </button>
                      <button
                        type="button"
                        onClick={() => triggerHeatmapFit('country')}
                        className="px-2.5 py-1 rounded-xl bg-white dark:bg-[#23262F] border border-[#D9DBD5] dark:border-[#323643] text-[11px] font-semibold cursor-pointer hover:border-[#111214] dark:hover:border-[#D9F154]"
                      >
                        Focus {selectedCountry.isoCode}
                      </button>
                    </div>
                  </div>

                  {/* Thermal Color Scale & Quick Sweet-Spot Jump Chips */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[#666A73] dark:text-[#9CA3AF] font-medium">
                        Heat Scale:
                      </span>
                      <span className="text-[#0E5A47] dark:text-[#6AE4C0] font-semibold">
                        Low / Crowded
                      </span>
                      <div className="w-28 h-2 rounded-full bg-gradient-to-r from-[#6AE4C0] via-[#D9F154] via-[#FFCD42] to-[#FF4C5B]" />
                      <span className="text-[#D43835] dark:text-[#FF786C] font-semibold">
                        High Density + Low Comp
                      </span>
                    </div>

                    {heatmapAnalytics.clusters.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[#666A73] dark:text-[#9CA3AF]">
                          Hotspots:
                        </span>
                        {heatmapAnalytics.clusters.slice(0, 4).map((cl) => (
                          <button
                            key={cl.key}
                            type="button"
                            onClick={() => openClusterOnMapHeatmap(cl)}
                            className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold cursor-pointer transition-colors ${
                              selectedHeatCluster?.key === cl.key
                                ? 'bg-[#111214] text-[#D9F154] border-[#111214] dark:bg-[#D9F154] dark:text-[#111214]'
                                : 'bg-white dark:bg-[#16181E] text-[#111214] dark:text-[#E5E7E2] border-[#D9DBD5] dark:border-[#323643] hover:border-[#111214] dark:hover:border-[#D9F154]'
                            }`}
                          >
                            {cl.cityName} · {cl.opportunityHeatScore}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Interactive @vis.gl/react-google-maps Canvas + Heatmap + Marker Overlay */}
                {mapsApiKey ? (
                  <div className="relative h-[500px] w-full rounded-2xl overflow-hidden border border-[#E2E4DF] dark:border-[#282B35] bg-[#ECEEE8] dark:bg-[#1C1F26]">
                    <APIProvider
                      apiKey={mapsApiKey}
                      libraries={['places', 'marker', 'core']}
                      language="en"
                      region={selectedCountry.isoCode}
                    >
                      <GoogleMap
                        mapId="DEMO_MAP_ID"
                        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                        defaultCenter={initialMapCenter}
                        defaultZoom={11}
                        gestureHandling="greedy"
                        style={{ width: '100%', height: '100%' }}
                        onClick={() => {
                          setSelectedLeadPin(null);
                          setSelectedHeatCluster(null);
                        }}
                      >
                        <MapViewportController
                          leads={filteredScrapedLeads}
                          leadsVersion={leadsVersion}
                          focusedLead={selectedLeadPin}
                          countryCenter={initialMapCenter}
                          selectedCountryId={selectedCountry.id}
                          heatmapClusters={heatmapAnalytics.clusters}
                          heatmapFitRequest={heatmapFitRequest}
                          onViewportMoved={handleViewportMoved}
                        />

                        <ProspectHeatmapOverlay
                          visible={heatmapEnabled}
                          points={heatmapPoints}
                          mode={heatmapMode}
                          radiusPixels={HEATMAP_SPREAD_CONFIG[heatmapSpread].radiusPixels}
                          intensity={HEATMAP_SPREAD_CONFIG[heatmapSpread].intensity}
                        />

                        {heatmapEnabled &&
                          showClusterBadges &&
                          heatmapAnalytics.clusters.map((cluster) => {
                            const isSelected = selectedHeatCluster?.key === cluster.key;
                            const sweetSpot = isLowCompetitionTier(cluster.competition);
                            return (
                              <AdvancedMarker
                                key={`heat-${cluster.key}`}
                                position={{ lat: cluster.lat, lng: cluster.lng }}
                                zIndex={isSelected ? 45 : sweetSpot ? 18 : 12}
                                onClick={() => {
                                  setSelectedLeadPin(null);
                                  setSelectedHeatCluster(cluster);
                                }}
                              >
                                <div
                                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-lg border-2 cursor-pointer transition-transform ${
                                    isSelected
                                      ? 'bg-[#111214] text-[#D9F154] border-[#D9F154] scale-110'
                                      : sweetSpot
                                        ? 'bg-[#111214]/90 text-[#6AE4C0] border-[#6AE4C0] hover:scale-105'
                                        : 'bg-[#16181E]/90 text-[#F4F5F7] border-[#9CA3AF] hover:scale-105'
                                  }`}
                                >
                                  <Flame
                                    className={`w-3 h-3 shrink-0 ${
                                      sweetSpot ? 'text-[#D9F154]' : 'text-[#FF786C]'
                                    }`}
                                  />
                                  <span className="max-w-[96px] truncate">{cluster.cityName}</span>
                                  <span className="px-1.5 py-0.2 rounded-full bg-white/15 font-mono-tabular text-[10px]">
                                    {cluster.prospectCount} · {cluster.opportunityHeatScore}
                                  </span>
                                </div>
                              </AdvancedMarker>
                            );
                          })}

                        {selectedHeatCluster && (
                          <InfoWindow
                            position={{
                              lat: selectedHeatCluster.lat,
                              lng: selectedHeatCluster.lng,
                            }}
                            pixelOffset={[0, -34]}
                            onCloseClick={() => setSelectedHeatCluster(null)}
                          >
                            <div className="text-xs text-[#111214] w-[265px] space-y-2 p-0.5">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-bold text-sm leading-tight">
                                    {selectedHeatCluster.cityName}, {selectedHeatCluster.countryName}
                                  </div>
                                  <div className="text-[11px] text-[#555963] mt-0.5">
                                    {selectedHeatCluster.stateName} · {selectedHeatCluster.tier}
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded-full bg-[#111214] text-[#D9F154] text-[10px] font-mono-tabular font-bold shrink-0">
                                  Score {selectedHeatCluster.opportunityHeatScore}/100
                                </span>
                              </div>

                              <div className="grid grid-cols-2 gap-1.5 text-[11px] bg-[#F3F4F1] rounded-lg p-2">
                                <div>
                                  <div className="text-[#666A73]">CRM Density</div>
                                  <div className="font-bold">
                                    {selectedHeatCluster.prospectCount} leads ({selectedHeatCluster.hotCount} Hot)
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[#666A73]">Agency Comp</div>
                                  <div className="font-bold">{selectedHeatCluster.competition}</div>
                                </div>
                                <div>
                                  <div className="text-[#666A73]">Pipeline Value</div>
                                  <div className="font-bold font-mono-tabular">
                                    {formatMoney(selectedHeatCluster.totalPipelineUsd, currency)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[#666A73]">Top Niche</div>
                                  <div className="font-bold truncate">
                                    {selectedHeatCluster.topNiche}
                                  </div>
                                </div>
                              </div>

                              <div className="text-[11px] text-[#3D404A]">
                                <span className="font-semibold">Winning Offer:</span>{' '}
                                {selectedHeatCluster.winningOffer}
                              </div>

                              <div className="flex flex-wrap gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCountryId(selectedHeatCluster.countryId);
                                    setScrapeCity(selectedHeatCluster.cityName);
                                    setScrapeNiche(selectedHeatCluster.topNiche);
                                    executeMapsScrape({
                                      cityOverride: selectedHeatCluster.cityName,
                                      nicheOverride: selectedHeatCluster.topNiche,
                                      centerOverride: {
                                        lat: selectedHeatCluster.lat,
                                        lng: selectedHeatCluster.lng,
                                        radiusMeters: scrapeRadiusMeters,
                                      },
                                    });
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-[#111214] text-[#D9F154] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <TrendingUp className="w-3 h-3" />
                                  Scan GMB Pins Here
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCountryId(selectedHeatCluster.countryId);
                                    setActiveSubTab('auto-prospector');
                                  }}
                                  className="px-2.5 py-1.5 rounded-lg bg-[#D9F154] text-[#111214] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Zap className="w-3 h-3" />
                                  Auto-Prospect
                                </button>
                              </div>
                            </div>
                          </InfoWindow>
                        )}

                        {filteredScrapedLeads.map((lead) => {
                          if (lead.lat === null || lead.lng === null) return null;
                          const isSelected = selectedLeadPin?.placeId === lead.placeId;
                          const isImported = isLeadInCrm(lead);
                          const isHot = lead.leadPriority === 'Hot';
                          return (
                            <AdvancedMarker
                              key={lead.placeId}
                              position={{ lat: lead.lat, lng: lead.lng }}
                              zIndex={isSelected ? 50 : isHot ? 20 : 10}
                              onClick={() => {
                                setSelectedHeatCluster(null);
                                setSelectedLeadPin(lead);
                              }}
                            >
                              <div
                                className={`group flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-md border-2 transition-transform cursor-pointer ${
                                  isSelected
                                    ? 'bg-[#111214] text-[#D9F154] border-[#D9F154] scale-115'
                                    : isImported
                                      ? 'bg-[#6AE4C0] text-[#111214] border-[#111214]'
                                      : isHot
                                        ? 'bg-[#FF786C] text-[#111214] border-[#111214] hover:scale-105'
                                        : 'bg-[#D9F154] text-[#111214] border-[#111214] hover:scale-105'
                                }`}
                              >
                                <MapPin className="w-3 h-3 shrink-0" />
                                <span className="max-w-[110px] truncate">{lead.businessName}</span>
                                {!lead.website ? (
                                  <span className="px-1 rounded bg-[#111214] text-white text-[9px] font-mono-tabular">
                                    No Web
                                  </span>
                                ) : lead.rating !== null ? (
                                  <span className="font-mono-tabular text-[10px]">
                                    {lead.rating.toFixed(1)}★
                                  </span>
                                ) : null}
                              </div>
                            </AdvancedMarker>
                          );
                        })}

                        {selectedLeadPin &&
                          selectedLeadPin.lat !== null &&
                          selectedLeadPin.lng !== null && (
                            <InfoWindow
                              position={{ lat: selectedLeadPin.lat, lng: selectedLeadPin.lng }}
                              pixelOffset={[0, -34]}
                              onCloseClick={() => setSelectedLeadPin(null)}
                            >
                              <div className="text-xs text-[#111214] w-[260px] space-y-2 p-0.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="font-bold text-sm leading-tight">
                                      {selectedLeadPin.businessName}
                                    </div>
                                    <div className="text-[11px] text-[#555963] mt-0.5">
                                      {selectedLeadPin.primaryType || scrapeNiche} ·{' '}
                                      {selectedLeadPin.businessStatus === 'OPERATIONAL'
                                        ? 'Operational'
                                        : selectedLeadPin.businessStatus}
                                    </div>
                                  </div>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                      selectedLeadPin.leadPriority === 'Hot'
                                        ? 'bg-[#FF786C] text-[#111214]'
                                        : 'bg-[#D9F154] text-[#111214]'
                                    }`}
                                  >
                                    {selectedLeadPin.leadPriority}
                                  </span>
                                </div>

                                {selectedLeadPin.rating !== null && (
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                                    <span>{selectedLeadPin.rating.toFixed(1)}</span>
                                    <span className="text-[#666A73] font-normal">
                                      ({selectedLeadPin.reviewCount} Google reviews)
                                    </span>
                                  </div>
                                )}

                                <div className="text-[11px] text-[#3D404A]">
                                  {selectedLeadPin.formattedAddress}
                                </div>

                                <div className="rounded-lg bg-[#F3F4F1] p-2 text-[11px] font-medium">
                                  {selectedLeadPin.opportunitySignals[0]}
                                </div>

                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {ensureHttpUrl(selectedLeadPin.googleMapsUri) && (
                                    <a
                                      href={ensureHttpUrl(selectedLeadPin.googleMapsUri)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="px-2.5 py-1.5 rounded-lg bg-[#111214] text-[#D9F154] text-[11px] font-semibold inline-flex items-center gap-1 no-underline"
                                    >
                                      <Store className="w-3 h-3" />
                                      GMB Profile
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    disabled={isLeadInCrm(selectedLeadPin)}
                                    onClick={() => handleImportLead(selectedLeadPin)}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#D9F154] text-[#111214] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
                                  >
                                    {isLeadInCrm(selectedLeadPin) ? (
                                      <>
                                        <Check className="w-3 h-3" /> Imported
                                      </>
                                    ) : (
                                      <>
                                        <Plus className="w-3 h-3" /> Import CRM
                                      </>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleEmailScrapedLead(selectedLeadPin)}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#111214] text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Mail className="w-3 h-3 text-[#D9F154]" /> Gmail
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleLaunchOutreachForLead(selectedLeadPin)}
                                    className="px-2.5 py-1.5 rounded-lg bg-[#C8B6FF] text-[#111214] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                                  >
                                    <Send className="w-3 h-3" /> Scripts
                                  </button>
                                </div>
                              </div>
                            </InfoWindow>
                          )}
                      </GoogleMap>
                    </APIProvider>

                    {/* TOP-LEFT OVERLAY: PIN PRIORITY FILTER & LEGEND */}
                    <div className="absolute top-3 left-3 z-10 flex flex-wrap items-center gap-1.5 bg-[#111214]/92 text-white px-2.5 py-1.5 rounded-2xl border border-[#2C2F36] shadow-lg">
                      {(
                        [
                          { id: 'All', label: `All (${scrapedLeads.length})` },
                          {
                            id: 'Hot',
                            label: `Hot (${scrapedLeads.filter((l) => l.leadPriority === 'Hot').length})`,
                          },
                          {
                            id: 'Warm',
                            label: `Warm (${scrapedLeads.filter((l) => l.leadPriority === 'Warm').length})`,
                          },
                          {
                            id: 'Imported',
                            label: `CRM (${scrapedLeads.filter((l) => isLeadInCrm(l)).length})`,
                          },
                        ] as const
                      ).map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setPinFilter(f.id)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold cursor-pointer ${
                            pinFilter === f.id
                              ? 'bg-[#D9F154] text-[#111214]'
                              : 'text-[#C9CDD4] hover:text-white'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    {/* TOP-RIGHT OVERLAY: SEARCH CURRENT MAP AREA */}
                    {viewportCenter && (mapMovedSinceSearch || scrapedLeads.length === 0) && (
                      <button
                        type="button"
                        disabled={scraping}
                        onClick={() =>
                          executeMapsScrape({
                            centerOverride: {
                              lat: viewportCenter.lat,
                              lng: viewportCenter.lng,
                              radiusMeters: zoomToRadiusMeters(viewportCenter.zoom),
                            },
                          })
                        }
                        className="absolute top-3 right-14 z-10 px-3 py-1.5 rounded-xl bg-[#111214] text-[#D9F154] border border-[#D9F154]/60 text-xs font-semibold flex items-center gap-1.5 shadow-lg hover:bg-[#1D1F24] cursor-pointer disabled:opacity-60"
                      >
                        <Crosshair className="w-3.5 h-3.5" />
                        Search This Map Area
                      </button>
                    )}

                    {/* BOTTOM-LEFT OVERLAY: CLICKED PIN GMB QUICK-ACTION DOCK */}
                    {selectedLeadPin && (
                      <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-[380px] z-10 bg-[#111214] text-white rounded-2xl border border-[#2C2F36] p-3.5 shadow-2xl space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold truncate">
                                {selectedLeadPin.businessName}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                                  selectedLeadPin.leadPriority === 'Hot'
                                    ? 'bg-[#FF786C] text-[#111214]'
                                    : 'bg-[#D9F154] text-[#111214]'
                                }`}
                              >
                                {selectedLeadPin.leadPriority}
                              </span>
                            </div>
                            <div className="text-[11px] text-[#9A9FA8] truncate mt-0.5">
                              {selectedLeadPin.primaryType || scrapeNiche} ·{' '}
                              {selectedLeadPin.rating !== null
                                ? `${selectedLeadPin.rating.toFixed(1)}★ (${selectedLeadPin.reviewCount} reviews)`
                                : 'No ratings yet'}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedLeadPin(null)}
                            className="p-1 rounded-lg text-[#9A9FA8] hover:text-white cursor-pointer"
                            aria-label="Close pin details"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="text-[11px] text-[#C9CDD4] space-y-1">
                          <div className="truncate">{selectedLeadPin.formattedAddress}</div>
                          <div className="flex flex-wrap items-center gap-3">
                            {selectedLeadPin.phone && (
                              <button
                                type="button"
                                onClick={() => handleCopyPhone(selectedLeadPin)}
                                className="inline-flex items-center gap-1 text-[#D9F154] hover:underline cursor-pointer"
                              >
                                <Phone className="w-3 h-3" />
                                {selectedLeadPin.phone}
                                <Copy className="w-2.5 h-2.5" />
                                {copiedPhoneId === selectedLeadPin.placeId && (
                                  <span className="text-[10px] text-[#6AE4C0]">Copied</span>
                                )}
                              </button>
                            )}
                            {ensureHttpUrl(selectedLeadPin.website) ? (
                              <a
                                href={ensureHttpUrl(selectedLeadPin.website)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[#6AE4C0] hover:underline"
                              >
                                <Globe className="w-3 h-3" /> Website{' '}
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <span className="text-[#FF786C] font-semibold">
                                No Website Listed
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl bg-[#1D1F24] px-2.5 py-1.5 text-[11px] text-[#E5E7E2]">
                          {selectedLeadPin.opportunitySignals.join(' · ')}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          {ensureHttpUrl(selectedLeadPin.googleMapsUri) && (
                            <a
                              href={ensureHttpUrl(selectedLeadPin.googleMapsUri)}
                              target="_blank"
                              rel="noreferrer"
                              className="py-1.5 px-2 rounded-xl bg-[#23262E] hover:bg-[#2F333D] text-[11px] font-semibold flex items-center justify-center gap-1 text-white"
                            >
                              <Store className="w-3 h-3 text-[#D9F154]" />
                              GMB
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEmailScrapedLead(selectedLeadPin)}
                            className="py-1.5 px-2 rounded-xl bg-[#D9F154] text-[#111214] text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Mail className="w-3 h-3" /> Send Gmail
                          </button>
                          <button
                            type="button"
                            disabled={isLeadInCrm(selectedLeadPin)}
                            onClick={() => handleImportLead(selectedLeadPin)}
                            className={`py-1.5 px-2 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer ${
                              isLeadInCrm(selectedLeadPin)
                                ? 'bg-[#6AE4C0]/20 text-[#6AE4C0]'
                                : 'bg-[#23262E] text-white hover:bg-[#2F333D]'
                            }`}
                          >
                            {isLeadInCrm(selectedLeadPin) ? (
                              <>
                                <Check className="w-3 h-3" /> In CRM
                              </>
                            ) : (
                              <>
                                <Plus className="w-3 h-3" /> Add CRM
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleLaunchOutreachForLead(selectedLeadPin)}
                            className="py-1.5 px-2 rounded-xl bg-[#C8B6FF] text-[#111214] text-[11px] font-semibold flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Send className="w-3 h-3" /> Scripts
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35] p-4 text-xs text-[#666A73] dark:text-[#9CA3AF]">
                    Map preview loads automatically once the Google Maps API key is active in the environment.
                  </div>
                )}
              </div>

              {/* Scraped Lead Results List (Synced with Map Pins) */}
              {filteredScrapedLeads.length > 0 && (
                <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-display font-bold">
                      Scraped Businesses in Search Area ({filteredScrapedLeads.length})
                    </h3>
                    <span className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                      Click any business row to focus its map pin & open GMB actions
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {filteredScrapedLeads.map((lead) => {
                      const imported = isLeadInCrm(lead);
                      const isFocused = selectedLeadPin?.placeId === lead.placeId;
                      const safeWebsite = ensureHttpUrl(lead.website);
                      const safeMapsUri = ensureHttpUrl(lead.googleMapsUri);
                      return (
                        <div
                          key={lead.placeId}
                          onClick={() => setSelectedLeadPin(lead)}
                          className={`rounded-2xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 cursor-pointer transition-colors ${
                            isFocused
                              ? 'bg-[#F3F4F1] dark:bg-[#23262F] border-[#111214] dark:border-[#D9F154]'
                              : 'bg-[#FAFAF8] dark:bg-[#1C1F26] border-[#E5E7E2] dark:border-[#282B35] hover:border-[#B6B9C0] dark:hover:border-[#3E4352]'
                          }`}
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-bold text-sm">{lead.businessName}</span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  lead.leadPriority === 'Hot'
                                    ? 'bg-[#FF786C] text-[#111214]'
                                    : 'bg-[#D9F154] text-[#111214]'
                                }`}
                              >
                                {lead.leadPriority}
                              </span>
                              {lead.rating !== null && (
                                <span className="text-xs font-mono-tabular text-[#555963] dark:text-[#A1A6B3]">
                                  ★ {lead.rating.toFixed(1)} ({lead.reviewCount} reviews)
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-[#666A73] dark:text-[#9CA3AF]">
                              {lead.formattedAddress} {lead.phone ? `· ${lead.phone}` : ''}
                            </div>
                            <div className="text-[11px] font-medium text-[#111214] dark:text-[#E5E7E2]">
                              Signal: {lead.opportunitySignals.join(' · ')}
                            </div>
                            <div
                              className="flex flex-wrap items-center gap-3 text-[11px]"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {safeWebsite ? (
                                <a
                                  href={safeWebsite}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline text-[#3D404A] dark:text-[#C9CDD4] flex items-center gap-1"
                                >
                                  Website <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <span className="text-red-600 dark:text-[#FF8A80] font-semibold">No Website Listed</span>
                              )}
                              {safeMapsUri && (
                                <a
                                  href={safeMapsUri}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline font-semibold text-[#111214] dark:text-[#D9F154] flex items-center gap-1"
                                >
                                  Open Google Business Profile <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>

                          <div
                            className="flex flex-wrap items-center gap-2 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleEmailScrapedLead(lead)}
                              className="px-3 py-2 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              Send Gmail
                            </button>
                            <button
                              type="button"
                              onClick={() => handleLaunchOutreachForLead(lead)}
                              className="px-3 py-2 rounded-xl bg-[#C8B6FF] text-[#111214] text-xs font-semibold flex items-center gap-1 cursor-pointer"
                            >
                              <Send className="w-3.5 h-3.5" />
                              Outreach
                            </button>
                            <button
                              type="button"
                              disabled={imported}
                              onClick={() => handleImportLead(lead)}
                              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                                imported
                                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-[#6AE4C0]'
                                  : 'bg-[#111214] dark:bg-[#252833] text-[#D9F154] hover:bg-[#23252A] dark:hover:bg-[#323643]'
                              }`}
                            >
                              {imported ? (
                                <>
                                  <Check className="w-3.5 h-3.5" /> Imported
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" /> Import to CRM
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SUB-TAB C: GOOGLE SEARCH GROUNDING NICHE VOLUME & COMPETITION */}
          {activeSubTab === 'search-intel' && (
            <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-6 space-y-4">
              <div>
                <h2 className="text-base font-display font-bold">
                  Live Google Search Niche Demand & Competition Analyzer
                </h2>
                <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] mt-0.5">
                  Uses Gemini with real-time Google Search grounding to evaluate local search volume signals, competitor saturation, and Trojan Horse offers for {selectedCountry.name}.
                </p>
              </div>

              <form onSubmit={handleRunSearchResearch} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input
                  value={researchCity}
                  onChange={(e) => setResearchCity(e.target.value)}
                  placeholder="Target City"
                  className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280]"
                />
                <input
                  value={researchNiche}
                  onChange={(e) => setResearchNiche(e.target.value)}
                  placeholder="Target Niche"
                  className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280]"
                />
                <input
                  value={researchService}
                  onChange={(e) => setResearchService(e.target.value)}
                  placeholder="Service Focus"
                  className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] px-3 py-2 text-xs bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280]"
                />
                <button
                  type="submit"
                  disabled={researchLoading}
                  className="rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {researchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {researchLoading ? 'Researching...' : 'Analyze Market'}
                </button>
              </form>

              {researchError && (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700/60 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
                  {researchError}
                </div>
              )}

              {researchResult && (
                <div className="space-y-4 pt-2">
                  {researchResult.notice && (
                    <div className="rounded-xl bg-[#EDE7FF] dark:bg-[#C8B6FF]/15 border border-[#C8B6FF] dark:border-[#C8B6FF]/40 px-3.5 py-2 text-[11px] font-semibold text-[#111214] dark:text-[#E5DEFF]">
                      {researchResult.notice}
                    </div>
                  )}
                  <div className="rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#282B35] p-5 text-xs leading-relaxed whitespace-pre-wrap text-[#111214] dark:text-[#E5E7E2]">
                    {researchResult.markdown}
                  </div>
                  {researchResult.sources.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-semibold uppercase text-[#666A73] dark:text-[#9CA3AF]">
                        Grounded Google Search Sources
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {researchResult.sources.map((src, i) => {
                          const safeUri = ensureHttpUrl(src.uri);
                          if (!safeUri) return null;
                          return (
                            <a
                              key={`${src.uri}-${i}`}
                              href={safeUri}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] px-2.5 py-1 rounded-lg bg-[#F3F4F1] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#323643] hover:border-[#111214] dark:hover:border-[#D9F154] flex items-center gap-1"
                            >
                              <span className="truncate max-w-[240px]">{src.title}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
