import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Play,
  Plus,
  Search,
  Square,
  Store,
} from 'lucide-react';
import { formatMoney } from '../data/currency';
import { OPERATING_NICHES } from '../data/operatingNiches';
import {
  addDaysUtc,
  ensureHttpUrl,
  getLocalIsoDate,
  safeCopyText,
  safeReadJsonResponse,
} from '../lib/appUtils';
import { EmailRecipientContext } from '../lib/emailTemplates';
import { CountryMarket, CurrencyCode, Prospect } from '../types/crm';

export interface ScrapedLead {
  placeId: string;
  businessName: string;
  formattedAddress: string;
  lat: number | null;
  lng: number | null;
  phone: string;
  website: string;
  rating: number | null;
  reviewCount: number;
  googleMapsUri: string;
  primaryType: string;
  businessStatus: string;
  leadPriority: 'Hot' | 'Warm' | 'Cold';
  opportunitySignals: string[];
}

interface NichePreset {
  id: string;
  label: string;
  searchKeyword: string;
  nicheId: string;
  roleTitle: string;
  defaultOffer: string;
}

const HIGH_TICKET_NICHE_PRESETS: NichePreset[] = [
  {
    id: 'preset-dentists',
    label: 'Dentists & Implant Clinics',
    searchKeyword: 'dentists',
    nicheId: 'cosmetic-dentistry',
    roleTitle: 'Practice Director / Owner',
    defaultOffer: 'Implant & Cosmetic SEO + AI Call Intake',
  },
  {
    id: 'preset-hvac',
    label: 'HVAC Contractors',
    searchKeyword: 'HVAC contractors',
    nicheId: 'hvac-plumbing',
    roleTitle: 'Operations / Dispatch Owner',
    defaultOffer: 'Google Map Pack + 24/7 Missed-Call SMS AI',
  },
  {
    id: 'preset-law',
    label: 'Law Firms',
    searchKeyword: 'law firms',
    nicheId: 'law-firms',
    roleTitle: 'Managing Partner',
    defaultOffer: 'Legal Authority Web + AI Case Intake',
  },
  {
    id: 'preset-medspa',
    label: 'Med Spas & Aesthetics',
    searchKeyword: 'med spa',
    nicheId: 'med-spas',
    roleTitle: 'Clinic Director',
    defaultOffer: 'Luxury Funnel + AI Consultation Deposit Bot',
  },
  {
    id: 'preset-roofing',
    label: 'Roofing Contractors',
    searchKeyword: 'roofing contractors',
    nicheId: 'roofing-restoration',
    roleTitle: 'General Manager / Owner',
    defaultOffer: 'Storm Corridor SEO + 60s Speed-to-Lead AI',
  },
  {
    id: 'preset-builders',
    label: 'Custom Home Builders',
    searchKeyword: 'custom home builders',
    nicheId: 'custom-builders',
    roleTitle: 'Principal Builder',
    defaultOffer: 'Portfolio Site + High-Ticket Project Qualifier',
  },
  {
    id: 'preset-cpa',
    label: 'CPAs & Wealth Advisors',
    searchKeyword: 'wealth management CPA',
    nicheId: 'wealth-cpas',
    roleTitle: 'Senior Partner',
    defaultOffer: 'Advisory Authority Web + Calendar Setter',
  },
  {
    id: 'preset-plumbing',
    label: 'Plumbing Contractors',
    searchKeyword: 'plumbing contractors',
    nicheId: 'hvac-plumbing',
    roleTitle: 'Service Owner',
    defaultOffer: 'Emergency Dispatch Map SEO + Review Engine',
  },
];

interface CityTarget {
  key: string;
  name: string;
  stateOrRegion: string;
  tier: string;
  lat: number;
  lng: number;
}

interface ParsedRunRecord {
  lead: ScrapedLead;
  prospect: Prospect;
  city: string;
  stateOrRegion: string;
  nicheLabel: string;
  searchQuery: string;
  inCrm: boolean;
  wasDuplicate: boolean;
}

interface Props {
  selectedCountry: CountryMarket;
  currency: CurrencyCode;
  existingProspects: Prospect[];
  onBatchImportProspects: (prospects: Prospect[]) => void;
  onPlotBatchOnMap: (leads: ScrapedLead[], city: string, niche: string) => void;
  onOpenGmailForLead: (ctx: EmailRecipientContext) => void;
}

function normalizeText(value: string): string {
  const trimmed = (value || '').trim().toLowerCase();
  const ascii = trimmed.replace(/[^a-z0-9]/g, '');
  return ascii || encodeURIComponent(trimmed);
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function parseStateFromAddress(formattedAddress: string, fallbackState: string): string {
  if (fallbackState) return fallbackState;
  const parts = formattedAddress.split(',').map((p) => p.trim());
  if (parts.length >= 3) {
    return parts[parts.length - 2].replace(/\d+/g, '').trim();
  }
  return '';
}

function parseLeadToProspect(params: {
  lead: ScrapedLead;
  city: string;
  stateOrRegion: string;
  country: CountryMarket;
  nicheLabel: string;
  preset?: NichePreset;
}): Prospect {
  const { lead, city, stateOrRegion, country, nicheLabel, preset } = params;
  const today = getLocalIsoDate();
  const twoDays = addDaysUtc(today, 2);
  const matchedOperatingNiche = preset
    ? OPERATING_NICHES.find((n) => n.id === preset.nicheId)
    : OPERATING_NICHES.find(
        (n) =>
          n.name.toLowerCase().includes(nicheLabel.toLowerCase()) ||
          nicheLabel.toLowerCase().includes(n.name.toLowerCase())
      );

  const countryMid = (country.retainerRangeUsd[0] + country.retainerRangeUsd[1]) / 2;
  const nicheMid = matchedOperatingNiche
    ? (matchedOperatingNiche.baseRetainerUsd[0] + matchedOperatingNiche.baseRetainerUsd[1]) / 2
    : countryMid;
  const blendedTicketUsd = Math.round(((countryMid + nicheMid) / 2) / 50) * 50;

  const serviceInterest = !lead.website
    ? `Website Build + Map Pack SEO (${nicheLabel})`
    : preset?.defaultOffer ||
      (matchedOperatingNiche
        ? `${matchedOperatingNiche.offerStack.seo.split('+')[0].trim()} + ${matchedOperatingNiche.offerStack.automation.split('+')[0].trim()}`
        : 'Local SEO + AI Speed-to-Lead Automation');

  const sanitizedPlaceId = lead.placeId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-16);
  const ratingText =
    lead.rating !== null ? `${lead.rating.toFixed(1)}★ (${lead.reviewCount} reviews)` : 'Unrated';

  return {
    id: `p-gmp-${sanitizedPlaceId || Date.now().toString()}`,
    businessName: lead.businessName,
    contactPerson: 'Owner / Practice Manager',
    roleTitle: preset?.roleTitle || 'Decision Maker',
    email: '',
    phone: lead.phone,
    website: lead.website,
    country: country.name,
    stateOrRegion: parseStateFromAddress(lead.formattedAddress, stateOrRegion),
    city,
    categoryNiche: matchedOperatingNiche?.name || nicheLabel,
    leadQuality: lead.leadPriority,
    stage: 'New Lead',
    serviceInterest,
    ticketUsd: blendedTicketUsd,
    dateAdded: today,
    nextFollowUp: twoDays,
    lastContacted: '',
    lastMessageSent: '',
    replyNotes: [
      `Address: ${lead.formattedAddress}`,
      `GMB Rating: ${ratingText}`,
      lead.googleMapsUri ? `GMB Profile: ${lead.googleMapsUri}` : '',
      `Signals: ${lead.opportunitySignals.join('; ')}`,
    ]
      .filter(Boolean)
      .join(' | '),
    competitorAdvantage: lead.opportunitySignals[0] || 'Google Maps conversion gap',
    status: 'Active',
  };
}

export const AutomatedNicheProspector: React.FC<Props> = ({
  selectedCountry,
  currency,
  existingProspects,
  onBatchImportProspects,
  onPlotBatchOnMap,
  onOpenGmailForLead,
}) => {
  const availableCities: CityTarget[] = useMemo(() => {
    const list: CityTarget[] = [];
    selectedCountry.statesOrRegions.forEach((st) => {
      st.cities.forEach((ct) => {
        list.push({
          key: `${selectedCountry.id}-${st.code}-${ct.name}`,
          name: ct.name,
          stateOrRegion: st.name,
          tier: ct.tier,
          lat: ct.lat,
          lng: ct.lng,
        });
      });
    });
    return list;
  }, [selectedCountry]);

  const [selectedCityKeys, setSelectedCityKeys] = useState<string[]>([]);
  const [customCityInput, setCustomCityInput] = useState('');
  const [customCities, setCustomCities] = useState<CityTarget[]>([]);

  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([
    'preset-dentists',
    'preset-hvac',
    'preset-law',
  ]);
  const [customNicheInput, setCustomNicheInput] = useState('');
  const [customNiches, setCustomNiches] = useState<NichePreset[]>([]);

  const [pageSize, setPageSize] = useState<number>(15);
  const [autoParseToCrm, setAutoParseToCrm] = useState<boolean>(true);
  const [requireContactInfo, setRequireContactInfo] = useState<boolean>(true);
  const [hotLeadsOnly, setHotLeadsOnly] = useState<boolean>(false);
  const [skipDuplicates, setSkipDuplicates] = useState<boolean>(true);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
    currentLabel: string;
  }>({ completed: 0, total: 0, currentLabel: '' });
  const [scanError, setScanError] = useState<string | null>(null);
  const [parsedRecords, setParsedRecords] = useState<ParsedRunRecord[]>([]);
  const [resultFilter, setResultFilter] = useState<
    'all' | 'in-crm' | 'hot' | 'has-phone' | 'no-website'
  >('all');
  const [tableSearch, setTableSearch] = useState('');
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  const stopRequestedRef = useRef<boolean>(false);

  // Reset city selection to top 2 cities whenever country changes
  useEffect(() => {
    setSelectedCityKeys(availableCities.slice(0, 2).map((c) => c.key));
    setCustomCities([]);
    setScanError(null);
  }, [selectedCountry.id, availableCities]);

  const allCities = useMemo(
    () => [...availableCities, ...customCities],
    [availableCities, customCities]
  );

  const allNichePresets = useMemo(
    () => [...HIGH_TICKET_NICHE_PRESETS, ...customNiches],
    [customNiches]
  );

  const selectedCities = useMemo(
    () => allCities.filter((c) => selectedCityKeys.includes(c.key)),
    [allCities, selectedCityKeys]
  );

  const selectedNiches = useMemo(
    () => allNichePresets.filter((n) => selectedPresetIds.includes(n.id)),
    [allNichePresets, selectedPresetIds]
  );

  const totalQueueJobs = selectedCities.length * selectedNiches.length;

  const existingSignatures = useMemo(() => {
    const nameCitySet = new Set<string>();
    const phoneSet = new Set<string>();
    const idSet = new Set<string>();
    existingProspects.forEach((p) => {
      idSet.add(p.id);
      nameCitySet.add(`${normalizeText(p.businessName)}::${normalizeText(p.city)}`);
      const digits = normalizePhone(p.phone);
      if (digits.length >= 7) {
        phoneSet.add(digits.slice(-9));
      }
    });
    return { nameCitySet, phoneSet, idSet };
  }, [existingProspects]);

  const toggleCity = (key: string) => {
    setSelectedCityKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleNiche = (id: string) => {
    setSelectedPresetIds((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]
    );
  };

  const handleAddCustomCity = () => {
    const clean = customCityInput.trim();
    if (!clean) return;
    const key = `custom-city-${normalizeText(clean)}`;
    if (!allCities.some((c) => c.key === key)) {
      setCustomCities((prev) => [
        ...prev,
        {
          key,
          name: clean,
          stateOrRegion: '',
          tier: 'Custom',
          lat: selectedCountry.lat,
          lng: selectedCountry.lng,
        },
      ]);
    }
    setSelectedCityKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    setCustomCityInput('');
  };

  const handleAddCustomNiche = () => {
    const clean = customNicheInput.trim();
    if (!clean) return;
    const id = `custom-niche-${normalizeText(clean)}`;
    if (!allNichePresets.some((n) => n.id === id)) {
      setCustomNiches((prev) => [
        ...prev,
        {
          id,
          label: clean,
          searchKeyword: clean,
          nicheId: '',
          roleTitle: 'Owner / Decision Maker',
          defaultOffer: 'Local SEO + AI Lead Conversion System',
        },
      ]);
    }
    setSelectedPresetIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setCustomNicheInput('');
  };

  const handleStartAutomatedScan = async () => {
    if (selectedCities.length === 0 || selectedNiches.length === 0) {
      setScanError('Select at least 1 target city and 1 high-ticket niche to begin.');
      return;
    }

    stopRequestedRef.current = false;
    setIsRunning(true);
    setScanError(null);
    setParsedRecords([]);

    const jobs: { city: CityTarget; niche: NichePreset }[] = [];
    selectedCities.forEach((city) => {
      selectedNiches.forEach((niche) => {
        jobs.push({ city, niche });
      });
    });

    setProgress({
      completed: 0,
      total: jobs.length,
      currentLabel: `Preparing ${jobs.length} Google Maps searches...`,
    });

    const seenPlaceIds = new Set<string>();
    const localNameCitySeen = new Set<string>(existingSignatures.nameCitySet);
    const localPhoneSeen = new Set<string>(existingSignatures.phoneSet);

    for (let i = 0; i < jobs.length; i++) {
      if (stopRequestedRef.current) break;

      const { city, niche } = jobs[i];
      const textQuery = `${niche.searchKeyword} in ${city.name}${city.stateOrRegion ? `, ${city.stateOrRegion}` : ''}, ${selectedCountry.name}`;
      setProgress({
        completed: i,
        total: jobs.length,
        currentLabel: `Searching Google Maps (${i + 1}/${jobs.length}): ${niche.label} in ${city.name}`,
      });

      try {
        const res = await fetch('/api/maps/prospect-scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: textQuery,
            regionCode: selectedCountry.isoCode,
            locationBias: {
              lat: city.lat,
              lng: city.lng,
              radiusMeters: 25000,
            },
            pageSize,
          }),
        });

        const data = await safeReadJsonResponse<{
          leads?: ScrapedLead[];
          error?: string;
          message?: string;
        }>(res);

        if (res.status === 429 || data.error === 'RESOURCE_EXHAUSTED') {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
          setScanError(
            'Google Maps Platform quota reached. Automated scan paused to protect your remaining quota.'
          );
          break;
        }

        if (!res.ok) {
          setScanError(
            data.message || `Google Maps returned an error on "${niche.label} in ${city.name}".`
          );
          break;
        }

        const rawLeads = data.leads || [];
        const newRecords: ParsedRunRecord[] = [];
        const prospectsToAutoImport: Prospect[] = [];

        rawLeads.forEach((lead) => {
          if (!lead.placeId || seenPlaceIds.has(lead.placeId)) return;
          seenPlaceIds.add(lead.placeId);

          if (requireContactInfo && !lead.phone && !lead.website) return;
          if (hotLeadsOnly && lead.leadPriority !== 'Hot') return;

          const deterministicId = `p-gmp-${lead.placeId.replace(/[^a-zA-Z0-9_-]/g, '').slice(-16)}`;
          const sigNameCity = `${normalizeText(lead.businessName)}::${normalizeText(city.name)}`;
          const sigPhone = normalizePhone(lead.phone).slice(-9);
          const isDup =
            existingSignatures.idSet.has(deterministicId) ||
            localNameCitySeen.has(sigNameCity) ||
            (sigPhone.length >= 7 && localPhoneSeen.has(sigPhone));

          if (skipDuplicates && isDup) {
            const prospect = parseLeadToProspect({
              lead,
              city: city.name,
              stateOrRegion: city.stateOrRegion,
              country: selectedCountry,
              nicheLabel: niche.label,
              preset: niche,
            });
            newRecords.push({
              lead,
              prospect,
              city: city.name,
              stateOrRegion: city.stateOrRegion,
              nicheLabel: niche.label,
              searchQuery: textQuery,
              inCrm: true,
              wasDuplicate: true,
            });
            return;
          }

          localNameCitySeen.add(sigNameCity);
          if (sigPhone.length >= 7) localPhoneSeen.add(sigPhone);

          const prospect = parseLeadToProspect({
            lead,
            city: city.name,
            stateOrRegion: city.stateOrRegion,
            country: selectedCountry,
            nicheLabel: niche.label,
            preset: niche,
          });

          if (autoParseToCrm) {
            prospectsToAutoImport.push(prospect);
          }

          newRecords.push({
            lead,
            prospect,
            city: city.name,
            stateOrRegion: city.stateOrRegion,
            nicheLabel: niche.label,
            searchQuery: textQuery,
            inCrm: autoParseToCrm,
            wasDuplicate: false,
          });
        });

        if (prospectsToAutoImport.length > 0) {
          onBatchImportProspects(prospectsToAutoImport);
        }

        if (newRecords.length > 0) {
          setParsedRecords((prev) => [...prev, ...newRecords]);
        }

        setProgress({
          completed: i + 1,
          total: jobs.length,
          currentLabel: `Completed ${i + 1}/${jobs.length}: ${niche.label} in ${city.name}`,
        });

        // Brief pacing pause between Places API requests
        if (i < jobs.length - 1 && !stopRequestedRef.current) {
          await new Promise((resolve) => setTimeout(resolve, 260));
        }
      } catch (err) {
        setScanError(
          err instanceof Error ? err.message : 'Network error during automated Maps scan.'
        );
        break;
      }
    }

    setIsRunning(false);
  };

  const handleStopScan = () => {
    stopRequestedRef.current = true;
    setIsRunning(false);
  };

  const handleImportSingleRecord = (placeId: string) => {
    const target = parsedRecords.find((r) => r.lead.placeId === placeId);
    if (!target || target.inCrm) return;
    onBatchImportProspects([target.prospect]);
    setParsedRecords((prev) =>
      prev.map((r) => (r.lead.placeId === placeId ? { ...r, inCrm: true } : r))
    );
  };

  const handleImportAllPending = () => {
    const pending = parsedRecords.filter((r) => !r.inCrm);
    if (pending.length === 0) return;
    onBatchImportProspects(pending.map((r) => r.prospect));
    const pendingIds = new Set(pending.map((r) => r.lead.placeId));
    setParsedRecords((prev) =>
      prev.map((r) => (pendingIds.has(r.lead.placeId) ? { ...r, inCrm: true } : r))
    );
  };

  const filteredRecords = useMemo(() => {
    return parsedRecords.filter((rec) => {
      if (resultFilter === 'in-crm' && !rec.inCrm) return false;
      if (resultFilter === 'hot' && rec.lead.leadPriority !== 'Hot') return false;
      if (resultFilter === 'has-phone' && !rec.lead.phone) return false;
      if (resultFilter === 'no-website' && Boolean(rec.lead.website)) return false;
      if (tableSearch.trim()) {
        const q = tableSearch.toLowerCase();
        return (
          rec.lead.businessName.toLowerCase().includes(q) ||
          rec.city.toLowerCase().includes(q) ||
          rec.nicheLabel.toLowerCase().includes(q) ||
          rec.lead.phone.toLowerCase().includes(q) ||
          rec.lead.formattedAddress.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [parsedRecords, resultFilter, tableSearch]);

  const stats = useMemo(() => {
    const total = parsedRecords.length;
    const withPhone = parsedRecords.filter((r) => Boolean(r.lead.phone)).length;
    const withWebsite = parsedRecords.filter((r) => Boolean(r.lead.website)).length;
    const newlyImported = parsedRecords.filter((r) => r.inCrm && !r.wasDuplicate).length;
    const pendingCount = parsedRecords.filter((r) => !r.inCrm).length;
    return { total, withPhone, withWebsite, newlyImported, pendingCount };
  }, [parsedRecords]);

  return (
    <div className="space-y-4">
      {/* CONFIGURATION PANEL */}
      <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#ECEEE8] dark:border-[#242731] pb-4">
          <div className="space-y-1 max-w-2xl">
            <h2 className="text-base font-display font-bold text-[#111214] dark:text-[#F4F5F7]">
              Automated High-Ticket Niche Prospector
            </h2>
            <p className="text-xs text-[#555963] dark:text-[#A1A6B3] leading-relaxed">
              Queue automated Google Maps Places API searches across target cities in{' '}
              <span className="font-semibold text-[#111214] dark:text-[#F4F5F7]">{selectedCountry.name}</span> for
              high-ticket niches, extract phones, websites, ratings, and street addresses, and parse
              qualified businesses straight into your CRM prospect pipeline.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {isRunning ? (
              <button
                type="button"
                onClick={handleStopScan}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Square className="w-3.5 h-3.5" />
                Stop Scan
              </button>
            ) : (
              <button
                type="button"
                disabled={totalQueueJobs === 0}
                onClick={handleStartAutomatedScan}
                className="px-4 py-2 rounded-xl bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5" />
                Run Automated Scan ({totalQueueJobs} {totalQueueJobs === 1 ? 'query' : 'queries'})
              </button>
            )}
          </div>
        </div>

        {/* STEP 1: HIGH-TICKET NICHES */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#111214] dark:text-[#F4F5F7]">
              01. High-Ticket Niches ({selectedNiches.length} selected)
            </span>
            <div className="flex items-center gap-3 text-[11px]">
              <button
                type="button"
                onClick={() =>
                  setSelectedPresetIds(['preset-dentists', 'preset-hvac', 'preset-law'])
                }
                className="underline text-[#3D404A] dark:text-[#C9CDD4] hover:text-[#111214] dark:hover:text-[#D9F154] cursor-pointer whitespace-nowrap"
              >
                Core 3 (Dentists, HVAC, Law)
              </button>
              <button
                type="button"
                onClick={() => setSelectedPresetIds(allNichePresets.map((n) => n.id))}
                className="underline text-[#3D404A] dark:text-[#C9CDD4] hover:text-[#111214] dark:hover:text-[#D9F154] cursor-pointer whitespace-nowrap"
              >
                Select All
              </button>
              <button
                type="button"
                onClick={() => setSelectedPresetIds([])}
                className="underline text-[#666A73] dark:text-[#9CA3AF] hover:text-[#111214] dark:hover:text-[#F4F5F7] cursor-pointer whitespace-nowrap"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {allNichePresets.map((preset) => {
              const active = selectedPresetIds.includes(preset.id);
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => toggleNiche(preset.id)}
                  className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#111214] dark:bg-[#23262F] text-white border-[#111214] dark:border-[#D9F154]'
                      : 'bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] border-[#E2E4DF] dark:border-[#282B35] hover:border-[#111214] dark:hover:border-[#3E4352]'
                  }`}
                >
                  <div className="font-semibold truncate">{preset.label}</div>
                  <div
                    className={`text-[11px] truncate ${
                      active ? 'text-[#D9F154]' : 'text-[#666A73] dark:text-[#9CA3AF]'
                    }`}
                  >
                    &ldquo;{preset.searchKeyword}&rdquo;
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              value={customNicheInput}
              onChange={(e) => setCustomNicheInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomNiche();
                }
              }}
              placeholder="Add custom high-ticket keyword (e.g. solar installers, orthopedic clinics)..."
              className="flex-1 min-w-[220px] rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280] px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={handleAddCustomNiche}
              className="px-3 py-1.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#23262F] text-[#111214] dark:text-[#F4F5F7] hover:border-[#111214] dark:hover:border-[#D9F154] text-xs font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Niche
            </button>
          </div>
        </div>

        {/* STEP 2: TARGET CITIES */}
        <div className="space-y-2.5 pt-2 border-t border-[#ECEEE8] dark:border-[#242731]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#111214] dark:text-[#F4F5F7]">
              02. Target Cities in {selectedCountry.name} ({selectedCities.length} selected)
            </span>
            <div className="flex items-center gap-3 text-[11px]">
              <button
                type="button"
                onClick={() => setSelectedCityKeys(allCities.slice(0, 3).map((c) => c.key))}
                className="underline text-[#3D404A] dark:text-[#C9CDD4] hover:text-[#111214] dark:hover:text-[#D9F154] cursor-pointer whitespace-nowrap"
              >
                Top 3 Cities
              </button>
              <button
                type="button"
                onClick={() =>
                  setSelectedCityKeys(
                    allCities
                      .filter((c) => c.tier === 'Tier 1' || c.tier === 'Tier 2A')
                      .slice(0, 6)
                      .map((c) => c.key)
                  )
                }
                className="underline text-[#3D404A] dark:text-[#C9CDD4] hover:text-[#111214] dark:hover:text-[#D9F154] cursor-pointer whitespace-nowrap"
              >
                Tier 1 &amp; 2A Hubs
              </button>
              <button
                type="button"
                onClick={() => setSelectedCityKeys([])}
                className="underline text-[#666A73] dark:text-[#9CA3AF] hover:text-[#111214] dark:hover:text-[#F4F5F7] cursor-pointer whitespace-nowrap"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="max-h-36 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 pr-1">
            {allCities.map((city) => {
              const active = selectedCityKeys.includes(city.key);
              return (
                <button
                  key={city.key}
                  type="button"
                  onClick={() => toggleCity(city.key)}
                  className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#D9F154] text-[#111214] border-[#111214] dark:border-[#D9F154] font-semibold'
                      : 'bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] border-[#E2E4DF] dark:border-[#282B35] hover:border-[#111214] dark:hover:border-[#3E4352]'
                  }`}
                >
                  <div className="truncate">{city.name}</div>
                  <div
                    className={`text-[10px] truncate ${
                      active ? 'text-[#111214]/75' : 'text-[#555963] dark:text-[#9CA3AF]'
                    }`}
                  >
                    {[city.stateOrRegion, city.tier].filter(Boolean).join(' · ')}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              value={customCityInput}
              onChange={(e) => setCustomCityInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomCity();
                }
              }}
              placeholder={`Add any city in ${selectedCountry.name} (e.g. Scottsdale, Boca Raton)...`}
              className="flex-1 min-w-[220px] rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280] px-3 py-1.5 text-xs"
            />
            <button
              type="button"
              onClick={handleAddCustomCity}
              className="px-3 py-1.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-white dark:bg-[#23262F] text-[#111214] dark:text-[#F4F5F7] hover:border-[#111214] dark:hover:border-[#D9F154] text-xs font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add City
            </button>
          </div>
        </div>

        {/* STEP 3: PARSING & CRM IMPORT RULES */}
        <div className="pt-2 border-t border-[#ECEEE8] dark:border-[#242731] grid grid-cols-1 md:grid-cols-12 gap-3 items-center text-xs">
          <div className="md:col-span-9 flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoParseToCrm}
                onChange={(e) => setAutoParseToCrm(e.target.checked)}
                className="rounded border-[#D9DBD5] dark:border-[#323643] accent-[#111214] dark:accent-[#D9F154]"
              />
              <span className="font-semibold text-[#111214] dark:text-[#F4F5F7]">
                Auto-parse results into CRM Prospect List
              </span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={requireContactInfo}
                onChange={(e) => setRequireContactInfo(e.target.checked)}
                className="rounded border-[#D9DBD5] dark:border-[#323643] accent-[#111214] dark:accent-[#D9F154]"
              />
              <span className="text-[#3D404A] dark:text-[#C9CDD4]">Require phone or website</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hotLeadsOnly}
                onChange={(e) => setHotLeadsOnly(e.target.checked)}
                className="rounded border-[#D9DBD5] dark:border-[#323643] accent-[#111214] dark:accent-[#D9F154]"
              />
              <span className="text-[#3D404A] dark:text-[#C9CDD4]">Hot leads only (missing/weak site)</span>
            </label>

            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="rounded border-[#D9DBD5] dark:border-[#323643] accent-[#111214] dark:accent-[#D9F154]"
              />
              <span className="text-[#3D404A] dark:text-[#C9CDD4]">Skip existing CRM duplicates</span>
            </label>
          </div>

          <div className="md:col-span-3 flex items-center justify-end gap-2">
            <label className="text-[11px] text-[#555963] dark:text-[#A1A6B3] whitespace-nowrap">
              Leads / query:
            </label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] px-2.5 py-1.5 text-xs font-mono-tabular"
            >
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20 (Max)</option>
            </select>
          </div>
        </div>

        {/* PROGRESS BAR */}
        {(isRunning || progress.total > 0) && (
          <div className="rounded-2xl bg-[#F8F9F7] dark:bg-[#1C1F26] border border-[#E2E4DF] dark:border-[#282B35] p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-[#111214] dark:text-[#F4F5F7] inline-flex items-center gap-2">
                {isRunning && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#D9F154]" />}
                {progress.currentLabel}
              </span>
              <span className="font-mono-tabular text-[#555963] dark:text-[#A1A6B3]">
                {progress.completed} / {progress.total} searches
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[#E5E7E2] dark:bg-[#23262F] overflow-hidden">
              <div
                className="h-full bg-[#111214] dark:bg-[#D9F154] transition-all duration-200"
                style={{
                  width: `${
                    progress.total > 0
                      ? Math.round((progress.completed / progress.total) * 100)
                      : 0
                  }%`,
                }}
              />
            </div>
          </div>
        )}

        {scanError && (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-700/60 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200">
            {scanError}
          </div>
        )}
      </div>

      {/* KPI STRIP & PARSED CRM TABLE */}
      {parsedRecords.length > 0 ? (
        <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-5 sm:p-6 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#282B35]">
              <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Businesses Found</div>
              <div className="text-lg font-bold font-mono-tabular mt-0.5 text-[#111214] dark:text-[#F4F5F7]">
                {stats.total}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#282B35]">
              <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">With Phone / Website</div>
              <div className="text-lg font-bold font-mono-tabular mt-0.5 text-[#111214] dark:text-[#F4F5F7]">
                {stats.withPhone} / {stats.withWebsite}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#282B35]">
              <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Parsed into CRM</div>
              <div className="text-lg font-bold font-mono-tabular mt-0.5 text-[#111214] dark:text-[#F4F5F7]">
                {stats.newlyImported}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#FAFAF8] dark:bg-[#1C1F26] border border-[#E5E7E2] dark:border-[#282B35]">
              <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">Awaiting Manual Import</div>
              <div className="text-lg font-bold font-mono-tabular mt-0.5 text-[#111214] dark:text-[#F4F5F7]">
                {stats.pendingCount}
              </div>
            </div>
          </div>

          {/* TOOLBAR: FILTERS & BATCH ACTIONS */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `All (${parsedRecords.length})` },
                  {
                    id: 'in-crm',
                    label: `In CRM (${parsedRecords.filter((r) => r.inCrm).length})`,
                  },
                  {
                    id: 'hot',
                    label: `Hot (${parsedRecords.filter((r) => r.lead.leadPriority === 'Hot').length})`,
                  },
                  {
                    id: 'has-phone',
                    label: `Has Phone (${stats.withPhone})`,
                  },
                  {
                    id: 'no-website',
                    label: `No Website (${parsedRecords.filter((r) => !r.lead.website).length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setResultFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                    resultFilter === tab.id
                      ? 'bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214]'
                      : 'bg-[#F3F4F1] dark:bg-[#23262F] text-[#3D404A] dark:text-[#C9CDD4] hover:bg-[#E5E7E2] dark:hover:bg-[#2C2F3A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#7A7E87] dark:text-[#9CA3AF] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Filter parsed leads..."
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-[#D9DBD5] dark:border-[#323643] bg-[#FAFAF8] dark:bg-[#1C1F26] text-[#111214] dark:text-[#F4F5F7] placeholder:text-[#9A9FA8] dark:placeholder:text-[#6B7280] text-xs w-48"
                />
              </div>

              {stats.pendingCount > 0 && (
                <button
                  type="button"
                  onClick={handleImportAllPending}
                  className="px-3 py-1.5 rounded-xl bg-[#D9F154] text-[#111214] text-xs font-semibold flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Import {stats.pendingCount} to CRM
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  onPlotBatchOnMap(
                    filteredRecords.map((r) => r.lead),
                    selectedCities[0]?.name || selectedCountry.name,
                    selectedNiches[0]?.label || 'High-Ticket Leads'
                  )
                }
                className="px-3 py-1.5 rounded-xl bg-[#111214] dark:bg-[#252833] text-white dark:border dark:border-[#323643] text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-[#D9F154]" />
                Plot Batch on Map
              </button>
            </div>
          </div>

          {/* DATA GRID */}
          <div className="overflow-x-auto border border-[#E2E4DF] dark:border-[#282B35] rounded-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F9F7] dark:bg-[#1C1F26] border-b border-[#E2E4DF] dark:border-[#282B35] text-[11px] font-semibold text-[#555963] dark:text-[#9CA3AF]">
                  <th className="py-2.5 px-3.5">Business &amp; Address</th>
                  <th className="py-2.5 px-3">Niche / City</th>
                  <th className="py-2.5 px-3">Contact Info</th>
                  <th className="py-2.5 px-3 text-right">Rating</th>
                  <th className="py-2.5 px-3 text-right">Est. Deal</th>
                  <th className="py-2.5 px-3.5 text-right">CRM &amp; Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEE8] dark:divide-[#242731]">
                {filteredRecords.map((rec) => {
                  const { lead, prospect } = rec;
                  return (
                    <tr key={lead.placeId} className="hover:bg-[#FAFAF8] dark:hover:bg-[#1C1F26]/70 transition-colors">
                      <td className="py-3 px-3.5 max-w-[260px]">
                        <div className="font-semibold text-[#111214] dark:text-[#F4F5F7] truncate">
                          {lead.businessName}
                        </div>
                        <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF] truncate mt-0.5">
                          {lead.formattedAddress}
                        </div>
                        <div className="text-[11px] text-[#3D404A] dark:text-[#C9CDD4] mt-0.5 truncate">
                          {lead.leadPriority} · {lead.opportunitySignals[0]}
                        </div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="font-medium text-[#111214] dark:text-[#F4F5F7]">{rec.nicheLabel}</div>
                        <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                          {rec.city}
                          {rec.stateOrRegion ? `, ${rec.stateOrRegion}` : ''}
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          {lead.phone ? (
                            <button
                              type="button"
                              onClick={async () => {
                                const copied = await safeCopyText(lead.phone);
                                if (copied) {
                                  setCopiedPhoneId(lead.placeId);
                                  setTimeout(() => setCopiedPhoneId(null), 1400);
                                }
                              }}
                              className="inline-flex items-center gap-1 font-mono-tabular text-[#111214] dark:text-[#D9F154] hover:underline cursor-pointer"
                            >
                              <Phone className="w-3 h-3 text-[#555963] dark:text-[#A1A6B3]" />
                              {lead.phone}
                              <Copy className="w-2.5 h-2.5 text-[#666A73] dark:text-[#9CA3AF]" />
                              {copiedPhoneId === lead.placeId && (
                                <span className="text-[10px] text-emerald-700 dark:text-[#6AE4C0] font-semibold">
                                  Copied
                                </span>
                              )}
                            </button>
                          ) : (
                            <div className="text-[11px] text-[#7A7E87] dark:text-[#8E93A0]">No phone listed</div>
                          )}
                          <div className="flex items-center gap-2.5 text-[11px]">
                            {ensureHttpUrl(lead.website) ? (
                              <a
                                href={ensureHttpUrl(lead.website)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 underline text-[#3D404A] dark:text-[#C9CDD4]"
                              >
                                <Globe className="w-3 h-3" />
                                Website
                                <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            ) : (
                              <span className="text-red-700 dark:text-[#FF8A80] font-semibold">Missing Website</span>
                            )}
                            {ensureHttpUrl(lead.googleMapsUri) && (
                              <a
                                href={ensureHttpUrl(lead.googleMapsUri)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 underline text-[#111214] dark:text-[#D9F154]"
                              >
                                <Store className="w-3 h-3" />
                                GMB
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right font-mono-tabular whitespace-nowrap">
                        {lead.rating !== null ? (
                          <div>
                            <span className="font-semibold text-[#111214] dark:text-[#F4F5F7]">
                              {lead.rating.toFixed(1)}★
                            </span>
                            <div className="text-[11px] text-[#666A73] dark:text-[#9CA3AF]">
                              {lead.reviewCount} reviews
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-[#7A7E87] dark:text-[#8E93A0]">N/A</span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-right font-mono-tabular whitespace-nowrap font-semibold text-[#111214] dark:text-[#F4F5F7]">
                        {formatMoney(prospect.ticketUsd, currency)}
                      </td>

                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              onOpenGmailForLead({
                                placeId: lead.placeId,
                                prospectId: rec.inCrm ? prospect.id : undefined,
                                contactName: 'Owner',
                                roleTitle: prospect.roleTitle,
                                businessName: lead.businessName,
                                email: '',
                                phone: lead.phone,
                                website: lead.website,
                                address: lead.formattedAddress,
                                city: rec.city,
                                stateOrRegion: rec.stateOrRegion,
                                country: selectedCountry.name,
                                niche: prospect.categoryNiche,
                                rating: lead.rating,
                                reviewCount: lead.reviewCount,
                                opportunitySignals: lead.opportunitySignals,
                                serviceInterest: prospect.serviceInterest,
                                competitorAdvantage: prospect.competitorAdvantage,
                                ticketUsd: prospect.ticketUsd,
                                googleMapsUri: lead.googleMapsUri,
                                leadPriority: lead.leadPriority,
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-[#F3F4F1] dark:bg-[#23262F] hover:bg-[#D9F154] dark:hover:bg-[#D9F154] text-[#111214] dark:text-[#F4F5F7] dark:hover:text-[#111214] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
                          >
                            <Mail className="w-3 h-3" />
                            Gmail
                          </button>

                          {rec.inCrm ? (
                            <span className="px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-700/60 text-emerald-800 dark:text-[#6AE4C0] text-[11px] font-semibold inline-flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              {rec.wasDuplicate ? 'Already in CRM' : 'In CRM'}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleImportSingleRecord(lead.placeId)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#111214] dark:bg-[#D9F154] text-[#D9F154] dark:text-[#111214] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              Add CRM
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        !isRunning && (
          <div className="bg-white dark:bg-[#16181E] rounded-3xl border border-[#E2E4DF] dark:border-[#282B35] p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-[#F3F4F1] dark:bg-[#23262F] text-[#111214] dark:text-[#D9F154] flex items-center justify-center mx-auto">
              <Building2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-display font-bold text-[#111214] dark:text-[#F4F5F7]">
              Ready to Prospect High-Ticket Businesses via Google Maps
            </h3>
            <p className="text-xs text-[#666A73] dark:text-[#9CA3AF] max-w-md mx-auto">
              Choose your target niches and cities above, then click{' '}
              <span className="font-semibold text-[#111214] dark:text-[#D9F154]">Run Automated Scan</span> to pull
              live business profiles, phone numbers, websites, and ratings straight into your CRM.
            </p>
          </div>
        )
      )}
    </div>
  );
};
